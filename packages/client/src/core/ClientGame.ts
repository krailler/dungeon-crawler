import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";

// Side-effect imports required for tree-shaking: enable scene picking
import "@babylonjs/core/Culling/ray";

import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

import { IsometricCamera } from "../camera/IsometricCamera";
import { DungeonRenderer } from "../dungeon/DungeonRenderer";
import { ClientPlayer } from "../entities/ClientPlayer";
import { ClientEnemy } from "../entities/ClientEnemy";
import { CharacterAssetLoader } from "../entities/CharacterAssetLoader";
import { InputManager } from "./InputManager";
import { WallOcclusionSystem } from "../systems/WallOcclusionSystem";
import { FogOfWarSystem } from "../systems/FogOfWarSystem";
import { SoundManager } from "../audio/SoundManager";
import { hudStore, mountHud, disposeHud } from "../ui/stores/hudStore";
import { debugStore, type DebugSnapshot } from "../ui/stores/debugStore";
import { adminStore } from "../ui/stores/adminStore";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import {
  CloseCode,
  MessageType,
  TileMap,
  unpackSetId,
  tileSetNameFromId,
  AMBIENT_INTENSITY,
  TILE_SIZE,
  MINIMAP_DISCOVERY_RADIUS,
} from "@dungeon/shared";
import type { CombatLogMessage, ChatEntry, CommandInfo, DebugPathsMessage } from "@dungeon/shared";
import { minimapStore } from "../ui/stores/minimapStore";
import {
  loadingStore,
  LoadingPhase,
  mountLoading,
  disposeLoading,
} from "../ui/stores/loadingStore";
import { authStore } from "../ui/stores/authStore";
import { chatStore } from "../ui/stores/chatStore";
import { setChatSendFn, clearChatSendFn } from "../ui/hud/ChatPanel";
import { t } from "../i18n/i18n";

export class ClientGame {
  private engine: Engine;
  private scene: Scene;
  public isoCamera: IsometricCamera;
  private dungeonRenderer: DungeonRenderer;
  private wallOcclusion: WallOcclusionSystem | null = null;
  private fogOfWar: FogOfWarSystem;
  private guiTexture: AdvancedDynamicTexture;

  // Colyseus
  private client: Client;
  private room: Room | null = null;

  private playerLoader: CharacterAssetLoader;
  private enemyLoader: CharacterAssetLoader;
  private soundManager: SoundManager;

  // Entities synced from server
  private players: Map<string, ClientPlayer> = new Map();
  private enemies: Map<string, ClientEnemy> = new Map();
  private localSessionId: string = "";
  private pingInterval: number = 0;
  private inputManager: InputManager | null = null;
  private lastDebug: DebugSnapshot = debugStore.getSnapshot();
  private onKeyDown: (ev: KeyboardEvent) => void;
  private onResize: () => void;
  private ambientReady: boolean = false;
  private onPointerDown: (() => void) | null = null;
  // Pre-allocated map reused each frame for minimap enemy positions
  private activeEnemiesMap: Map<string, { x: number; z: number }> = new Map();
  // Debug path visualization
  private debugPathLines: Map<string, LinesMesh> = new Map();

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
    this.playerLoader = new CharacterAssetLoader(this.scene, "/models/characters/player");
    this.enemyLoader = new CharacterAssetLoader(this.scene, "/models/characters/zombie");
    this.soundManager = new SoundManager(this.scene);
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, this.scene);
    mountLoading();
    mountHud();
    this.client = colyseusClient;

    // Game loop — render + interpolation
    this.scene.onBeforeRenderObservable.add(() => {
      this.update(this.engine.getDeltaTime() / 1000);
    });

    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    this.onResize = () => {
      this.engine.resize();
    };
    window.addEventListener("resize", this.onResize);

    // Keyboard shortcuts
    this.onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "m" || ev.key === "M") {
        minimapStore.toggle();
      }
    };
    window.addEventListener("keydown", this.onKeyDown);

    // Load assets then connect to server
    this.init();
  }

  private async init(): Promise<void> {
    hudStore.setConnection("connecting", "");
    loadingStore.setPhase(LoadingPhase.MODELS);
    try {
      // Pre-load character models + audio while connecting
      await Promise.all([
        this.playerLoader.load(),
        this.enemyLoader.load(),
        this.soundManager.load(),
      ]);

      // Suppress Babylon.js default "click to unmute" button — we unlock
      // the AudioContext ourselves on the first user click (pointerdown).
      if (Engine.audioEngine) {
        Engine.audioEngine.useCustomUnlockedButton = true;
      }

      // Unlock AudioContext on first user gesture and start ambient if ready
      this.onPointerDown = () => {
        Engine.audioEngine?.audioContext?.resume();
        this.tryStartAmbient();
      };
      window.addEventListener("pointerdown", this.onPointerDown, { once: true });

      loadingStore.setPhase(LoadingPhase.SERVER);

      // Try to reconnect using a saved token (e.g. after page reload)
      let room: Room;
      const savedToken = localStorage.getItem("reconnectionToken");
      if (savedToken) {
        try {
          console.log("[Client] Attempting reconnection…");
          room = await this.client.reconnect(savedToken);
          console.log("[Client] Reconnected to room:", room.sessionId);
        } catch (err) {
          console.warn("[Client] Reconnection failed, joining new room:", err);
          localStorage.removeItem("reconnectionToken");
          room = await this.client.joinOrCreate("dungeon");
        }
      } else {
        room = await this.client.joinOrCreate("dungeon");
      }

      // Persist reconnection token (localStorage survives tab close)
      localStorage.setItem("reconnectionToken", room.reconnectionToken);

      this.room = room;
      adminStore.setRoom(room);
      hudStore.setRoom(room);
      this.localSessionId = room.sessionId;
      minimapStore.setLocalSessionId(room.sessionId);
      console.log("[Client] Joined room:", room.sessionId);

      // Register all message listeners FIRST (before state listeners)
      // to ensure we don't miss messages sent during onJoin

      // Chat messages from server
      room.onMessage(MessageType.CHAT_ENTRY, (entry: ChatEntry) => {
        chatStore.addMessage(entry);

        // Show chat bubble above player's head for player messages
        if (entry.category === "player" && entry.sender) {
          for (const [sessionId, clientPlayer] of this.players) {
            const member = hudStore.getSnapshot().members.find((m) => m.id === sessionId);
            if (member && member.name === entry.sender) {
              clientPlayer.showChatBubble(entry.text);
              break;
            }
          }
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

      // Debug: path visualization
      room.onMessage(MessageType.DEBUG_PATHS, (msg: DebugPathsMessage) => {
        this.updateDebugPaths(msg);
      });

      hudStore.setConnection(
        "connected",
        t("connection.info", {
          roomId: room.roomId,
          sessionId: room.sessionId.slice(0, 6).toUpperCase(),
        }),
      );

      loadingStore.setPhase(LoadingPhase.DUNGEON_ASSETS);
      this.setupStateListeners(room);

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
        } else {
          authStore.kick(t("connection.lost"));
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Client] Failed to connect:", err);
      hudStore.setConnection("error", msg);
      loadingStore.setPhase(LoadingPhase.ERROR);
    }
  }

  private setupStateListeners(room: Room): void {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const $ = getStateCallbacks(room as any) as any;
    const state$ = $(room.state);

    // Track dungeon seed + tick rate for admin panel
    state$.listen("dungeonSeed", (value: number) => {
      adminStore.setSeed(value);
    });
    state$.listen("tickRate", (value: number) => {
      adminStore.setTickRate(value);
    });

    // Listen for tileMap data (sent once on join)
    state$.listen("tileMapData", (value: string) => {
      if (!value) return;
      const flat = JSON.parse(value) as number[];
      const width = (room.state as any).mapWidth;
      const height = (room.state as any).mapHeight;
      const tileMap = TileMap.fromSerialized(width, height, flat);
      minimapStore.setTileMap(tileMap);

      // Parse packed floor variant data from server
      const variantRaw = (room.state as any).floorVariantData;
      const floorVariants: number[] = variantRaw ? JSON.parse(variantRaw) : [];

      // Parse packed wall variant data from server
      const wallVariantRaw = (room.state as any).wallVariantData;
      const wallVariants: number[] = wallVariantRaw ? JSON.parse(wallVariantRaw) : [];

      // Scan packed values to find which tile sets are actually used (floors)
      const usedFloorSets = new Set<string>();
      for (const packed of floorVariants) {
        if (packed === 0) continue;
        const setId = unpackSetId(packed);
        const name = tileSetNameFromId(setId);
        if (name) usedFloorSets.add(name);
      }

      // Scan packed values to find which wall tile sets are used
      const usedWallSets = new Set<string>();
      for (const packed of wallVariants) {
        if (packed === 0) continue;
        const setId = unpackSetId(packed);
        const name = tileSetNameFromId(setId);
        if (name) usedWallSets.add(name);
      }

      // Load only the sets this dungeon needs, then render
      const floorSetNames = Array.from(usedFloorSets);
      const wallSetNames = Array.from(usedWallSets);
      console.log("[Client] Loading floor tile sets:", floorSetNames);
      console.log("[Client] Loading wall tile sets:", wallSetNames);
      this.dungeonRenderer.loadAssets(floorSetNames, wallSetNames).then(() => {
        loadingStore.setPhase(LoadingPhase.DUNGEON_RENDER);
        console.log("[Client] Assets loaded, rendering dungeon");
        this.dungeonRenderer.render(tileMap, floorVariants, wallVariants);

        // Setup input after dungeon renders (sends move commands to server)
        this.inputManager = new InputManager(
          this.scene,
          this.dungeonRenderer.getFloorMeshes(),
          room,
        );

        // Setup wall occlusion (with wall decoration map for toggling)
        this.wallOcclusion = new WallOcclusionSystem(
          this.scene,
          this.isoCamera.camera,
          this.dungeonRenderer.getWallMeshes(),
          this.dungeonRenderer.getWallDecoMap(),
        );

        // Enable shadow receiving on floor meshes
        for (const mesh of this.dungeonRenderer.getFloorMeshes()) {
          mesh.receiveShadows = true;
        }

        // Loading complete — fade out loading screen
        loadingStore.setPhase(LoadingPhase.COMPLETE);
        loadingStore.startFadeOut();

        // Mark ambient as ready — actual playback starts on first user click
        // (AudioContext requires a user gesture to unlock)
        this.ambientReady = true;
        this.tryStartAmbient();
      });
    });

    // Players added
    state$.players.onAdd((player: any, sessionId: string) => {
      const isLocal = sessionId === this.localSessionId;
      const displayName = player.characterName || sessionId.slice(0, 4).toUpperCase();
      const clientPlayer = new ClientPlayer(
        this.scene,
        isLocal,
        sessionId,
        displayName,
        this.guiTexture,
        this.soundManager,
      );
      clientPlayer.snapToPosition(player.x, player.z);
      clientPlayer.setServerState(player.x, player.z, player.rotY);
      this.players.set(sessionId, clientPlayer);

      if (isLocal) {
        this.isoCamera.camera.target = new Vector3(player.x, 0, player.z);
        authStore.setRole(player.role);
      }

      // Attach GLB character model
      const charInstance = this.playerLoader.instantiate(`char_${sessionId}`);
      clientPlayer.attachModel(charInstance);

      // Add model meshes as shadow casters for local player's torch
      for (const m of clientPlayer.modelMeshes) {
        this.addShadowCaster(m);
      }

      const name = player.characterName || sessionId.slice(0, 4).toUpperCase();
      const localStats = isLocal
        ? {
            strength: player.strength,
            vitality: player.vitality,
            agility: player.agility,
            attackDamage: player.attackDamage,
            defense: player.defense,
          }
        : undefined;
      hudStore.setMember({
        id: sessionId,
        name,
        health: player.health,
        maxHealth: player.maxHealth,
        isLocal,
        online: player.online,
        isLeader: player.isLeader,
        level: player.level,
        stats: localStats,
      });

      // Listen to changes on this player
      $(player).onChange(() => {
        clientPlayer.setServerState(player.x, player.z, player.rotY, player.animState);

        hudStore.updateMember(sessionId, {
          health: player.health,
          maxHealth: player.maxHealth,
          online: player.online,
          isLeader: player.isLeader,
          level: player.level,
          ...(isLocal && {
            stats: {
              strength: player.strength,
              vitality: player.vitality,
              agility: player.agility,
              attackDamage: player.attackDamage,
              defense: player.defense,
            },
          }),
        });
      });
    });

    // Players removed
    state$.players.onRemove((_player: any, sessionId: string) => {
      const clientPlayer = this.players.get(sessionId);
      if (clientPlayer) {
        clientPlayer.dispose();
        this.players.delete(sessionId);
      }
      hudStore.removeMember(sessionId);
      minimapStore.removePlayer(sessionId);
    });

    // Enemies added
    state$.enemies.onAdd((enemy: any, id: string) => {
      const clientEnemy = new ClientEnemy(
        this.scene,
        id,
        enemy.health,
        this.guiTexture,
        this.soundManager,
      );
      clientEnemy.snapToPosition(enemy.x, enemy.z);
      clientEnemy.setServerState(
        enemy.x,
        enemy.z,
        enemy.rotY,
        enemy.health,
        enemy.maxHealth,
        enemy.isDead,
        enemy.animState,
      );
      // Attach zombie GLB model
      const enemyInstance = this.enemyLoader.instantiate(`enemy_${id}`);
      clientEnemy.attachModel(enemyInstance);

      this.enemies.set(id, clientEnemy);
      for (const m of clientEnemy.modelMeshes) {
        this.addShadowCaster(m);
      }

      // Listen to changes on this enemy
      $(enemy).onChange(() => {
        clientEnemy.setServerState(
          enemy.x,
          enemy.z,
          enemy.rotY,
          enemy.health,
          enemy.maxHealth,
          enemy.isDead,
          enemy.animState,
        );
      });
    });

    // Enemies removed
    state$.enemies.onRemove((_enemy: any, id: string) => {
      const clientEnemy = this.enemies.get(id);
      if (clientEnemy) {
        clientEnemy.dispose();
        this.enemies.delete(id);
      }
    });
  }

  private setupLighting(): void {
    const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), this.scene);
    ambient.intensity = AMBIENT_INTENSITY;
    ambient.diffuse = new Color3(0.4, 0.4, 0.55);
    ambient.groundColor = new Color3(0.1, 0.1, 0.15);

    const glow = new GlowLayer("glow", this.scene);
    glow.intensity = 0.4;
  }

  private update(dt: number): void {
    // Apply debug toggles (only when changed)
    this.applyDebugFlags();

    // Interpolate all entities toward server state
    for (const [, player] of this.players) {
      player.update(dt);
    }

    for (const [, enemy] of this.enemies) {
      enemy.update(dt);
    }

    // Local player faces cursor while holding click
    const localPlayer = this.players.get(this.localSessionId);
    if (localPlayer && this.inputManager) {
      const holdTarget = this.inputManager.getHoldTarget();
      if (holdTarget) {
        localPlayer.setFacingTarget(holdTarget.x, holdTarget.z);
      } else {
        localPlayer.clearFacingTarget();
      }
    }

    // Camera follows local player
    if (localPlayer) {
      const pos = localPlayer.getWorldPosition();

      // Free camera: don't follow player
      const debug = debugStore.getSnapshot();
      if (!debug.freeCamera) {
        this.isoCamera.followTarget(pos);
      }

      // Wall occlusion
      if (this.wallOcclusion && debug.wallOcclusion) {
        this.wallOcclusion.update(pos.x, pos.z);
      }

      // Fog of war
      this.fogOfWar.update(pos.x, pos.z);

      // Minimap: reveal tiles around local player
      const tileX = Math.floor(pos.x / TILE_SIZE);
      const tileY = Math.floor(pos.z / TILE_SIZE);
      minimapStore.revealAround(tileX, tileY, MINIMAP_DISCOVERY_RADIUS);
    }

    // Minimap: update all player positions (silent, no emit)
    for (const [sessionId, player] of this.players) {
      const p = player.getWorldPosition();
      minimapStore.updatePlayerPosition(sessionId, p.x, p.z);
    }

    // Minimap: update active enemy positions (moving or attacking only)
    this.activeEnemiesMap.clear();
    for (const [id, enemy] of this.enemies) {
      if (enemy.isActive) {
        const ep = enemy.getWorldPosition();
        this.activeEnemiesMap.set(id, { x: ep.x, z: ep.z });
      }
    }
    minimapStore.setActiveEnemies(this.activeEnemiesMap);

    // Single batched emit per frame (only when minimap is visible)
    minimapStore.flush();

    // FPS
    hudStore.updateFPS(dt);
  }

  private applyDebugFlags(): void {
    const debug = debugStore.getSnapshot();
    if (debug === this.lastDebug) return;

    if (debug.fog !== this.lastDebug.fog) {
      this.fogOfWar.setEnabled(debug.fog);
    }
    if (debug.freeCamera !== this.lastDebug.freeCamera) {
      this.isoCamera.setFreeCamera(debug.freeCamera);
    }
    if (debug.wireframe !== this.lastDebug.wireframe) {
      this.scene.forceWireframe = debug.wireframe;
    }
    if (debug.ambient !== this.lastDebug.ambient) {
      this.soundManager.setAmbientMuted(!debug.ambient);
    }
    if (debug.showPaths !== this.lastDebug.showPaths) {
      this.room?.send(MessageType.DEBUG_PATHS, { enabled: debug.showPaths });
      if (!debug.showPaths) {
        this.clearDebugPaths();
      }
    }

    this.lastDebug = debug;
  }

  private updateDebugPaths(msg: DebugPathsMessage): void {
    // Track which IDs are in this update
    const activeIds = new Set<string>();

    for (const entry of msg.paths) {
      activeIds.add(entry.id);

      // Build points: current position → each waypoint
      const points: Vector3[] = [new Vector3(entry.x, 0.15, entry.z)];
      for (const wp of entry.path) {
        points.push(new Vector3(wp.x, 0.15, wp.z));
      }

      if (points.length < 2) continue;

      const color =
        entry.kind === "player" ? new Color3(0.22, 0.74, 0.97) : new Color3(0.97, 0.44, 0.44);
      const colors = points.map(() => new Color4(color.r, color.g, color.b, 1));

      // Reuse or create line mesh
      const existing = this.debugPathLines.get(entry.id);
      if (existing) {
        existing.dispose();
      }

      const line = MeshBuilder.CreateLines(
        `debug_path_${entry.id}`,
        { points, colors, updatable: false },
        this.scene,
      );
      line.isPickable = false;
      this.debugPathLines.set(entry.id, line);
    }

    // Remove lines for entities no longer in the update
    for (const [id, line] of this.debugPathLines) {
      if (!activeIds.has(id)) {
        line.dispose();
        this.debugPathLines.delete(id);
      }
    }
  }

  private clearDebugPaths(): void {
    for (const [, line] of this.debugPathLines) {
      line.dispose();
    }
    this.debugPathLines.clear();
  }

  private addShadowCaster(mesh: AbstractMesh): void {
    const local = this.players.get(this.localSessionId);
    if (local?.shadowGenerator) {
      local.shadowGenerator.addShadowCaster(mesh);
    }
  }

  /** Try to start the ambient loop — only succeeds if dungeon loaded AND AudioContext unlocked */
  private tryStartAmbient(): void {
    if (!this.ambientReady) return;
    const ctx = Engine.audioEngine?.audioContext;
    if (ctx && ctx.state === "suspended") return; // Not yet unlocked
    this.soundManager.playAmbient();
    if (!debugStore.getSnapshot().ambient) {
      this.soundManager.setAmbientMuted(true);
    }
  }

  dispose(): void {
    adminStore.clearRoom();
    clearChatSendFn();
    chatStore.reset();
    localStorage.removeItem("reconnectionToken");
    this.room?.leave();
    window.clearInterval(this.pingInterval);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    if (this.onPointerDown) {
      window.removeEventListener("pointerdown", this.onPointerDown);
    }

    this.clearDebugPaths();

    // Dispose all entity instances
    for (const [, player] of this.players) {
      player.dispose();
    }
    this.players.clear();
    for (const [, enemy] of this.enemies) {
      enemy.dispose();
    }
    this.enemies.clear();

    // Dispose subsystems
    this.inputManager?.dispose();
    this.wallOcclusion?.dispose();

    disposeLoading();
    disposeHud();
    minimapStore.reset();
    this.soundManager.dispose();
    this.playerLoader.dispose();
    this.enemyLoader.dispose();
    this.fogOfWar.dispose();
    this.dungeonRenderer.dispose();
    this.guiTexture.dispose();
    this.engine.dispose();
  }
}
