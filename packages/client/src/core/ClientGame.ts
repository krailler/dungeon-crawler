import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

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
import { hudStore, mountHud, disposeHud } from "../ui/hudStore";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { TileMap, unpackSetId, tileSetNameFromId, AMBIENT_INTENSITY } from "@dungeon/shared";
import { t } from "../i18n/i18n";

const SERVER_URL = "ws://localhost:3000";

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

  constructor(canvas: HTMLCanvasElement) {
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
    mountHud();
    this.client = new Client(SERVER_URL);

    // Game loop — render + interpolation
    this.scene.onBeforeRenderObservable.add(() => {
      this.update(this.engine.getDeltaTime() / 1000);
    });

    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    window.addEventListener("resize", () => {
      this.engine.resize();
    });

    // Load assets then connect to server
    this.init();
  }

  private async init(): Promise<void> {
    hudStore.setConnection("connecting", "");
    try {
      // Pre-load character models + audio while connecting
      await Promise.all([
        this.playerLoader.load(),
        this.enemyLoader.load(),
        this.soundManager.load(),
      ]);

      // Suppress Babylon.js default "click to unmute" button — our game
      // naturally unlocks audio on the first player click (move command)
      if (Engine.audioEngine) {
        Engine.audioEngine.useCustomUnlockedButton = true;
      }

      const room = await this.client.joinOrCreate("dungeon");
      this.room = room;
      this.localSessionId = room.sessionId;
      console.log("[Client] Joined room:", room.sessionId);

      hudStore.setConnection(
        "connected",
        t("connection.info", {
          roomId: room.roomId,
          sessionId: room.sessionId.slice(0, 6).toUpperCase(),
        }),
      );

      this.setupStateListeners(room);

      // Ping polling — every 2 seconds
      room.ping((ms: number) => hudStore.setPing(ms));
      this.pingInterval = window.setInterval(() => {
        room.ping((ms: number) => hudStore.setPing(ms));
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Client] Failed to connect:", err);
      hudStore.setConnection("error", msg);
    }
  }

  private setupStateListeners(room: Room): void {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const $ = getStateCallbacks(room as any) as any;
    const state$ = $(room.state);

    // Listen for tileMap data (sent once on join)
    state$.listen("tileMapData", (value: string) => {
      if (!value) return;
      const flat = JSON.parse(value) as number[];
      const width = (room.state as any).mapWidth;
      const height = (room.state as any).mapHeight;
      const tileMap = TileMap.fromSerialized(width, height, flat);

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
        console.log("[Client] Assets loaded, rendering dungeon");
        this.dungeonRenderer.render(tileMap, floorVariants, wallVariants);

        // Setup input after dungeon renders (sends move commands to server)
        new InputManager(this.scene, this.dungeonRenderer.getFloorMeshes(), room);

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
      });
    });

    // Players added
    state$.players.onAdd((player: any, sessionId: string) => {
      const isLocal = sessionId === this.localSessionId;
      const clientPlayer = new ClientPlayer(
        this.scene,
        isLocal,
        sessionId,
        isLocal ? this.soundManager : undefined,
      );
      clientPlayer.snapToPosition(player.x, player.z);
      clientPlayer.setServerState(player.x, player.z, player.rotY);
      this.players.set(sessionId, clientPlayer);

      if (isLocal) {
        this.isoCamera.camera.target = new Vector3(player.x, 0, player.z);
      }

      // Attach GLB character model
      const charInstance = this.playerLoader.instantiate(`char_${sessionId}`);
      clientPlayer.attachModel(charInstance);

      // Add model meshes as shadow casters for local player's torch
      for (const m of clientPlayer.modelMeshes) {
        this.addShadowCaster(m);
      }

      const name = isLocal
        ? t("player.you")
        : t("player.other", { id: sessionId.slice(0, 4).toUpperCase() });
      hudStore.setMember({
        id: sessionId,
        name,
        health: player.health,
        maxHealth: player.maxHealth,
        isLocal,
      });

      // Listen to changes on this player
      $(player).onChange(() => {
        clientPlayer.setServerState(player.x, player.z, player.rotY, player.animState);

        hudStore.updateMember(sessionId, {
          health: player.health,
          maxHealth: player.maxHealth,
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
    });

    // Enemies added
    state$.enemies.onAdd((enemy: any, id: string) => {
      const clientEnemy = new ClientEnemy(this.scene, id, enemy.health, this.guiTexture);
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
    // Interpolate all entities toward server state
    for (const [, player] of this.players) {
      player.update(dt);
    }

    for (const [, enemy] of this.enemies) {
      enemy.update(dt);
    }

    // Camera follows local player
    const localPlayer = this.players.get(this.localSessionId);
    if (localPlayer) {
      const pos = localPlayer.getWorldPosition();
      this.isoCamera.followTarget(pos);

      // Wall occlusion
      if (this.wallOcclusion) {
        this.wallOcclusion.update(pos.x, pos.z);
      }

      // Fog of war
      this.fogOfWar.update(pos.x, pos.z);
    }

    // FPS
    hudStore.updateFPS(dt);
  }

  private addShadowCaster(mesh: AbstractMesh): void {
    const local = this.players.get(this.localSessionId);
    if (local?.shadowGenerator) {
      local.shadowGenerator.addShadowCaster(mesh);
    }
  }

  dispose(): void {
    this.room?.leave();
    window.clearInterval(this.pingInterval);
    disposeHud();
    this.soundManager.dispose();
    this.fogOfWar.dispose();
    this.dungeonRenderer.dispose();
    this.engine.dispose();
  }
}
