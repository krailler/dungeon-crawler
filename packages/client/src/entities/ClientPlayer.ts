import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { TORCH_INTENSITY, TORCH_RANGE, TORCH_ANGLE } from "@dungeon/shared";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AnimName, CharacterInstance } from "./CharacterAssetLoader";
import type { SoundManager } from "../audio/SoundManager";

// Side-effect: shadow map support
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

/** Position smoothing factor — higher = snappier (0 = no movement, 1 = instant) */
const LERP_FACTOR = 6;

/** Rotation smoothing factor — lower = smoother turn */
const ROT_LERP_FACTOR = 10;

/** Distance threshold to consider the player "moving" */
const MOVE_THRESHOLD = 0.05;

/** Interval between footstep sounds while running (seconds) */
const FOOTSTEP_INTERVAL = 0.32;

export class ClientPlayer {
  /** Invisible anchor mesh used for positioning and torch parenting */
  public mesh: Mesh;
  /** GLB model root — child of mesh */
  public modelRoot: TransformNode | null = null;
  /** All GLB child meshes — for shadow casting */
  public modelMeshes: AbstractMesh[] = [];
  public isLocal: boolean;
  public torchLight: SpotLight | null = null;
  public shadowGenerator: ShadowGenerator | null = null;

  private animations: Map<AnimName, AnimationGroup> = new Map();
  private currentAnim: AnimName | null = null;
  private isPlayingOneShot: boolean = false;

  // Audio
  private soundManager: SoundManager | null = null;
  private footstepTimer: number = 0;

  // Target state from server
  private targetX: number = 0;
  private targetZ: number = 0;
  private targetRotY: number = 0;

  constructor(scene: Scene, isLocal: boolean, id: string, soundManager?: SoundManager) {
    this.isLocal = isLocal;

    // Invisible anchor for position/rotation
    this.mesh = MeshBuilder.CreateGround(`player_${id}`, { width: 0.1, height: 0.1 }, scene);
    this.mesh.visibility = 0;
    this.mesh.isPickable = false;
    this.mesh.position.y = 0;

    // Only local player gets a torch light
    if (isLocal) {
      this.torchLight = new SpotLight(
        `playerTorch_${id}`,
        new Vector3(0, 3, 0),
        new Vector3(0, -0.8, 0.2).normalize(),
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

    // Only local player gets footstep sounds
    if (isLocal && soundManager) {
      this.soundManager = soundManager;
    }
  }

  /** Attach the loaded GLB character instance. */
  attachModel(instance: CharacterInstance): void {
    this.modelRoot = instance.root;
    this.modelMeshes = instance.meshes;
    this.animations = instance.animations;

    // Parent to our invisible anchor and scale to fit dungeon proportions
    this.modelRoot.parent = this.mesh;
    this.modelRoot.scaling.setAll(0.5);

    // Fix GLB material: exported with alpha=0 (transparent) — force opaque
    for (const m of this.modelMeshes) {
      const mat = m.material;
      if (mat instanceof PBRMaterial) {
        mat.alpha = 1;
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
        mat.backFaceCulling = true;
      }
    }

    // Add model meshes as shadow casters
    if (this.shadowGenerator) {
      for (const m of this.modelMeshes) {
        this.shadowGenerator.addShadowCaster(m);
      }
    }

    // Start idle animation
    this.playAnimation("idle");
  }

  private playAnimation(name: AnimName): void {
    if (this.currentAnim === name) return;

    // Stop current
    if (this.currentAnim) {
      const current = this.animations.get(this.currentAnim);
      current?.stop();
    }

    const anim = this.animations.get(name);
    if (anim) {
      anim.start(true); // loop
      this.currentAnim = name;
    }
  }

  private playOneShot(name: AnimName): void {
    if (this.isPlayingOneShot) return;

    // Stop current looping animation
    if (this.currentAnim) {
      const current = this.animations.get(this.currentAnim);
      current?.stop();
    }

    const anim = this.animations.get(name);
    if (anim) {
      this.isPlayingOneShot = true;
      anim.start(false); // no loop
      const obs = anim.onAnimationGroupEndObservable.addOnce(() => {
        this.isPlayingOneShot = false;
        this.currentAnim = null; // force re-evaluation in update()
      });
    }
  }

  /** Called when server state changes */
  setServerState(x: number, z: number, rotY: number, animState: string = ""): void {
    this.targetX = x;
    this.targetZ = z;
    this.targetRotY = rotY;

    // Trigger one-shot animation if server says so
    if (animState && !this.isPlayingOneShot) {
      this.playOneShot(animState as AnimName);
    }
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
    const t = 1 - Math.exp(-LERP_FACTOR * dt);

    const dx = this.targetX - this.mesh.position.x;
    const dz = this.targetZ - this.mesh.position.z;
    this.mesh.position.x += dx * t;
    this.mesh.position.z += dz * t;
    // Smooth rotation — lerp via shortest arc
    const targetRot = this.targetRotY + Math.PI;
    let delta = targetRot - this.mesh.rotation.y;
    // Wrap to [-PI, PI] for shortest-path interpolation
    delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    this.mesh.rotation.y += delta * (1 - Math.exp(-ROT_LERP_FACTOR * dt));

    // Switch animation based on movement (only if not playing one-shot)
    if (!this.isPlayingOneShot) {
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > MOVE_THRESHOLD) {
        this.playAnimation("run");

        // Footstep sound at regular intervals (local player only)
        if (this.soundManager) {
          this.footstepTimer += dt;
          if (this.footstepTimer >= FOOTSTEP_INTERVAL) {
            this.soundManager.playRandomFootstep();
            this.footstepTimer = 0;
          }
        }
      } else {
        this.playAnimation("idle");
        this.footstepTimer = 0;
      }
    }
  }

  getWorldPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  dispose(): void {
    for (const [, anim] of this.animations) {
      anim.dispose();
    }
    this.modelRoot?.dispose(false, false);
    this.shadowGenerator?.dispose();
    this.torchLight?.dispose();
    this.mesh.dispose();
  }
}
