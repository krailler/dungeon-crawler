import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import type { AnimName, CharacterInstance } from "./CharacterAssetLoader";
import { AnimationController } from "./AnimationController";
import type { SoundManager } from "../audio/SoundManager";
import { SelectionRing } from "./SelectionRing";

/** Smoothing factor — higher = snappier (0 = no movement, 1 = instant) */
const LERP_FACTOR = 12;
const HIT_FLASH_DURATION = 0.12;

/** Distance threshold to consider the creature "moving" */
const MOVE_THRESHOLD = 0.05;

/** Interval between footstep sounds for creatures (seconds) */
const CREATURE_FOOTSTEP_INTERVAL = 0.35;

export class ClientCreature {
  /** Creature ID from server state */
  public readonly id: string;
  /** Invisible anchor mesh used for positioning */
  public mesh: Mesh;
  /** GLB model root — child of mesh */
  public modelRoot: TransformNode | null = null;
  /** All GLB child meshes — for shadow casting and hit flash */
  public modelMeshes: AbstractMesh[] = [];
  public isDead: boolean = false;
  public isAggro: boolean = false;

  private animController: AnimationController;
  private soundManager: SoundManager | null = null;
  private footstepTimer: number = 0;
  private selectionRing: SelectionRing;

  // Target state from server
  private targetX: number = 0;
  private targetZ: number = 0;
  private targetRotY: number = 0;
  private previousHealth: number;

  // Hit flash
  private baseMaterials: Map<AbstractMesh, Material | null> = new Map();
  private hitMaterial: PBRMaterial;
  private hitFlashTimer: number = 0;

  // Floating health bar + level label
  private barAnchor: TransformNode;
  private healthBarContainer: Rectangle;
  private healthBarBg: Rectangle;
  private healthBarFill: Rectangle;
  private levelLabel: TextBlock;

  // Floating damage text
  private guiTexture: AdvancedDynamicTexture;
  private damageTexts: {
    label: TextBlock;
    anchor: TransformNode;
    age: number;
    duration: number;
  }[] = [];

  constructor(
    scene: Scene,
    id: string,
    initialHealth: number,
    guiTexture: AdvancedDynamicTexture,
    soundManager?: SoundManager,
  ) {
    this.id = id;
    this.animController = new AnimationController(soundManager ?? null);
    this.guiTexture = guiTexture;
    if (soundManager) {
      this.soundManager = soundManager;
      this.animController.setSpatialPosition(() => this.mesh.position);
    }
    this.previousHealth = initialHealth;

    // Invisible anchor for position/rotation
    this.mesh = MeshBuilder.CreateGround(`creature_${id}`, { width: 0.1, height: 0.1 }, scene);
    this.mesh.visibility = 0;
    this.mesh.isPickable = false;
    this.mesh.position.y = 0;

    this.selectionRing = new SelectionRing(id, new Color3(0.9, 0.2, 0.2), this.mesh, scene);

    // White PBR material for hit flash
    this.hitMaterial = new PBRMaterial(`creatureHitMat_${id}`, scene);
    this.hitMaterial.albedoColor = new Color3(1, 1, 1);
    this.hitMaterial.metallic = 0;
    this.hitMaterial.roughness = 1;

    // Anchor node at head height (matches player name anchor)
    this.barAnchor = new TransformNode(`creatureBarAnchor_${id}`, scene);
    this.barAnchor.parent = this.mesh;
    this.barAnchor.position.y = 2.2;

    // --- Floating health bar + level label ---
    // Container for both label and health bar
    this.healthBarContainer = new Rectangle(`creatureHpContainer_${id}`);
    this.healthBarContainer.widthInPixels = 70;
    this.healthBarContainer.heightInPixels = 24;
    this.healthBarContainer.thickness = 0;
    this.healthBarContainer.background = "transparent";
    this.healthBarContainer.linkOffsetY = 0;
    this.healthBarContainer.isVisible = false;

    // Level label above the bar
    this.levelLabel = new TextBlock(`creatureLvl_${id}`, "Lv.1");
    this.levelLabel.color = "#ccc";
    this.levelLabel.fontSize = 10;
    this.levelLabel.heightInPixels = 14;
    this.levelLabel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.levelLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.healthBarContainer.addControl(this.levelLabel);

    this.healthBarBg = new Rectangle(`creatureHpBg_${id}`);
    this.healthBarBg.widthInPixels = 60;
    this.healthBarBg.heightInPixels = 8;
    this.healthBarBg.cornerRadius = 2;
    this.healthBarBg.thickness = 1;
    this.healthBarBg.color = "#555";
    this.healthBarBg.background = "#222";
    this.healthBarBg.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;

    this.healthBarFill = new Rectangle(`creatureHpFill_${id}`);
    this.healthBarFill.width = 1;
    this.healthBarFill.height = 1;
    this.healthBarFill.thickness = 0;
    this.healthBarFill.background = "#4caf50";
    this.healthBarFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;

    this.healthBarBg.addControl(this.healthBarFill);
    this.healthBarContainer.addControl(this.healthBarBg);
    guiTexture.addControl(this.healthBarContainer);
    this.healthBarContainer.linkWithMesh(this.barAnchor);
  }

  /** Attach the loaded GLB character instance. */
  attachModel(instance: CharacterInstance): void {
    this.modelRoot = instance.root;
    this.modelMeshes = instance.meshes;
    this.animController.setAnimations(instance.animations);

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
      m.isPickable = false;
    }

    // Invisible hitbox cylinder for easier click targeting
    const hitbox = MeshBuilder.CreateCylinder(
      `creatureHitbox_${this.id}`,
      {
        diameter: 1.2,
        height: 2.0,
      },
      this.mesh.getScene(),
    );
    hitbox.parent = this.mesh;
    hitbox.position.y = 1.0;
    hitbox.visibility = 0;
    hitbox.isPickable = true;
    hitbox.metadata = { pickType: "creature", pickId: this.id };

    // Start idle animation
    this.animController.startIdle();
  }

  /** Set creature level (updates label) */
  setLevel(level: number): void {
    this.levelLabel.text = `Lv.${level}`;
  }

  /** Called when server state changes */
  setServerState(
    x: number,
    z: number,
    rotY: number,
    health: number,
    maxHealth: number,
    isDead: boolean,
    animState: string = "",
    isAggro: boolean = false,
  ): void {
    this.targetX = x;
    this.targetZ = z;
    this.targetRotY = rotY;
    this.isAggro = isAggro;

    if (health < this.previousHealth && !isDead) {
      this.triggerHitFlash();
    }
    this.previousHealth = health;

    this.updateHealthBar(health, maxHealth);

    // Trigger one-shot animation if server says so
    if (animState && !this.animController.isOneShotPlaying && !isDead) {
      this.animController.playOneShot(animState as AnimName);
    }

    if (isDead) {
      if (this.isDead) return; // Already processed death — avoid double dispose
      this.isDead = true;
      this.healthBarContainer.dispose();
      this.barAnchor.dispose();
      this.animController.dispose();
      this.modelRoot?.dispose(false, false);
      this.mesh.dispose();
    }
  }

  /** Whether creature is in combat (for minimap visibility) */
  get isActive(): boolean {
    if (this.isDead) return false;
    return this.isAggro;
  }

  getWorldPosition(): Vector3 {
    return this.mesh.position;
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

    // Update animation system (crossfade + sound timing)
    this.animController.update(dt);

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

    // Switch animation based on movement (only if not playing one-shot)
    if (!this.animController.isOneShotPlaying) {
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > MOVE_THRESHOLD) {
        this.animController.playLoop("run");

        // Spatial footstep sounds
        if (this.soundManager) {
          this.footstepTimer += dt;
          if (this.footstepTimer >= CREATURE_FOOTSTEP_INTERVAL) {
            this.soundManager.playSpatialFootstep(this.mesh.position);
            this.footstepTimer = 0;
          }
        }
      } else {
        this.animController.playLoop("idle");
        this.footstepTimer = 0;
      }
    }

    // Hit flash timer
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.restoreMaterials();
      }
    }

    // Animate floating damage texts
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const entry = this.damageTexts[i];
      entry.age += dt;
      const progress = entry.age / entry.duration;
      if (progress >= 1) {
        entry.label.dispose();
        entry.anchor.dispose();
        this.damageTexts.splice(i, 1);
        continue;
      }
      // Rise upward
      entry.anchor.position.y = 1.4 + progress * 1.2;
      // Fade out in last 40%
      entry.label.alpha = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;
      // Scale down slightly at end
      const scale = progress > 0.7 ? 1 - (progress - 0.7) * 0.5 : 1;
      entry.label.scaleX = scale;
      entry.label.scaleY = scale;
    }
  }

  private updateHealthBar(health: number, maxHealth: number): void {
    if (maxHealth <= 0) return;
    const ratio = health / maxHealth;
    this.healthBarContainer.isVisible = ratio < 1 && health > 0;
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

  /** Show a floating damage number above the creature */
  showDamageText(damage: number, isKill: boolean): void {
    if (this.isDead) return;

    // Determine visual style based on damage magnitude
    const isHeavy = damage >= 15;
    const fontSize = isKill ? 22 : isHeavy ? 18 : 14;
    const color = isKill ? "#ff4444" : isHeavy ? "#ff8800" : "#ffdd44";
    const duration = isKill ? 1.2 : 0.9;

    // Create anchor at creature position (will float upward in update())
    const scene = this.mesh.getScene();
    const anchor = new TransformNode(`dmgAnchor_${Date.now()}`, scene);
    anchor.parent = this.mesh;
    // Offset horizontally to spread multiple hits
    const spread = (Math.random() - 0.5) * 0.6;
    anchor.position.set(spread, 1.4, 0);

    const label = new TextBlock(`dmgText_${Date.now()}`, `${damage}`);
    label.color = color;
    label.fontSize = fontSize;
    label.fontWeight = isHeavy || isKill ? "bold" : "600";
    label.outlineWidth = 2;
    label.outlineColor = "#000000";
    label.resizeToFit = true;
    label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;

    this.guiTexture.addControl(label);
    label.linkWithMesh(anchor);
    label.linkOffsetY = -20;

    this.damageTexts.push({ label, anchor, age: 0, duration });
  }

  /** Show or hide the selection ring below the creature. */
  setSelected(selected: boolean): void {
    this.selectionRing.setSelected(selected && !this.isDead);
  }

  dispose(): void {
    this.selectionRing.dispose();
    for (const entry of this.damageTexts) {
      entry.label.dispose();
      entry.anchor.dispose();
    }
    this.damageTexts.length = 0;
    this.healthBarContainer.dispose();
    this.barAnchor.dispose();
    if (!this.isDead) {
      this.animController.dispose();
      this.modelRoot?.dispose(false, false);
      this.mesh.dispose();
    }
    this.hitMaterial.dispose();
  }
}
