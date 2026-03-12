import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PLAYER_SPEED, PLAYER_HEALTH, TILE_SIZE } from "../utils/Constants";

export class Player {
  public mesh: Mesh;
  public health: number;
  public maxHealth: number;
  public speed: number;
  public path: Vector3[] = [];
  public currentPathIndex: number = 0;
  public isMoving: boolean = false;

  constructor(scene: Scene, spawnPosition: Vector3) {
    this.health = PLAYER_HEALTH;
    this.maxHealth = PLAYER_HEALTH;
    this.speed = PLAYER_SPEED;

    // Capsule-like player: cylinder body + sphere head
    this.mesh = MeshBuilder.CreateCylinder(
      "player",
      { height: 1.4, diameterTop: 0.6, diameterBottom: 0.7, tessellation: 12 },
      scene,
    );

    const head = MeshBuilder.CreateSphere("playerHead", { diameter: 0.65, segments: 8 }, scene);
    head.position.y = 0.9;
    head.parent = this.mesh;

    const material = new StandardMaterial("playerMat", scene);
    material.diffuseColor = new Color3(0.2, 0.6, 0.9);
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    this.mesh.material = material;
    head.material = material;

    this.mesh.position = spawnPosition.clone();
    this.mesh.position.y = 0.7;
  }

  setPath(path: Vector3[]): void {
    if (path.length === 0) return;
    this.path = path;
    this.currentPathIndex = 0;
    this.isMoving = true;
  }

  update(dt: number): void {
    if (!this.isMoving || this.currentPathIndex >= this.path.length) {
      this.isMoving = false;
      return;
    }

    const target = this.path[this.currentPathIndex];
    const current = this.mesh.position;
    const direction = new Vector3(target.x - current.x, 0, target.z - current.z);
    const distance = direction.length();

    if (distance < 0.15) {
      this.currentPathIndex++;
      if (this.currentPathIndex >= this.path.length) {
        this.isMoving = false;
      }
      return;
    }

    direction.normalize();
    const moveAmount = this.speed * dt;
    const step = Math.min(moveAmount, distance);

    current.x += direction.x * step;
    current.z += direction.z * step;

    // Rotate to face movement direction
    const angle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = angle;
  }

  getWorldPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  getTilePosition(): { x: number; y: number } {
    return {
      x: Math.round(this.mesh.position.x / TILE_SIZE),
      y: Math.round(this.mesh.position.z / TILE_SIZE),
    };
  }
}
