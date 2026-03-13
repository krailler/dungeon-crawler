import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Control } from "@babylonjs/gui/2D/controls/control";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import type { AnimName, CharacterInstance } from "./CharacterAssetLoader";

/** Smoothing factor — higher = snappier (0 = no movement, 1 = instant) */
const LERP_FACTOR = 12;
const HIT_FLASH_DURATION = 0.12;

/** Distance threshold to consider the enemy "moving" */
const MOVE_THRESHOLD = 0.05;

export class ClientEnemy {
  /** Invisible anchor mesh used for positioning */
  public mesh: Mesh;
  /** GLB model root — child of mesh */
  public modelRoot: TransformNode | null = null;
  /** All GLB child meshes — for shadow casting and hit flash */
  public modelMeshes: AbstractMesh[] = [];
  public isDead: boolean = false;

  private animations: Map<AnimName, AnimationGroup> = new Map();
  private currentAnim: AnimName | null = null;

  // Target state from server
  private targetX: number = 0;
  private targetZ: number = 0;
  private targetRotY: number = 0;
  private previousHealth: number;

  // Hit flash
  private baseMaterials: Map<AbstractMesh, Material | null> = new Map();
  private hitMaterial: PBRMaterial;
  private hitFlashTimer: number = 0;

  // Floating health bar
  private healthBarBg: Rectangle;
  private healthBarFill: Rectangle;

  constructor(scene: Scene, id: string, initialHealth: number, guiTexture: AdvancedDynamicTexture) {
    this.previousHealth = initialHealth;

    // Invisible anchor for position/rotation
    this.mesh = MeshBuilder.CreateGround(`enemy_${id}`, { width: 0.1, height: 0.1 }, scene);
    this.mesh.visibility = 0;
    this.mesh.isPickable = false;
    this.mesh.position.y = 0;

    // White PBR material for hit flash
    this.hitMaterial = new PBRMaterial(`enemyHitMat_${id}`, scene);
    this.hitMaterial.albedoColor = new Color3(1, 1, 1);
    this.hitMaterial.metallic = 0;
    this.hitMaterial.roughness = 1;

    // --- Floating health bar ---
    this.healthBarBg = new Rectangle(`enemyHpBg_${id}`);
    this.healthBarBg.widthInPixels = 60;
    this.healthBarBg.heightInPixels = 8;
    this.healthBarBg.cornerRadius = 2;
    this.healthBarBg.thickness = 1;
    this.healthBarBg.color = "#555";
    this.healthBarBg.background = "#222";
    this.healthBarBg.linkOffsetY = -70;
    this.healthBarBg.isVisible = false;

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

  /** Attach the loaded GLB character instance. */
  attachModel(instance: CharacterInstance): void {
    this.modelRoot = instance.root;
    this.modelMeshes = instance.meshes;
    this.animations = instance.animations;

    // Parent to our invisible anchor and scale
    this.modelRoot.parent = this.mesh;
    this.modelRoot.scaling.setAll(0.5);

    // Fix GLB material: exported with alpha=0 — force opaque
    for (const m of this.modelMeshes) {
      const mat = m.material;
      if (mat instanceof PBRMaterial) {
        mat.alpha = 1;
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
        mat.backFaceCulling = true;
      }
      // Store original materials for hit flash restore
      this.baseMaterials.set(m, m.material);
    }

    // Start idle animation
    this.playAnimation("idle");
  }

  private playAnimation(name: AnimName): void {
    if (this.currentAnim === name) return;

    if (this.currentAnim) {
      const current = this.animations.get(this.currentAnim);
      current?.stop();
    }

    const anim = this.animations.get(name);
    if (anim) {
      anim.start(true);
      this.currentAnim = name;
    }
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

    if (health < this.previousHealth && !isDead) {
      this.triggerHitFlash();
    }
    this.previousHealth = health;

    this.updateHealthBar(health, maxHealth);

    if (isDead && !this.isDead) {
      this.isDead = true;
      this.healthBarBg.dispose();
      for (const [, anim] of this.animations) {
        anim.dispose();
      }
      this.modelRoot?.dispose(false, true);
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
    const dx = this.targetX - this.mesh.position.x;
    const dz = this.targetZ - this.mesh.position.z;
    this.mesh.position.x += dx * t;
    this.mesh.position.z += dz * t;

    // Smooth rotation
    const targetRot = this.targetRotY + Math.PI;
    let delta = targetRot - this.mesh.rotation.y;
    delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    this.mesh.rotation.y += delta * (1 - Math.exp(-LERP_FACTOR * dt));

    // Switch animation based on movement
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > MOVE_THRESHOLD) {
      this.playAnimation("run");
    } else {
      this.playAnimation("idle");
    }

    // Hit flash timer
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.restoreMaterials();
      }
    }
  }

  private updateHealthBar(health: number, maxHealth: number): void {
    if (maxHealth <= 0) return;
    const ratio = health / maxHealth;
    this.healthBarBg.isVisible = ratio < 1 && health > 0;
    this.healthBarFill.width = Math.max(ratio, 0);
    if (ratio > 0.6) {
      this.healthBarFill.background = "#4caf50";
    } else if (ratio > 0.3) {
      this.healthBarFill.background = "#ff9800";
    } else {
      this.healthBarFill.background = "#f44336";
    }
  }

  private triggerHitFlash(): void {
    for (const m of this.modelMeshes) {
      m.material = this.hitMaterial;
    }
    this.hitFlashTimer = HIT_FLASH_DURATION;
  }

  private restoreMaterials(): void {
    for (const m of this.modelMeshes) {
      const original = this.baseMaterials.get(m);
      if (original) m.material = original;
    }
  }

  dispose(): void {
    this.healthBarBg.dispose();
    if (!this.isDead) {
      for (const [, anim] of this.animations) {
        anim.dispose();
      }
      this.modelRoot?.dispose(false, true);
      this.mesh.dispose();
    }
    this.hitMaterial.dispose();
  }
}
