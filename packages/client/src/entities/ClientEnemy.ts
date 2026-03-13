import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Control } from "@babylonjs/gui/2D/controls/control";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";

/** Smoothing factor — higher = snappier (0 = no movement, 1 = instant) */
const LERP_FACTOR = 12;
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

  // Floating health bar
  private healthBarBg: Rectangle;
  private healthBarFill: Rectangle;

  constructor(scene: Scene, id: string, initialHealth: number, guiTexture: AdvancedDynamicTexture) {
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

    // --- Floating health bar ---
    this.healthBarBg = new Rectangle(`enemyHpBg_${id}`);
    this.healthBarBg.widthInPixels = 60;
    this.healthBarBg.heightInPixels = 8;
    this.healthBarBg.cornerRadius = 2;
    this.healthBarBg.thickness = 1;
    this.healthBarBg.color = "#555";
    this.healthBarBg.background = "#222";
    this.healthBarBg.linkOffsetY = -70;
    this.healthBarBg.isVisible = false; // hidden at full health

    this.healthBarFill = new Rectangle(`enemyHpFill_${id}`);
    this.healthBarFill.width = 1;
    this.healthBarFill.height = 1;
    this.healthBarFill.thickness = 0;
    this.healthBarFill.background = "#4caf50";
    this.healthBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    this.healthBarBg.addControl(this.healthBarFill);
    guiTexture.addControl(this.healthBarBg);
    this.healthBarBg.linkWithMesh(this.mesh);
  }

  /** Called when server state changes */
  setServerState(
    x: number,
    z: number,
    rotY: number,
    health: number,
    maxHealth: number,
    isDead: boolean,
  ): void {
    this.targetX = x;
    this.targetZ = z;
    this.targetRotY = rotY;

    // Trigger hit flash when health decreases
    if (health < this.previousHealth && !isDead) {
      this.triggerHitFlash();
    }
    this.previousHealth = health;

    this.updateHealthBar(health, maxHealth);

    if (isDead && !this.isDead) {
      this.isDead = true;
      this.healthBarBg.dispose();
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

    const t = 1 - Math.exp(-LERP_FACTOR * dt);
    this.mesh.position.x += (this.targetX - this.mesh.position.x) * t;
    this.mesh.position.z += (this.targetZ - this.mesh.position.z) * t;
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

  private updateHealthBar(health: number, maxHealth: number): void {
    if (maxHealth <= 0) return;

    const ratio = health / maxHealth;

    // Hide at full health, show when damaged
    this.healthBarBg.isVisible = ratio < 1 && health > 0;

    // Scale fill width
    this.healthBarFill.width = Math.max(ratio, 0);

    // Color by percentage: green > orange > red
    if (ratio > 0.6) {
      this.healthBarFill.background = "#4caf50";
    } else if (ratio > 0.3) {
      this.healthBarFill.background = "#ff9800";
    } else {
      this.healthBarFill.background = "#f44336";
    }
  }

  private triggerHitFlash(): void {
    this.mesh.material = this.hitMaterial;
    const head = this.mesh.getChildMeshes()[0];
    if (head) head.material = this.hitMaterial;
    this.hitFlashTimer = HIT_FLASH_DURATION;
  }

  dispose(): void {
    this.healthBarBg.dispose();
    if (!this.isDead) {
      this.mesh.dispose();
    }
  }
}
