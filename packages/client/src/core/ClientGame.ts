import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";

// Side-effect imports required for tree-shaking: enable scene picking
import "@babylonjs/core/Culling/ray";

import { Room } from "@colyseus/sdk";

import { IsometricCamera } from "../camera/IsometricCamera";
import { DungeonRenderer } from "../dungeon/DungeonRenderer";
import { CharacterLoaderRegistry } from "../entities/CharacterLoaderRegistry";
import { PropRegistry } from "../entities/PropRegistry";
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
import { FxaaPostProcess } from "@babylonjs/core/PostProcesses/fxaaPostProcess";
import { SharpenPostProcess } from "@babylonjs/core/PostProcesses/sharpenPostProcess";
import {
  CloseCode,
  MessageType,
  AMBIENT_INTENSITY,
  ChatCategory,
  TutorialStep,
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
import { welcomeStore } from "../ui/stores/welcomeStore";
import { itemDefStore } from "../ui/stores/itemDefStore";
import { itemInstanceStore } from "../ui/stores/itemInstanceStore";
import { feedbackStore } from "../ui/stores/feedbackStore";
import { settingsStore } from "../ui/stores/settingsStore";
import type { GraphicsSettings } from "../ui/stores/settingsStore";
import { lobbyStore } from "../ui/stores/lobbyStore";
import { setChatSendFn, clearChatSendFn, resolveItemLinksToText } from "../ui/hud/itemLinkUtils";
import { t } from "../i18n/i18n";

export class ClientGame {
  private engine: Engine;
  private scene: Scene;
  public isoCamera: IsometricCamera;
  private dungeonRenderer: DungeonRenderer;
  private fogOfWar: FogOfWarSystem;
  private guiTexture: AdvancedDynamicTexture;

  // Colyseus
  private room: Room | null = null;

  private loaderRegistry: CharacterLoaderRegistry;
  private propRegistry: PropRegistry;
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
  private glowLayer: GlowLayer | null = null;
  private fxaaPostProcess: FxaaPostProcess | null = null;
  private fxaaAttached: boolean = true;
  private sharpenPostProcess: SharpenPostProcess | null = null;
  private sharpenAttached: boolean = true;
  private lastGraphics: GraphicsSettings;
  private renderObserver: Observer<Scene> | null = null;

  constructor(canvas: HTMLCanvasElement, room: Room) {
    const gfx = settingsStore.getSnapshot().graphics;
    this.engine = new Engine(canvas, gfx.antiAliasing, {
      preserveDrawingBuffer: true,
      stencil: true,
      audioEngine: true,
      adaptToDeviceRatio: gfx.hiDpi,
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);
    this.lastGraphics = gfx;

    // Apply initial graphics settings
    this.engine.setHardwareScalingLevel(1 / gfx.resolutionScale);
    this.scene.particlesEnabled = gfx.particles;

    this.isoCamera = new IsometricCamera(this.scene, canvas);
    this.setupLighting();
    this.fogOfWar = new FogOfWarSystem(this.scene, this.isoCamera.camera);

    this.loaderRegistry = new CharacterLoaderRegistry(this.scene);
    this.propRegistry = new PropRegistry(this.scene);
    this.dungeonRenderer = new DungeonRenderer(this.scene, this.propRegistry);
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
      propRegistry: this.propRegistry,
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
      getDistanceCull: () => self.stateSync.distanceCull,
      getRoom: () => self.room,
    });

    mountLoading();
    mountHud();
    this.room = room;
    // Register message listeners early so server messages sent during
    // handleJoin (e.g. TALENT_STATE, TUTORIAL_HINT) are not missed while loading assets.
    this.stateSync.connectMessageStores(room);

    // Tutorial handlers must be registered before asset loading — the server
    // sends WELCOME 1s after join, which would be missed if we waited for
    // model preload to finish before registering onMessage handlers.
    tutorialStore.setRoom(room);
    welcomeStore.setRoom(room);
    room.onMessage(MessageType.TUTORIAL_HINT, (msg: TutorialHintMessage) => {
      if (msg.step === TutorialStep.WELCOME) {
        welcomeStore.show();
        return;
      }
      tutorialStore.showHint(msg);
    });
    room.onMessage(MessageType.TUTORIAL_DISMISS, (msg: TutorialDismissMessage) => {
      tutorialStore.dismiss(msg.step, false);
    });

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
      // Pre-load character models + audio while connecting (with progress)
      const tasks = [
        () => this.loaderRegistry.preload(["warrior", "zombie", "golem"]),
        () => this.propRegistry.preloadAll(),
        () => this.soundManager.load(),
      ];
      let completed = 0;
      const total = tasks.length;
      await Promise.all(
        tasks.map((task) =>
          task().then(() => {
            completed++;
            // Models phase goes from 0% to 30%
            loadingStore.setProgress(Math.round((completed / total) * 30));
          }),
        ),
      );

      // Apply volume settings from settingsStore and subscribe to changes
      this.soundManager.applyVolumes(settingsStore.getSnapshot().volume);
      initUiSfxVolume(() => settingsStore.getSnapshot().volume);
      // Apply all initial graphics settings (glow, shadows, etc.)
      this.applyGraphicsAll(settingsStore.getSnapshot().graphics);

      this.settingsUnsub = settingsStore.subscribe(() => {
        const snap = settingsStore.getSnapshot();
        this.soundManager.applyVolumes(snap.volume);
        initUiSfxVolume(() => snap.volume);
        this.applyGraphicsChanges(snap.graphics);
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

      // Room is already connected (passed in via constructor from lobbyStore)
      const room = this.room!;

      // Persist reconnection data (localStorage survives tab close)
      localStorage.setItem("reconnectionToken", room.reconnectionToken);
      localStorage.setItem("reconnectionRoomId", room.roomId);
      // Clear reconnect state now that we've successfully joined
      if (authStore.getSnapshot().canReconnect) {
        authStore.clearReconnect();
      }
      adminStore.setRoom(room);
      hudStore.setRoom(room);
      gateStore.setRoom(room);
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
              clientPlayer.showChatBubble(resolveItemLinksToText(entry.text));
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

      // Connect item def store + item instance store to room for lazy loading
      itemDefStore.connect(room);
      itemInstanceStore.connect(room);

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
        // Intentional leave (e.g. "Leave Room" button) — handled by lobbyStore
        if (lobbyStore.isLeavingIntentionally()) {
          lobbyStore.clearLeavingFlag();
          return;
        }
        if (code === CloseCode.KICKED_DUPLICATE) {
          authStore.kick(t("kick.duplicate"));
        } else if (code === CloseCode.KICKED) {
          authStore.kick(t("kick.kicked"));
        } else if (code === CloseCode.DUNGEON_COMPLETED) {
          lobbyStore.returnToLobby();
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

    this.glowLayer = new GlowLayer("glow", this.scene);
    this.glowLayer.intensity = 0.4;

    // FXAA post-process for smoother edges (works on top of hardware AA)
    this.fxaaPostProcess = new FxaaPostProcess("fxaa", 1.0, this.isoCamera.camera);

    // Sharpen post-process for crisper edges
    this.sharpenPostProcess = new SharpenPostProcess("sharpen", 1.0, this.isoCamera.camera);
    this.sharpenPostProcess.colorAmount = 1.0;
    this.sharpenPostProcess.edgeAmount = 0.3;
  }

  /** Attach or detach a post-process from the camera. */
  private setPostProcessEnabled(
    pp: FxaaPostProcess | SharpenPostProcess,
    enabled: boolean,
    attachedFlag: "fxaaAttached" | "sharpenAttached",
  ): void {
    const cam = this.isoCamera.camera;
    if (enabled && !this[attachedFlag]) {
      cam.attachPostProcess(pp);
      this[attachedFlag] = true;
    } else if (!enabled && this[attachedFlag]) {
      cam.detachPostProcess(pp);
      this[attachedFlag] = false;
    }
  }

  /** Force-apply all graphics settings (used on startup). */
  private applyGraphicsAll(gfx: GraphicsSettings): void {
    if (this.glowLayer) this.glowLayer.isEnabled = gfx.glow;
    this.scene.particlesEnabled = gfx.particles;
    this.engine.setHardwareScalingLevel(1 / gfx.resolutionScale);
    if (this.fxaaPostProcess)
      this.setPostProcessEnabled(this.fxaaPostProcess, gfx.fxaa, "fxaaAttached");
    if (this.sharpenPostProcess)
      this.setPostProcessEnabled(this.sharpenPostProcess, gfx.sharpen, "sharpenAttached");
    const local = this.stateSync.players.get(this.stateSync.localSessionId);
    local?.setShadowConfig(gfx.shadows, gfx.shadowQuality);
    this.lastGraphics = gfx;
  }

  /** Apply only the graphics settings that changed since last check. */
  private applyGraphicsChanges(gfx: GraphicsSettings): void {
    const prev = this.lastGraphics;
    if (gfx === prev) return;

    if (gfx.glow !== prev.glow) {
      if (this.glowLayer) this.glowLayer.isEnabled = gfx.glow;
    }
    if (gfx.particles !== prev.particles) {
      this.scene.particlesEnabled = gfx.particles;
    }
    if (gfx.resolutionScale !== prev.resolutionScale) {
      this.engine.setHardwareScalingLevel(1 / gfx.resolutionScale);
    }
    if (gfx.fxaa !== prev.fxaa) {
      if (this.fxaaPostProcess)
        this.setPostProcessEnabled(this.fxaaPostProcess, gfx.fxaa, "fxaaAttached");
    }
    if (gfx.sharpen !== prev.sharpen) {
      if (this.sharpenPostProcess)
        this.setPostProcessEnabled(this.sharpenPostProcess, gfx.sharpen, "sharpenAttached");
    }
    if (gfx.shadows !== prev.shadows || gfx.shadowQuality !== prev.shadowQuality) {
      const local = this.stateSync.players.get(this.stateSync.localSessionId);
      local?.setShadowConfig(gfx.shadows, gfx.shadowQuality);
    }
    this.lastGraphics = gfx;
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
    welcomeStore.reset();
    itemInstanceStore.reset();
    // Only clear reconnection token if NOT in reconnectable state
    if (!authStore.getSnapshot().canReconnect) {
      localStorage.removeItem("reconnectionToken");
      localStorage.removeItem("reconnectionRoomId");
    }
    // Notify server of permanent leave so it removes the player immediately
    if (lobbyStore.isLeavingIntentionally()) {
      this.room?.send(MessageType.LEAVE_ROOM);
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
    this.propRegistry.dispose();
    this.loaderRegistry.dispose();
    this.fogOfWar.dispose();
    this.dungeonRenderer.dispose();
    this.guiTexture.dispose();
    this.engine.dispose();
  }
}
