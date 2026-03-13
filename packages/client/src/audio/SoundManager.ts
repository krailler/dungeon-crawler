import { Sound } from "@babylonjs/core/Audio/sound";
import type { Scene } from "@babylonjs/core/scene";

// Side-effect: registers AudioSceneComponent so Engine.audioEngine gets created
import "@babylonjs/core/Audio/audioSceneComponent";

/** Number of footstep variants available */
const FOOTSTEP_COUNT = 10;

/** Volume for footstep sounds (0.0 to 1.0) */
const FOOTSTEP_VOLUME = 0.35;

/** Base path for footstep audio files */
const FOOTSTEP_BASE_PATH = "/audio/footsteps/footstep";

export class SoundManager {
  private scene: Scene;
  private footsteps: Sound[] = [];
  private lastFootstepIndex: number = -1;
  private loaded: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Create all footstep Sound instances.
   * Sounds start loading their audio data immediately; they will be
   * playable once the browser audio context is unlocked (first user click).
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    for (let i = 0; i < FOOTSTEP_COUNT; i++) {
      const idx = String(i).padStart(2, "0");
      const url = `${FOOTSTEP_BASE_PATH}${idx}.ogg`;

      const sound = new Sound(`footstep${idx}`, url, this.scene, null, {
        volume: FOOTSTEP_VOLUME,
        autoplay: false,
        loop: false,
      });
      this.footsteps.push(sound);
    }

    this.loaded = true;
    console.log("[SoundManager] Loaded", this.footsteps.length, "footstep sounds");
  }

  /**
   * Play a random footstep sound, avoiding the immediately previous one.
   */
  playRandomFootstep(): void {
    if (this.footsteps.length === 0) return;

    let index: number;
    if (this.footsteps.length === 1) {
      index = 0;
    } else {
      // Pick a random index different from the last one played
      do {
        index = Math.floor(Math.random() * this.footsteps.length);
      } while (index === this.lastFootstepIndex);
    }

    this.lastFootstepIndex = index;
    this.footsteps[index].play();
  }

  dispose(): void {
    for (const sound of this.footsteps) {
      sound.dispose();
    }
    this.footsteps = [];
    this.loaded = false;
  }
}
