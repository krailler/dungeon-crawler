import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TILE_SIZE } from "../utils/Constants";

const ENEMY_SPEED = 3;
const ENEMY_HEALTH = 30;

export class Enemy {
  public mesh: Mesh;
  public health: number;
  public maxHealth: number;
  public speed: number;
  public path: Vector3[] = [];
  public currentPathIndex: number = 0;
  public isMoving: boolean = false;
  public isDead: boolean = false;
  private baseMaterial: StandardMaterial | null = null;
  private hitMaterial: StandardMaterial | null = null;
  private hitFlashTimer: number = 0;

  constructor(scene: Scene, position: Vector3, id: number) {
    this.health = ENEMY_HEALTH;
    this.maxHealth = ENEMY_HEALTH;
    this.speed = ENEMY_SPEED;

    this.mesh = MeshBuilder.CreateCylinder(
      `enemy_${id}`,
      { height: 1.2, diameterTop: 0.5, diameterBottom: 0.8, tessellation: 8 },
      scene,
    );

    const head = MeshBuilder.CreateSphere(
      `enemyHead_${id}`,
      { diameter: 0.55, segments: 6 },
      scene,
    );
    head.position.y = 0.75;
    head.parent = this.mesh;

    const material = new StandardMaterial(`enemyMat_${id}`, scene);
    material.diffuseColor = new Color3(0.8, 0.2, 0.15);
    material.specularColor = new Color3(0.2, 0.1, 0.1);
    this.mesh.material = material;
    head.material = material;

    this.baseMaterial = material;

    const hitMat = new StandardMaterial(`enemyHitMat_${id}`, scene);
    hitMat.diffuseColor = new Color3(1, 1, 1);
    hitMat.specularColor = new Color3(0.5, 0.5, 0.5);
    this.hitMaterial = hitMat;

    this.mesh.position = position.clone();
    this.mesh.position.y = 0.6;
  }

  setPath(path: Vector3[]): void {
    if (path.length === 0) return;
    this.path = path;
    this.currentPathIndex = 0;
    this.isMoving = true;
  }

  update(dt: number): void {
    if (this.isDead) return;

    // Hit flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0 && this.baseMaterial) {
        this.mesh.material = this.baseMaterial;
        const head = this.mesh.getChildMeshes()[0];
        if (head) head.material = this.baseMaterial;
      }
    }

    if (!this.isMoving || this.currentPathIndex >= this.path.length) {
      this.isMoving = false;
      return;
    }

    const target = this.path[this.currentPathIndex];
    const current = this.mesh.position;
    const direction = new Vector3(
      target.x - current.x,
      0,
      target.z - current.z,
    );
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

    const angle = Math.atan2(direction.x, direction.z);
    this.mesh.rotation.y = angle;
  }

  takeDamage(amount: number): void {
    this.health -= amount;

    // Flash white on hit
    if (this.hitMaterial) {
      this.mesh.material = this.hitMaterial;
      const head = this.mesh.getChildMeshes()[0];
      if (head) head.material = this.hitMaterial;
      this.hitFlashTimer = 0.12;
    }

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.isMoving = false;
      this.mesh.dispose();
    }
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

  distanceTo(target: Vector3): number {
    const dx = this.mesh.position.x - target.x;
    const dz = this.mesh.position.z - target.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
