import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { AnimName } from "./CharacterAssetLoader";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { TORCH_INTENSITY, TORCH_RANGE, TORCH_ANGLE } from "@dungeon/shared";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SelectionRing } from "./SelectionRing";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Control } from "@babylonjs/gui/2D/controls/control";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import type { CharacterInstance } from "./CharacterAssetLoader";
import { AnimationController } from "./AnimationController";
import type { SoundManager } from "../audio/SoundManager";

// Side-effect: shadow map support
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

/** Position smoothing factor — higher = snappier (0 = no movement, 1 = instant) */
const LERP_FACTOR = 6;

/** Rotation smoothing factor — lower = smoother turn */
const ROT_LERP_FACTOR = 10;

/** Interval between footstep sounds while running (seconds) */
const FOOTSTEP_INTERVAL = 0.32;

/** Animation speed when walking (not sprinting) — slower than the baked run animation */
const WALK_ANIM_SPEED = 0.4;
/** Animation speed when sprinting — full speed of the baked run animation */
const SPRINT_ANIM_SPEED = 1.0;
/** Footstep interval when sprinting (faster steps) */
const SPRINT_FOOTSTEP_INTERVAL = 0.22;

/** Distance threshold to consider the player "moving" */
const MOVE_THRESHOLD = 0.05;

/** How long the chat bubble stays fully visible (seconds) */
const BUBBLE_DURATION = 5;

/** Fade-out duration (seconds) */
const BUBBLE_FADE = 1;

/** Max width of the bubble in pixels */
const BUBBLE_MAX_WIDTH = 220;

/** Duration of the level-up particle effect (seconds) */
const LEVEL_UP_DURATION = 2.5;

export class ClientPlayer {
  /** Session ID */
  public readonly sessionId: string;
  /** Invisible anchor mesh used for positioning and torch parenting */
  public mesh: Mesh;
  /** GLB model root — child of mesh */
  public modelRoot: TransformNode | null = null;
  /** All GLB child meshes — for shadow casting */
  public modelMeshes: AbstractMesh[] = [];
  public isLocal: boolean;
  public torchLight: SpotLight | null = null;
  public shadowGenerator: ShadowGenerator | null = null;

  private scene: Scene;
  private animController: AnimationController;
  private soundManager: SoundManager | null = null;
  private lastAnimState: string = "";
  private footstepTimer: number = 0;

  // 3D anchor nodes for GUI elements (world-space, resolution-independent)
  private nameAnchor: TransformNode | null = null;
  private bubbleAnchor: TransformNode | null = null;

  // Floating name label
  private nameLabel: TextBlock | null = null;

  // Chat bubble
  private guiTexture: AdvancedDynamicTexture | null = null;
  private bubbleContainer: Rectangle | null = null;
  private bubbleText: TextBlock | null = null;
  private bubbleTimer: number = 0;

  /** Pending timers (e.g. particle effect cleanup) — cleared on dispose */
  private pendingTimers: ReturnType<typeof setTimeout>[] = [];

  // Target state from server
  private targetX: number = 0;
  private targetZ: number = 0;
  private targetRotY: number = 0;
  /** Whether the server says this player is sprinting */
  private sprinting: boolean = false;

  /** Client-side facing override — player looks toward this point while holding click */
  private facingTarget: { x: number; z: number } | null = null;

  private selectionRing: SelectionRing;

  constructor(
    scene: Scene,
    isLocal: boolean,
    id: string,
    name: string,
    guiTexture: AdvancedDynamicTexture,
    soundManager?: SoundManager,
  ) {
    this.sessionId = id;
    this.isLocal = isLocal;
    this.scene = scene;
    this.guiTexture = guiTexture;

    // Invisible anchor for position/rotation
    this.mesh = MeshBuilder.CreateGround(`player_${id}`, { width: 0.1, height: 0.1 }, scene);
    this.mesh.visibility = 0;
    this.mesh.isPickable = false;
    this.mesh.position.y = 0;

    this.selectionRing = new SelectionRing(id, new Color3(0.2, 0.5, 0.9), this.mesh, scene);

    // 3D anchor for name label (world-space Y so it scales with camera)
    this.nameAnchor = new TransformNode(`nameAnchor_${id}`, scene);
    this.nameAnchor.parent = this.mesh;
    this.nameAnchor.position.y = 2.2;

    // 3D anchor for chat bubble (slightly above name)
    this.bubbleAnchor = new TransformNode(`bubbleAnchor_${id}`, scene);
    this.bubbleAnchor.parent = this.mesh;
    this.bubbleAnchor.position.y = 2.7;

    // Floating name label (all players)
    this.nameLabel = new TextBlock(`playerName_${id}`, name);
    this.nameLabel.color = isLocal ? "#38bdf8" : "#e2e8f0";
    this.nameLabel.fontSize = 13;
    this.nameLabel.fontFamily = "system-ui, -apple-system, sans-serif";
    this.nameLabel.fontWeight = "600";
    this.nameLabel.outlineWidth = 3;
    this.nameLabel.outlineColor = "rgba(0, 0, 0, 0.8)";
    this.nameLabel.resizeToFit = true;
    guiTexture.addControl(this.nameLabel);
    this.nameLabel.linkWithMesh(this.nameAnchor);

    // Only local player gets a torch light
    if (isLocal) {
      this.torchLight = new SpotLight(
        `playerTorch_${id}`,
        new Vector3(0, 3, 0),
        new Vector3(0, -1, 0),
        TORCH_ANGLE,
        1,
        scene,
      );
      this.torchLight.intensity = TORCH_INTENSITY;
      this.torchLight.range = TORCH_RANGE;
      this.torchLight.diffuse = new Color3(1.0, 0.85, 0.6);
      this.torchLight.specular = new Color3(0.5, 0.4, 0.3);
      this.torchLight.parent = this.mesh;

      // PCF shadow generator
      this.shadowGenerator = new ShadowGenerator(1024, this.torchLight);
      this.shadowGenerator.usePercentageCloserFiltering = true;
      this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    }

    this.animController = new AnimationController(soundManager ?? null);
    if (soundManager) {
      this.soundManager = soundManager;
    }

    // Remote players use spatial audio (distance-based attenuation)
    if (!isLocal && soundManager) {
      this.animController.setSpatialPosition(() => this.mesh.position);
    }
  }

  /** Attach the loaded GLB character instance. */
  attachModel(instance: CharacterInstance, scale: number = 0.5): void {
    this.modelRoot = instance.root;
    this.modelMeshes = instance.meshes;
    this.animController.setAnimations(instance.animations);

    // Parent to our invisible anchor and scale to fit dungeon proportions
    this.modelRoot.parent = this.mesh;
    this.modelRoot.position.setAll(0);
    this.modelRoot.scaling.setAll(scale);

    // Fix GLB material: force opaque + tame emissive for dungeon lighting
    for (const m of this.modelMeshes) {
      const mat = m.material;
      if (mat instanceof PBRMaterial) {
        mat.alpha = 1;
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
        mat.backFaceCulling = true;
        // Meshy exports bake lighting into emissive — scale it down so the
        // glow layer doesn't blow it out, but keep enough for visibility
        mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 0.4);
      }
      m.isPickable = false;
    }

    // Invisible hitbox cylinder for easier click targeting
    const hitbox = MeshBuilder.CreateCylinder(
      `playerHitbox_${this.sessionId}`,
      {
        diameter: 1.2,
        height: 2.0,
      },
      this.scene,
    );
    hitbox.parent = this.mesh;
    hitbox.position.y = 1.0;
    hitbox.visibility = 0;
    hitbox.isPickable = true;
    hitbox.metadata = { pickType: "player", pickId: this.sessionId };

    // Add model meshes as shadow casters
    if (this.shadowGenerator) {
      for (const m of this.modelMeshes) {
        this.shadowGenerator.addShadowCaster(m);
      }
    }

    // Start idle animation
    this.animController.startIdle();
  }

  /** Called when server state changes */
  setServerState(
    x: number,
    z: number,
    rotY: number,
    animState: string = "",
    isSprinting: boolean = false,
  ): void {
    this.targetX = x;
    this.targetZ = z;
    this.targetRotY = rotY;
    this.sprinting = isSprinting;

    // Trigger one-shot animation if server says so (interrupts current one-shot)
    if (animState && animState !== this.lastAnimState) {
      this.animController.playOneShot(animState as AnimName);
    }
    this.lastAnimState = animState;
  }

  /** Snap position immediately (used on first spawn) */
  snapToPosition(x: number, z: number): void {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.targetX = x;
    this.targetZ = z;
  }

  /** Interpolate toward server state each frame */
  update(dt: number): void {
    // Update animation system (crossfade + sound timing)
    this.animController.update(dt);

    // Tick chat bubble timer
    if (this.bubbleTimer > 0 && this.bubbleContainer) {
      this.bubbleTimer -= dt;
      if (this.bubbleTimer <= 0) {
        this.bubbleContainer.isVisible = false;
      } else if (this.bubbleTimer < BUBBLE_FADE) {
        this.bubbleContainer.alpha = this.bubbleTimer / BUBBLE_FADE;
      }
    }

    const t = 1 - Math.exp(-LERP_FACTOR * dt);

    const dx = this.targetX - this.mesh.position.x;
    const dz = this.targetZ - this.mesh.position.z;
    this.mesh.position.x += dx * t;
    this.mesh.position.z += dz * t;

    // Compute target rotation — face cursor while holding, or use server rotation
    let desiredRotY: number;
    if (this.facingTarget) {
      const fx = this.facingTarget.x - this.mesh.position.x;
      const fz = this.facingTarget.z - this.mesh.position.z;
      // atan2(x, z) gives rotation in Babylon's Y-axis convention + PI offset
      desiredRotY = Math.atan2(fx, fz) + Math.PI;
    } else {
      desiredRotY = this.targetRotY + Math.PI;
    }

    // Smooth rotation — lerp via shortest arc
    let delta = desiredRotY - this.mesh.rotation.y;
    // Wrap to [-PI, PI] for shortest-path interpolation
    delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    this.mesh.rotation.y += delta * (1 - Math.exp(-ROT_LERP_FACTOR * dt));

    // Switch animation based on interpolation distance (skip if dead or playing one-shot)
    if (!this.isDead && !this.animController.isOneShotPlaying) {
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > MOVE_THRESHOLD) {
        const hasWalk = this.animController.hasAnim("walk");
        if (!this.sprinting && hasWalk) {
          // Dedicated walk animation — play at normal speed
          this.animController.playLoop("walk");
          this.animController.setSpeedRatio(1.0);
        } else {
          this.animController.playLoop("run");
          // Models with a separate walk anim: run always at 1.0
          // Models without: slow down run for walking, full speed for sprint
          this.animController.setSpeedRatio(
            hasWalk ? 1.0 : this.sprinting ? SPRINT_ANIM_SPEED : WALK_ANIM_SPEED,
          );
        }

        // Footstep sounds at regular intervals
        if (this.soundManager) {
          const stepInterval = this.sprinting ? SPRINT_FOOTSTEP_INTERVAL : FOOTSTEP_INTERVAL;
          this.footstepTimer += dt;
          if (this.footstepTimer >= stepInterval) {
            if (this.isLocal) {
              this.soundManager.playRandomFootstep();
            } else {
              this.soundManager.playSpatialFootstep(this.mesh.position);
            }
            this.footstepTimer = 0;
          }
        }
      } else {
        this.animController.playLoop("idle");
        this.footstepTimer = 0;
      }
    }
  }

  /** Show a chat bubble above the player's head. */
  showChatBubble(text: string): void {
    if (!this.guiTexture) return;

    // Reuse or create bubble container
    if (!this.bubbleContainer) {
      this.bubbleContainer = new Rectangle(`playerBubble_${this.mesh.name}`);
      this.bubbleContainer.adaptWidthToChildren = true;
      this.bubbleContainer.adaptHeightToChildren = true;
      this.bubbleContainer.cornerRadius = 12;
      this.bubbleContainer.thickness = 1;
      this.bubbleContainer.color = "rgba(255, 255, 255, 0.12)";
      this.bubbleContainer.background = "rgba(15, 23, 42, 0.88)";
      this.bubbleContainer.paddingTopInPixels = 0;
      this.bubbleContainer.paddingBottomInPixels = 0;
      this.bubbleContainer.paddingLeftInPixels = 0;
      this.bubbleContainer.paddingRightInPixels = 0;
      this.bubbleContainer.shadowColor = "rgba(0, 0, 0, 0.5)";
      this.bubbleContainer.shadowBlur = 8;
      this.bubbleContainer.shadowOffsetY = 2;
      this.bubbleContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this.bubbleContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;

      this.bubbleText = new TextBlock(`playerBubbleText_${this.mesh.name}`);
      this.bubbleText.color = "#e2e8f0";
      this.bubbleText.fontSize = 15;
      this.bubbleText.fontFamily = "system-ui, -apple-system, sans-serif";
      this.bubbleText.textWrapping = true;
      this.bubbleText.resizeToFit = true;
      this.bubbleText.lineSpacing = "3px";
      this.bubbleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      this.bubbleText.paddingTopInPixels = 12;
      this.bubbleText.paddingBottomInPixels = 12;
      this.bubbleText.paddingLeftInPixels = 18;
      this.bubbleText.paddingRightInPixels = 18;

      this.bubbleContainer.addControl(this.bubbleText);
      this.guiTexture.addControl(this.bubbleContainer);
      this.bubbleContainer.linkWithMesh(this.bubbleAnchor);
    }

    // Update text and clamp width
    this.bubbleText!.text = text;
    const innerWidth = Math.min(Math.max(text.length * 8, 40), BUBBLE_MAX_WIDTH);
    this.bubbleText!.widthInPixels = innerWidth + 36; // +18px padding each side
    this.bubbleContainer.alpha = 1;
    this.bubbleContainer.isVisible = true;
    this.bubbleTimer = BUBBLE_DURATION + BUBBLE_FADE;
  }

  getWorldPosition(): Vector3 {
    return this.mesh.position;
  }

  /** Set a client-side facing target — player will look toward this point. */
  setFacingTarget(x: number, z: number): void {
    this.facingTarget = { x, z };
  }

  /** Clear the facing override — player resumes using server rotation. */
  clearFacingTarget(): void {
    this.facingTarget = null;
  }

  /** Play a golden aura particle effect around the character (level-up). */
  playLevelUpEffect(): void {
    const ps = new ParticleSystem(`levelUp_${this.mesh.name}`, 200, this.scene);

    // Use default particle texture (white circle)
    ps.particleTexture = new Texture("/textures/flare.png", this.scene);

    // Emit from a cylinder around the player
    ps.emitter = this.mesh;
    ps.minEmitBox = new Vector3(-0.5, 0, -0.5);
    ps.maxEmitBox = new Vector3(0.5, 0, 0.5);

    // Particles rise upward
    ps.direction1 = new Vector3(-0.3, 3, -0.3);
    ps.direction2 = new Vector3(0.3, 5, 0.3);
    ps.gravity = new Vector3(0, -0.5, 0);

    // Golden color gradient: bright gold → amber → fade out
    ps.color1 = new Color4(1.0, 0.85, 0.2, 1.0);
    ps.color2 = new Color4(1.0, 0.7, 0.1, 1.0);
    ps.colorDead = new Color4(1.0, 0.5, 0.0, 0.0);

    // Size
    ps.minSize = 0.05;
    ps.maxSize = 0.15;

    // Lifetime
    ps.minLifeTime = 0.6;
    ps.maxLifeTime = 1.2;

    // Emit rate — burst of particles
    ps.emitRate = 120;

    // Speed
    ps.minEmitPower = 1;
    ps.maxEmitPower = 2.5;

    // Blend mode for glow effect
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;

    ps.start();

    // Stop emitting after a short burst, then dispose after particles die
    this.pendingTimers.push(
      setTimeout(() => {
        ps.stop();
      }, LEVEL_UP_DURATION * 1000),
    );
    this.pendingTimers.push(
      setTimeout(
        () => {
          ps.dispose();
        },
        (LEVEL_UP_DURATION + 1.5) * 1000,
      ),
    );
  }

  /** Show or hide the selection ring below the player. */
  setSelected(selected: boolean): void {
    this.selectionRing.setSelected(selected);
  }

  private lifeAlpha: number = 1.0;
  private isDead: boolean = false;
  /** Cloned materials per-mesh so we can change transparency without affecting other players */
  private ownMaterials: Map<AbstractMesh, PBRMaterial> = new Map();

  /** Visually represent the player's life state (downed = low alpha, dead = very low alpha). */
  setLifeState(lifeState: string): void {
    const isAlive = lifeState === "alive";
    this.lifeAlpha = isAlive ? 1.0 : lifeState === "downed" ? 0.5 : 0.2;

    // Play death animation once and freeze on last frame
    if (!isAlive && !this.isDead && this.animController.hasAnim("death")) {
      this.animController.playOneShotAndFreeze("death");
    }
    // On revive: reset dead state and restart idle
    if (isAlive && this.isDead) {
      this.animController.resetFreeze();
      this.animController.startIdle();
    }
    this.isDead = !isAlive;

    for (const m of this.modelMeshes) {
      const mat = m.material;
      if (!(mat instanceof PBRMaterial)) continue;

      if (isAlive) {
        // Restore shared original material if we cloned before
        const own = this.ownMaterials.get(m);
        if (own) {
          // The original material is the one before we cloned — find via name
          // Simply set the clone back to opaque
          own.alpha = 1;
          own.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
        }
        m.visibility = 1;
      } else {
        // Clone material per-mesh so we don't affect other player instances
        if (!this.ownMaterials.has(m)) {
          const clone = mat.clone(`${mat.name}_death_${this.sessionId}`);
          if (clone) {
            m.material = clone;
            this.ownMaterials.set(m, clone);
          }
        }
        const own = this.ownMaterials.get(m);
        if (own) {
          own.alpha = this.lifeAlpha;
          own.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
        }
        m.visibility = 1;
      }
    }
  }

  dispose(): void {
    for (const [, mat] of this.ownMaterials) mat.dispose();
    this.ownMaterials.clear();
    this.selectionRing.dispose();
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers = [];
    this.animController.dispose();
    if (this.nameLabel) {
      this.guiTexture?.removeControl(this.nameLabel);
      this.nameLabel.dispose();
    }
    if (this.bubbleContainer) {
      this.guiTexture?.removeControl(this.bubbleContainer);
      this.bubbleContainer.dispose();
    }
    this.nameAnchor?.dispose();
    this.bubbleAnchor?.dispose();
    this.modelRoot?.dispose(false, false);
    this.shadowGenerator?.dispose();
    this.torchLight?.dispose();
    this.mesh.dispose();
  }
}
