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

/** Volume for attack/animation sounds */
const ATTACK_VOLUME = 0.5;

/** Ambient sound config */
const AMBIENT_URL = "/audio/ambient/cave_loop.ogg";
const AMBIENT_VOLUME = 1;

/** Tracks a set of sound variants for a single animation */
interface AnimSoundEntry {
  sounds: Sound[];
  lastIndex: number;
}

export class SoundManager {
  private scene: Scene;
  private footsteps: Sound[] = [];
  private lastFootstepIndex: number = -1;
  private animSounds: Map<string, AnimSoundEntry> = new Map();
  private ambient: Sound | null = null;
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

    // Register animation sounds
    this.registerAnimSound(
      "punch",
      ["/audio/sfx/punch_1.ogg", "/audio/sfx/punch_2.ogg", "/audio/sfx/punch_3.ogg"],
      ATTACK_VOLUME,
    );

    // Ambient cave loop (starts paused — call playAmbient() to start)
    this.ambient = new Sound("ambient_cave", AMBIENT_URL, this.scene, null, {
      volume: AMBIENT_VOLUME,
      autoplay: false,
      loop: true,
    });

    this.loaded = true;
    console.log("[SoundManager] Loaded", this.footsteps.length, "footstep sounds");
  }

  /**
   * Register sound variants for an animation name.
   * Future animations just add another call here.
   */
  private registerAnimSound(animName: string, urls: string[], volume: number): void {
    const sounds: Sound[] = [];
    for (const url of urls) {
      const name = `${animName}_${url.split("/").pop()}`;
      const sound = new Sound(name, url, this.scene, null, {
        volume,
        autoplay: false,
        loop: false,
      });
      sounds.push(sound);
    }
    this.animSounds.set(animName, { sounds, lastIndex: -1 });
  }

  /**
   * Play the sound associated with an animation name.
   * If no sound is registered for that animation, does nothing.
   */
  playAnimSound(animName: string): void {
    const entry = this.animSounds.get(animName);
    if (!entry || entry.sounds.length === 0) return;

    let index: number;
    if (entry.sounds.length === 1) {
      index = 0;
    } else {
      do {
        index = Math.floor(Math.random() * entry.sounds.length);
      } while (index === entry.lastIndex);
    }

    entry.lastIndex = index;
    entry.sounds[index].play();
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

  /** Start the ambient cave loop */
  playAmbient(): void {
    if (this.ambient && !this.ambient.isPlaying) {
      this.ambient.play();
    }
  }

  /** Mute or unmute the ambient loop (controls volume, not playback) */
  setAmbientMuted(muted: boolean): void {
    if (!this.ambient) return;
    this.ambient.setVolume(muted ? 0 : AMBIENT_VOLUME);
  }

  dispose(): void {
    for (const sound of this.footsteps) {
      sound.dispose();
    }
    this.footsteps = [];
    for (const [, entry] of this.animSounds) {
      for (const sound of entry.sounds) {
        sound.dispose();
      }
    }
    this.animSounds.clear();
    if (this.ambient) {
      this.ambient.dispose();
      this.ambient = null;
    }
    this.loaded = false;
  }
}
