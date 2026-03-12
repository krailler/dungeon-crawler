import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

const LERP_SPEED = 0.2;
const HIT_FLASH_DURATION = 0.12;

export class ClientEnemy {
  public mesh: Mesh;
  public isDead: boolean = false;

  // Target state from server
  private targetX: number = 0;
  private targetZ: number = 0;
  private targetRotY: number = 0;
  private previousHealth: number;

  // Hit flash
  private baseMaterial: StandardMaterial;
  private hitMaterial: StandardMaterial;
  private hitFlashTimer: number = 0;

  constructor(scene: Scene, id: string, initialHealth: number) {
    this.previousHealth = initialHealth;

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

    this.baseMaterial = new StandardMaterial(`enemyMat_${id}`, scene);
    this.baseMaterial.diffuseColor = new Color3(0.8, 0.2, 0.15);
    this.baseMaterial.specularColor = new Color3(0.2, 0.1, 0.1);
    this.mesh.material = this.baseMaterial;
    head.material = this.baseMaterial;

    this.hitMaterial = new StandardMaterial(`enemyHitMat_${id}`, scene);
    this.hitMaterial.diffuseColor = new Color3(1, 1, 1);
    this.hitMaterial.specularColor = new Color3(0.5, 0.5, 0.5);

    this.mesh.position.y = 0.6;
  }

  /** Called when server state changes */
  setServerState(x: number, z: number, rotY: number, health: number, isDead: boolean): void {
    this.targetX = x;
    this.targetZ = z;
    this.targetRotY = rotY;

    // Trigger hit flash when health decreases
    if (health < this.previousHealth && !isDead) {
      this.triggerHitFlash();
    }
    this.previousHealth = health;

    if (isDead && !this.isDead) {
      this.isDead = true;
      this.mesh.dispose();
    }
  }

  /** Snap position immediately */
  snapToPosition(x: number, z: number): void {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.targetX = x;
    this.targetZ = z;
  }

  /** Interpolate toward server state each frame */
  update(dt: number): void {
    if (this.isDead) return;

    this.mesh.position.x += (this.targetX - this.mesh.position.x) * LERP_SPEED;
    this.mesh.position.z += (this.targetZ - this.mesh.position.z) * LERP_SPEED;
    this.mesh.rotation.y = this.targetRotY;

    // Hit flash timer
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.mesh.material = this.baseMaterial;
        const head = this.mesh.getChildMeshes()[0];
        if (head) head.material = this.baseMaterial;
      }
    }
  }

  private triggerHitFlash(): void {
    this.mesh.material = this.hitMaterial;
    const head = this.mesh.getChildMeshes()[0];
    if (head) head.material = this.hitMaterial;
    this.hitFlashTimer = HIT_FLASH_DURATION;
  }

  dispose(): void {
    if (!this.isDead) {
      this.mesh.dispose();
    }
  }
}
