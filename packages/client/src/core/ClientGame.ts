import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

// Side-effect imports required for tree-shaking: enable scene picking
import "@babylonjs/core/Culling/ray";

import { Client, Room, getStateCallbacks } from "@colyseus/sdk";

import { IsometricCamera } from "../camera/IsometricCamera";
import { DungeonRenderer } from "../dungeon/DungeonRenderer";
import { ClientPlayer } from "../entities/ClientPlayer";
import { ClientEnemy } from "../entities/ClientEnemy";
import { InputManager } from "./InputManager";
import { WallOcclusionSystem } from "../systems/WallOcclusionSystem";
import { HUD } from "../ui/HUD";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TileMap } from "@dungeon/shared";

const SERVER_URL = "ws://localhost:3000";

export class ClientGame {
  private engine: Engine;
  private scene: Scene;
  public isoCamera: IsometricCamera;
  private dungeonRenderer: DungeonRenderer;
  private wallOcclusion: WallOcclusionSystem | null = null;
  private hud: HUD;
  private guiTexture: AdvancedDynamicTexture;

  // Colyseus
  private client: Client;
  private room: Room | null = null;

  // Entities synced from server
  private players: Map<string, ClientPlayer> = new Map();
  private enemies: Map<string, ClientEnemy> = new Map();
  private localSessionId: string = "";

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);

    this.isoCamera = new IsometricCamera(this.scene, canvas);
    this.setupLighting();

    this.dungeonRenderer = new DungeonRenderer(this.scene);
    this.guiTexture = AdvancedDynamicTexture.CreateFullscreenUI("ui", true, this.scene);
    this.hud = new HUD();
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

    // Connect to server
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const room = await this.client.joinOrCreate("dungeon");
      this.room = room;
      this.localSessionId = room.sessionId;
      console.log("[Client] Joined room:", room.sessionId);

      this.setupStateListeners(room);
    } catch (err) {
      console.error("[Client] Failed to connect:", err);
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
      this.dungeonRenderer.render(tileMap);

      // Setup input after dungeon renders (sends move commands to server)
      new InputManager(this.scene, this.dungeonRenderer.getFloorMeshes(), room);

      // Setup wall occlusion
      this.wallOcclusion = new WallOcclusionSystem(
        this.scene,
        this.isoCamera.camera,
        this.dungeonRenderer.getWallMeshes(),
      );
    });

    // Players added
    state$.players.onAdd((player: any, sessionId: string) => {
      const isLocal = sessionId === this.localSessionId;
      const clientPlayer = new ClientPlayer(this.scene, isLocal, sessionId);
      clientPlayer.snapToPosition(player.x, player.z);
      clientPlayer.setServerState(player.x, player.z, player.rotY);
      this.players.set(sessionId, clientPlayer);

      if (isLocal) {
        this.isoCamera.camera.target = new Vector3(player.x, 0, player.z);
      }

      const name = isLocal ? "You" : `Player ${sessionId.slice(0, 4).toUpperCase()}`;
      this.hud.setMember({
        id: sessionId,
        name,
        health: player.health,
        maxHealth: player.maxHealth,
        isLocal,
      });

      // Listen to changes on this player
      $(player).onChange(() => {
        clientPlayer.setServerState(player.x, player.z, player.rotY);

        this.hud.updateMember(sessionId, {
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
      this.hud.removeMember(sessionId);
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
      );
      this.enemies.set(id, clientEnemy);

      // Listen to changes on this enemy
      $(enemy).onChange(() => {
        clientEnemy.setServerState(
          enemy.x,
          enemy.z,
          enemy.rotY,
          enemy.health,
          enemy.maxHealth,
          enemy.isDead,
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
    ambient.intensity = 0.7;
    ambient.diffuse = new Color3(0.6, 0.6, 0.7);
    ambient.groundColor = new Color3(0.2, 0.2, 0.25);
  }

  private update(dt: number): void {
    // Interpolate all entities toward server state
    for (const [, player] of this.players) {
      player.update();
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
    }

    // FPS
    this.hud.updateFPS(dt);
  }

  dispose(): void {
    this.room?.leave();
    this.hud.dispose();
    this.dungeonRenderer.dispose();
    this.engine.dispose();
  }
}
