import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";

// Side-effect imports required for tree-shaking: enable scene picking
import "@babylonjs/core/Culling/ray";
import { IsometricCamera } from "../camera/IsometricCamera";
import { DungeonGenerator } from "../dungeon/DungeonGenerator";
import { DungeonRenderer } from "../dungeon/DungeonRenderer";
import { Player } from "../entities/Player";
import { InputManager } from "./InputManager";
import { Pathfinder } from "../navigation/Pathfinder";
import { WallOcclusionSystem } from "../systems/WallOcclusionSystem";
const DUNGEON_WIDTH = 40;
const DUNGEON_HEIGHT = 40;
const DUNGEON_ROOMS = 7;

export class Game {
  private engine: Engine;
  private scene: Scene;
  public isoCamera: IsometricCamera;
  private dungeonRenderer: DungeonRenderer;
  public player: Player | null = null;
  private inputManager: InputManager | null = null;
  private pathfinder: Pathfinder | null = null;
  private wallOcclusion: WallOcclusionSystem | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.05, 1);

    this.isoCamera = new IsometricCamera(this.scene, canvas);
    this.setupLighting();

    // Generate and render dungeon
    this.dungeonRenderer = new DungeonRenderer(this.scene);
    const generator = new DungeonGenerator();
    const map = generator.generate(DUNGEON_WIDTH, DUNGEON_HEIGHT, DUNGEON_ROOMS);
    this.dungeonRenderer.render(map);

    // Spawn player
    const spawn = this.dungeonRenderer.getSpawnWorldPosition(map);
    if (spawn) {
      this.player = new Player(this.scene, spawn);
      this.isoCamera.camera.target = spawn.clone();
    }

    // Input and pathfinding
    this.inputManager = new InputManager(this.scene, this.dungeonRenderer.getFloorMeshes());
    this.pathfinder = new Pathfinder(map);
    this.wallOcclusion = new WallOcclusionSystem(
      this.scene,
      this.isoCamera.camera,
      this.dungeonRenderer.getWallMeshes(),
    );

    // Game logic runs before each render
    this.scene.onBeforeRenderObservable.add(() => {
      this.update(this.engine.getDeltaTime() / 1000);
    });

    // Render loop
    this.engine.runRenderLoop(() => {
      this.scene.render();
    });

    // Handle window resize
    window.addEventListener("resize", () => {
      this.engine.resize();
    });
  }

  private setupLighting(): void {
    const ambient = new HemisphericLight(
      "ambient",
      new Vector3(0, 1, 0),
      this.scene,
    );
    ambient.intensity = 0.7;
    ambient.diffuse = new Color3(0.6, 0.6, 0.7);
    ambient.groundColor = new Color3(0.2, 0.2, 0.25);
  }

  private update(dt: number): void {
    if (!this.player || !this.inputManager || !this.pathfinder) return;

    // Handle click-to-move
    const target = this.inputManager.consumeTarget();
    if (target) {
      const path = this.pathfinder.findPath(this.player.getWorldPosition(), target);
      if (path.length > 0) {
        this.player.setPath(path);
      }
    }

    // Update player movement
    this.player.update(dt);

    // Wall occlusion
    const playerPos = this.player.getWorldPosition();
    if (this.wallOcclusion) {
      this.wallOcclusion.update(playerPos.x, playerPos.z);
    }

    // Camera follows player
    this.isoCamera.followTarget(playerPos);
  }

  dispose(): void {
    this.dungeonRenderer.dispose();
    this.engine.dispose();
  }
}
