import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";

// Side-effect imports required for tree-shaking: enable scene picking
import "@babylonjs/core/Culling/ray";

import { Client, Room } from "@colyseus/sdk";

import { IsometricCamera } from "../camera/IsometricCamera";
import { DungeonRenderer } from "../dungeon/DungeonRenderer";
import { CharacterLoaderRegistry } from "../entities/CharacterLoaderRegistry";
import { FogOfWarSystem } from "../systems/FogOfWarSystem";
import { SoundManager } from "../audio/SoundManager";
import { preloadUiSounds, initUiSfxVolume, playUiSfx, disposeUiSounds } from "../audio/uiSfx";
import { StateSync } from "./StateSync";
import { ClientUpdateLoop } from "./ClientUpdateLoop";
import { hudStore, mountHud, disposeHud } from "../ui/stores/hudStore";
import { debugStore } from "../ui/stores/debugStore";
import { adminStore } from "../ui/stores/adminStore";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import {
  CloseCode,
  MessageType,
  AMBIENT_INTENSITY,
  ChatCategory,
  PROTOCOL_VERSION,
} from "@dungeon/shared";
import type {
  CombatLogMessage,
  ChatEntry,
  CommandInfo,
  DebugPathsMessage,
  TutorialHintMessage,
  TutorialDismissMessage,
  DamageDealtMessage,
  ItemCooldownMessage,
  ActionFeedbackMessage,
} from "@dungeon/shared";
import { minimapStore } from "../ui/stores/minimapStore";
import {
  loadingStore,
  LoadingPhase,
  mountLoading,
  disposeLoading,
} from "../ui/stores/loadingStore";
import { authStore } from "../ui/stores/authStore";
import { chatStore } from "../ui/stores/chatStore";
import { gateStore } from "../ui/stores/gateStore";
import { promptStore } from "../ui/stores/promptStore";
import { announcementStore } from "../ui/stores/announcementStore";
import { tutorialStore } from "../ui/stores/tutorialStore";
import { itemDefStore } from "../ui/stores/itemDefStore";
import { feedbackStore } from "../ui/stores/feedbackStore";
import { settingsStore } from "../ui/stores/settingsStore";
import { setChatSendFn, clearChatSendFn } from "../ui/hud/ChatPanel";
import { t } from "../i18n/i18n";

export class ClientGame {
  private engine: Engine;
  private scene: Scene;
  public isoCamera: IsometricCamera;
  private dungeonRenderer: DungeonRenderer;
  private fogOfWar: FogOfWarSystem;
  private guiTexture: AdvancedDynamicTexture;

  // Colyseus
  private client: Client;
  private room: Room | null = null;

  private loaderRegistry: CharacterLoaderRegistry;
  private soundManager: SoundManager;

  // Extracted modules
  private stateSync: StateSync;
  private updateLoop: ClientUpdateLoop;

  private pingInterval: number = 0;
  private onResize: () => void;
  private onFocusChange: () => void;
  private ambientReady: boolean = false;
  private onPointerDown: (() => void) | null = null;
  private settingsUnsub: (() => void) | null = null;
  private renderObserver: Observer<Scene> | null = null;

  constructor(canvas: HTMLCanvasElement, colyseusClient: Client) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      audioEngine: true,
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);

    this.isoCamera = new IsometricCamera(this.scene, canvas);
    this.setupLighting();
    this.fogOfWar = new FogOfWarSystem(this.scene, this.isoCamera.camera);

    this.dungeonRenderer = new DungeonRenderer(this.scene);
    this.loaderRegistry = new CharacterLoaderRegistry(this.scene);
    this.soundManager = new SoundManager(this.scene);
    preloadUiSounds();

    // Audio listener follows the local player (camera target) on the ground plane
    // so spatial sounds attenuate based on gameplay distance, not camera distance
    this.scene.audioListenerPositionProvider = () => this.isoCamera.camera.target;
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, this.scene);

    // Initialize extracted modules
    this.stateSync = new StateSync({
      scene: this.scene,
      isoCamera: this.isoCamera,
      dungeonRenderer: this.dungeonRenderer,
      loaderRegistry: this.loaderRegistry,
      soundManager: this.soundManager,
      fogOfWar: this.fogOfWar,
      guiTexture: this.guiTexture,
      addShadowCaster: (mesh: AbstractMesh) => this.addShadowCaster(mesh),
      onDungeonReady: () => {
        this.ambientReady = true;
        if (this.tryStartAmbient() && this.onPointerDown) {
          window.removeEventListener("pointerdown", this.onPointerDown);
        }
      },
    });

    const self = this;
    this.updateLoop = new ClientUpdateLoop({
      isoCamera: this.isoCamera,
      fogOfWar: this.fogOfWar,
      soundManager: this.soundManager,
      dungeonRenderer: this.dungeonRenderer,
      scene: this.scene,
      getPlayers: () => self.stateSync.players,
      getCreatures: () => self.stateSync.creatures,
      getLocalSessionId: () => self.stateSync.localSessionId,
      getInputManager: () => self.stateSync.inputManager,
      getWallOcclusion: () => self.stateSync.wallOcclusion,
      getRoom: () => self.room,
    });

    mountLoading();
    mountHud();
    this.client = colyseusClient;

    // Game loop — render + interpolation
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.updateLoop.update(this.engine.getDeltaTime() / 1000);
    });

    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    this.onResize = () => {
      this.engine.resize();
    };
    window.addEventListener("resize", this.onResize);

    // Throttle to ~30 FPS when window loses focus to save resources
    const BG_FRAME_TIME = 1000 / 30;
    const setThrottled = (throttled: boolean): void => {
      if (throttled) {
        this.engine.customAnimationFrameRequester = {
          requestAnimationFrame: (cb: FrameRequestCallback) =>
            window.setTimeout(cb, BG_FRAME_TIME) as unknown as number,
          cancelAnimationFrame: (id: number) => window.clearTimeout(id),
        };
      } else {
        this.engine.customAnimationFrameRequester = undefined as never;
      }
    };
    this.onFocusChange = () => setThrottled(document.hidden || !document.hasFocus());
    document.addEventListener("visibilitychange", this.onFocusChange);
    window.addEventListener("blur", this.onFocusChange);
    window.addEventListener("focus", this.onFocusChange);

    // Load assets then connect to server
    this.init();
  }

  private async init(): Promise<void> {
    hudStore.setConnection("connecting", "");
    loadingStore.setPhase(LoadingPhase.MODELS);
    try {
      // Pre-load character models + audio while connecting
      await Promise.all([
        this.loaderRegistry.preload(["warrior", "zombie"]),
        this.soundManager.load(),
      ]);

      // Apply volume settings from settingsStore and subscribe to changes
      this.soundManager.applyVolumes(settingsStore.getSnapshot().volume);
      initUiSfxVolume(() => settingsStore.getSnapshot().volume);
      this.settingsUnsub = settingsStore.subscribe(() => {
        this.soundManager.applyVolumes(settingsStore.getSnapshot().volume);
        initUiSfxVolume(() => settingsStore.getSnapshot().volume);
      });

      // Suppress Babylon.js default "click to unmute" button — we unlock
      // the AudioContext ourselves on the first user click (pointerdown).
      if (Engine.audioEngine) {
        Engine.audioEngine.useCustomUnlockedButton = true;
      }

      // Unlock AudioContext on user gesture and start ambient when ready
      this.onPointerDown = () => {
        Engine.audioEngine?.audioContext?.resume();
        if (this.tryStartAmbient()) {
          // Ambient started — no need to keep listening
          if (this.onPointerDown) {
            window.removeEventListener("pointerdown", this.onPointerDown);
          }
        }
      };
      window.addEventListener("pointerdown", this.onPointerDown);

      loadingStore.setPhase(LoadingPhase.SERVER);

      // Try to reconnect using a saved token (e.g. after page reload or "Reconnect" button)
      console.log(`[Client] Protocol version: ${PROTOCOL_VERSION}`);
      const joinOptions = { protocolVersion: PROTOCOL_VERSION };
      const isReconnectAttempt = authStore.getSnapshot().canReconnect;
      let room: Room;
      const savedToken = localStorage.getItem("reconnectionToken");
      if (savedToken) {
        try {
          console.log("[Client] Attempting reconnection…");
          room = await this.client.reconnect(savedToken);
          console.log("[Client] Reconnected to room:", room.sessionId);
        } catch (err) {
          console.warn("[Client] Reconnection failed:", err);
          localStorage.removeItem("reconnectionToken");
          if (isReconnectAttempt) {
            // User clicked "Reconnect" but session expired — show login
            authStore.reconnectFailed(t("reconnect.failed"));
            return;
          }
          // Normal page-load reconnect failure — join new room
          room = await this.client.joinOrCreate("dungeon", joinOptions);
        }
      } else {
        if (isReconnectAttempt) {
          // No token available — session is gone
          authStore.reconnectFailed(t("reconnect.failed"));
          return;
        }
        room = await this.client.joinOrCreate("dungeon", joinOptions);
      }

      // Persist reconnection token (localStorage survives tab close)
      localStorage.setItem("reconnectionToken", room.reconnectionToken);
      // Clear reconnect state now that we've successfully joined
      if (authStore.getSnapshot().canReconnect) {
        authStore.clearReconnect();
      }

      this.room = room;
      adminStore.setRoom(room);
      hudStore.setRoom(room);
      gateStore.setRoom(room);
      tutorialStore.setRoom(room);
      minimapStore.setLocalSessionId(room.sessionId);
      console.log("[Client] Joined room:", room.sessionId);

      // Register all message listeners FIRST (before state listeners)
      // to ensure we don't miss messages sent during onJoin

      // Chat messages from server — route by category
      room.onMessage(MessageType.CHAT_ENTRY, (entry: ChatEntry) => {
        // Announcements go to center-screen overlay, not chat panel
        if (entry.category === ChatCategory.ANNOUNCEMENT) {
          announcementStore.push(entry);
          playUiSfx("ui_announcement");
          return;
        }

        chatStore.addMessage(entry);

        // Show chat bubble above player's head for player messages
        if (entry.category === ChatCategory.PLAYER && entry.sender) {
          let isLocalMessage = false;
          for (const [sessionId, clientPlayer] of this.stateSync.players) {
            const member = hudStore.getSnapshot().members.find((m) => m.id === sessionId);
            if (member && member.name === entry.sender) {
              clientPlayer.showChatBubble(entry.text);
              if (sessionId === this.stateSync.localSessionId) isLocalMessage = true;
              break;
            }
          }
          this.soundManager.playSfx(isLocalMessage ? "chat_send" : "chat_receive");
        }
      });

      // Chat commands list from server
      room.onMessage(MessageType.CHAT_COMMANDS, (cmds: CommandInfo[]) => {
        chatStore.setCommands(cmds);
      });

      // Request command list now that listener is ready
      room.send(MessageType.CHAT_COMMANDS);

      // Wire send function so ChatPanel can send messages
      setChatSendFn((text: string) => {
        room.send(MessageType.CHAT_SEND, { text });
      });

      // Combat log — admin-only messages, logged when debug toggle is on
      room.onMessage(MessageType.COMBAT_LOG, (msg: CombatLogMessage) => {
        if (!debugStore.getSnapshot().combatLog) return;
        const arrow = msg.dir === "p2e" ? "⚔️→" : "💀→";
        const hpBar = `${msg.hp}/${msg.maxHp} HP`;
        const killTag = msg.kill ? " 💀 KILL" : "";
        console.log(
          `%c[Combat] ${arrow} ${msg.src} hit ${msg.tgt} for ${msg.dmg} dmg (${msg.atk} atk - ${msg.def} def) → ${hpBar}${killTag}`,
          msg.kill
            ? "color: #f87171; font-weight: bold"
            : msg.dir === "p2e"
              ? "color: #60a5fa"
              : "color: #fbbf24",
        );
      });

      // Floating damage text — sent only to the player who dealt the damage
      room.onMessage(MessageType.DAMAGE_DEALT, (msg: DamageDealtMessage) => {
        const creature = this.stateSync.creatures.get(msg.creatureId);
        if (creature) {
          creature.showDamageText(msg.dmg, msg.kill);
        }
      });

      // Debug: path visualization
      room.onMessage(MessageType.DEBUG_PATHS, (msg: DebugPathsMessage) => {
        this.updateLoop.handleDebugPaths(msg);
      });
      // Restore persisted debug toggles on reconnect
      if (debugStore.getSnapshot().showPaths) {
        room.send(MessageType.DEBUG_PATHS, { enabled: true });
      }
      if (debugStore.getSnapshot().showAllCreatures) {
        room.send(MessageType.TOGGLE_AOI, { enabled: false });
      }

      // Tutorial hints from server
      room.onMessage(MessageType.TUTORIAL_HINT, (msg: TutorialHintMessage) => {
        tutorialStore.showHint(msg);
      });

      // Server-initiated tutorial dismiss (e.g. revive completed, player died)
      room.onMessage(MessageType.TUTORIAL_DISMISS, (msg: TutorialDismissMessage) => {
        tutorialStore.dismiss(msg.step, false);
      });

      // Connect item def store to room for lazy loading
      itemDefStore.connect(room);

      // Item use confirmation from server (cooldown + sound)
      room.onMessage(MessageType.ITEM_COOLDOWN, (data: ItemCooldownMessage) => {
        if (data.duration > 0) {
          hudStore.setItemCooldown(data.itemId, data.duration);
        }
        if (data.useSound) {
          this.soundManager.playSfx(data.useSound);
        }
      });

      // Action feedback (skill/item use failures)
      room.onMessage(MessageType.ACTION_FEEDBACK, (data: ActionFeedbackMessage) => {
        feedbackStore.push(data.i18nKey);
      });

      hudStore.setConnection(
        "connected",
        t("connection.info", {
          roomId: room.roomId,
          sessionId: room.sessionId.slice(0, 6).toUpperCase(),
        }),
      );

      loadingStore.setPhase(LoadingPhase.DUNGEON_ASSETS);
      this.stateSync.setup(room, room.sessionId);

      // Ping polling — every 2 seconds
      room.ping((ms: number) => hudStore.setPing(ms));
      this.pingInterval = window.setInterval(() => {
        room.ping((ms: number) => hudStore.setPing(ms));
      }, 2000);

      // Connection dropped — show reconnecting state
      room.onDrop(() => {
        hudStore.setConnection("connecting", t("connection.reconnecting"));
      });

      // Successfully reconnected
      room.onReconnect(() => {
        hudStore.setConnection(
          "connected",
          t("connection.info", {
            roomId: room.roomId,
            sessionId: room.sessionId.slice(0, 6).toUpperCase(),
          }),
        );
      });

      // Permanently left (kicked, or reconnection failed)
      room.onLeave((code: number) => {
        if (code === CloseCode.KICKED_DUPLICATE) {
          authStore.kick(t("kick.duplicate"));
        } else if (code === CloseCode.KICKED) {
          authStore.kick(t("kick.kicked"));
        } else if (code === CloseCode.DUNGEON_COMPLETED) {
          authStore.kick(t("kick.dungeonCompleted"));
        } else {
          // Connection lost — session may still be alive on server for 5 min
          authStore.disconnect();
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Client] Failed to connect:", err);
      if (msg.includes("VERSION_MISMATCH")) {
        authStore.kick(t("kick.versionMismatch"));
      } else if (msg.includes("DUNGEON_STARTED")) {
        authStore.kick(t("kick.dungeonStarted"));
      } else {
        hudStore.setConnection("error", msg);
        loadingStore.setPhase(LoadingPhase.ERROR);
      }
    }
  }

  private setupLighting(): void {
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = AMBIENT_INTENSITY;
    ambient.diffuse = new Color3(0.4, 0.4, 0.55);
    ambient.groundColor = new Color3(0.1, 0.1, 0.15);

    const glow = new GlowLayer("glow", this.scene);
    glow.intensity = 0.4;
  }

  private addShadowCaster(mesh: AbstractMesh): void {
    const local = this.stateSync.players.get(this.stateSync.localSessionId);
    if (local?.shadowGenerator) {
      local.shadowGenerator.addShadowCaster(mesh);
    }
  }

  /** Try to start the ambient loop — returns true if started successfully */
  private tryStartAmbient(): boolean {
    if (!this.ambientReady) return false;
    const ctx = Engine.audioEngine?.audioContext;
    if (ctx && ctx.state === "suspended") return false; // Not yet unlocked
    this.soundManager.playAmbient();
    if (!debugStore.getSnapshot().ambient) {
      this.soundManager.setAmbientMuted(true);
    }
    return true;
  }

  dispose(): void {
    adminStore.clearRoom();
    clearChatSendFn();
    chatStore.reset();
    gateStore.reset();
    promptStore.reset();
    announcementStore.reset();
    tutorialStore.reset();
    // Only clear reconnection token if NOT in reconnectable state
    if (!authStore.getSnapshot().canReconnect) {
      localStorage.removeItem("reconnectionToken");
    }
    this.room?.leave();
    window.clearInterval(this.pingInterval);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onFocusChange);
    window.removeEventListener("blur", this.onFocusChange);
    window.removeEventListener("focus", this.onFocusChange);
    this.settingsUnsub?.();
    this.settingsUnsub = null;
    if (this.onPointerDown) {
      window.removeEventListener("pointerdown", this.onPointerDown);
    }

    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
    this.updateLoop.dispose();
    this.stateSync.dispose();

    disposeLoading();
    disposeHud();
    minimapStore.reset();
    this.soundManager.dispose();
    disposeUiSounds();
    this.loaderRegistry.dispose();
    this.fogOfWar.dispose();
    this.dungeonRenderer.dispose();
    this.guiTexture.dispose();
    this.engine.dispose();
  }
}
