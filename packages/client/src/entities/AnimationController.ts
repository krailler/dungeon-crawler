import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AnimName } from "./CharacterAssetLoader";
import type { SoundManager } from "../audio/SoundManager";
import { ATTACK_ANIM_DURATION } from "@dungeon/shared";

/** Duration of crossfade between looping animations (seconds) */
const CROSSFADE_DURATION = 0.1;

/** Delay before playing attack sound (at animation peak) */
const ATTACK_SOUND_DELAY = ATTACK_ANIM_DURATION / 2;

/**
 * Shared animation logic for client entities (players and enemies).
 * Handles looping animation crossfade, one-shot attacks, and timed sound effects.
 */
export class AnimationController {
  private animations: Map<AnimName, AnimationGroup> = new Map();
  private currentAnim: AnimName | null = null;
  private previousAnim: AnimName | null = null;
  private crossfadeTimer: number = 0;
  private isPlayingOneShot: boolean = false;
  private pendingSoundName: string | null = null;
  private pendingSoundTimer: number = 0;
  private soundManager: SoundManager | null;
  /** When set, attack sounds play as spatial audio at this position. */
  private spatialPositionFn: (() => Vector3) | null = null;

  constructor(soundManager: SoundManager | null) {
    this.soundManager = soundManager;
  }

  /** Enable spatial audio — attack sounds will play at the returned position. */
  setSpatialPosition(fn: () => Vector3): void {
    this.spatialPositionFn = fn;
  }

  /** Set animations from a loaded character instance. */
  setAnimations(animations: Map<AnimName, AnimationGroup>): void {
    this.animations = animations;
  }

  /** Start idle animation (call after attaching model). */
  startIdle(): void {
    this.playLoop("idle");
  }

  /** Play a looping animation with crossfade from the current one. */
  playLoop(name: AnimName): void {
    if (this.currentAnim === name) return;

    const next = this.animations.get(name);
    if (!next) return;

    if (this.currentAnim) {
      this.previousAnim = this.currentAnim;
    }

    next.setWeightForAllAnimatables(0);
    next.start(true);
    this.currentAnim = name;
    this.crossfadeTimer = CROSSFADE_DURATION;
  }

  /** Play a one-shot animation (e.g. attack) — interrupts looping.
   *  If no animation exists for `name`, falls back to "punch" but keeps `name` for the sound. */
  playOneShot(name: AnimName): void {
    if (this.isPlayingOneShot) return;

    if (this.currentAnim) {
      const current = this.animations.get(this.currentAnim);
      current?.stop();
    }

    const anim = this.animations.get(name) ?? this.animations.get("punch");
    if (anim) {
      this.isPlayingOneShot = true;
      anim.start(false);
      this.pendingSoundName = name;
      this.pendingSoundTimer = ATTACK_SOUND_DELAY;
      anim.onAnimationGroupEndObservable.addOnce(() => {
        this.isPlayingOneShot = false;
        this.currentAnim = null;
      });
    }
  }

  /** Whether a one-shot animation is currently playing. */
  get isOneShotPlaying(): boolean {
    return this.isPlayingOneShot;
  }

  /** Update crossfade blending and pending sound timer. Call every frame. */
  update(dt: number): void {
    // Crossfade blending
    if (this.crossfadeTimer > 0) {
      this.crossfadeTimer -= dt;
      const t = Math.max(0, this.crossfadeTimer / CROSSFADE_DURATION);

      const current = this.currentAnim ? this.animations.get(this.currentAnim) : null;
      const previous = this.previousAnim ? this.animations.get(this.previousAnim) : null;

      if (current) current.setWeightForAllAnimatables(1 - t);
      if (previous) previous.setWeightForAllAnimatables(t);

      if (this.crossfadeTimer <= 0) {
        if (previous) {
          previous.stop();
          previous.setWeightForAllAnimatables(1);
        }
        if (current) current.setWeightForAllAnimatables(1);
        this.previousAnim = null;
      }
    }

    // Pending attack sound
    if (this.pendingSoundTimer > 0) {
      this.pendingSoundTimer -= dt;
      if (this.pendingSoundTimer <= 0 && this.pendingSoundName) {
        if (this.spatialPositionFn) {
          this.soundManager?.playSpatialAnimSound(this.pendingSoundName, this.spatialPositionFn());
        } else {
          this.soundManager?.playAnimSound(this.pendingSoundName);
        }
        this.pendingSoundName = null;
      }
    }
  }

  /** Set the playback speed of the current looping animation (1.0 = default). */
  setSpeedRatio(ratio: number): void {
    if (!this.currentAnim) return;
    const anim = this.animations.get(this.currentAnim);
    if (anim) anim.speedRatio = ratio;
  }

  /** Dispose all animation groups. */
  dispose(): void {
    for (const [, anim] of this.animations) {
      anim.dispose();
    }
    this.animations.clear();
  }
}
