import { Sound } from "@babylonjs/core/Audio/sound";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { VolumeSettings } from "../ui/stores/settingsStore";

// Side-effect: registers AudioSceneComponent so Engine.audioEngine gets created
import "@babylonjs/core/Audio/audioSceneComponent";

/** Number of footstep variants available */
const FOOTSTEP_COUNT = 10;

/** Base volumes per category (before master/category multipliers) */
const FOOTSTEP_VOLUME = 0.35;
const ATTACK_VOLUME = 0.5;
const SFX_VOLUME = 0.6;
const SFX_GATE_VOLUME = 0.4;
const AMBIENT_VOLUME = 1;

/** Base path for footstep audio files */
const FOOTSTEP_BASE_PATH = "/audio/footsteps/footstep";
const AMBIENT_URL = "/audio/ambient/cave_loop.ogg";
const DOWNED_LOOP_URL = "/audio/ambient/downed_loop.ogg";
const DEAD_LOOP_URL = "/audio/ambient/dead_loop.ogg";

/** Volume for death loops (before master/ambient multipliers) */
const DEATH_LOOP_VOLUME = 0.8;

/** Spatial audio — distance-based attenuation for remote entity sounds */
const SPATIAL_MAX_DISTANCE = 20;
const SPATIAL_REF_DISTANCE = 2;
const SPATIAL_ROLLOFF = 1;
/** Number of pooled spatial Sound instances per category */
const SPATIAL_FOOTSTEP_POOL = 8;
const SPATIAL_ANIM_POOL = 4;

const PUNCH_URLS = ["/audio/sfx/punch_1.ogg", "/audio/sfx/punch_2.ogg", "/audio/sfx/punch_3.ogg"];
const HEAVY_PUNCH_URLS = ["/audio/sfx/heavy_strike.ogg"];

/** Tracks a set of sound variants for a single animation */
interface AnimSoundEntry {
  sounds: Sound[];
  baseVolumes: number[];
  lastIndex: number;
}

/** A sound with its base volume for volume recalculation */
interface SfxEntry {
  sound: Sound;
  baseVolume: number;
}

/** All audio URLs used by SoundManager — used by asset prefetcher. */
export function getAllAudioUrls(): string[] {
  const urls: string[] = [];
  for (let i = 0; i < FOOTSTEP_COUNT; i++) {
    urls.push(`${FOOTSTEP_BASE_PATH}${String(i).padStart(2, "0")}.ogg`);
  }
  urls.push(...PUNCH_URLS, ...HEAVY_PUNCH_URLS);
  urls.push(
    "/audio/sfx/gold_pickup.ogg",
    "/audio/sfx/gate_open.ogg",
    "/audio/sfx/player_join.ogg",
    "/audio/sfx/player_leave.ogg",
    "/audio/sfx/chat_receive.ogg",
    "/audio/sfx/chat_send.ogg",
    "/audio/sfx/level_up.ogg",
    "/audio/sfx/downed_hit.ogg",
    "/audio/sfx/revive.ogg",
    "/audio/sfx/potion_drink.ogg",
  );
  urls.push(AMBIENT_URL, DOWNED_LOOP_URL, DEAD_LOOP_URL);
  urls.push("/audio/music/lobby_theme.ogg");
  return urls;
}

export class SoundManager {
  private scene: Scene;
  private footsteps: Sound[] = [];
  private footstepBaseVol: number = FOOTSTEP_VOLUME;
  private lastFootstepIndex: number = -1;
  private animSounds: Map<string, AnimSoundEntry> = new Map();
  private sfxEntries: Map<string, SfxEntry> = new Map();
  private ambient: Sound | null = null;
  private ambientBaseVol: number = AMBIENT_VOLUME;
  private downedLoop: Sound | null = null;
  private deadLoop: Sound | null = null;
  /** Which death loop is currently active: "none" | "downed" | "dead" */
  private activeDeathLoop: "none" | "downed" | "dead" = "none";
  private loaded: boolean = false;

  /** Current volume multipliers (updated via applyVolumes) */
  private masterVol: number = 1;
  private sfxVol: number = 0.6;
  private ambientVol: number = 1;

  /** Debug mute override (from debugStore ambient toggle) */
  private ambientMuted: boolean = false;

  /** Spatial footstep pool (round-robin) */
  private spatialFootsteps: Sound[] = [];
  private spatialFootstepIdx: number = 0;
  /** Spatial animation sound pools (round-robin per anim name) */
  private spatialAnimPools: Map<string, { sounds: Sound[]; idx: number }> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Create all Sound instances.
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
    this.registerAnimSound("punch", PUNCH_URLS, ATTACK_VOLUME);
    this.registerAnimSound("heavy_punch", HEAVY_PUNCH_URLS, ATTACK_VOLUME);

    // One-shot SFX
    this.registerSfx("gold_pickup", "/audio/sfx/gold_pickup.ogg", SFX_VOLUME);
    this.registerSfx("gate_open", "/audio/sfx/gate_open.ogg", SFX_GATE_VOLUME);
    this.registerSfx("player_join", "/audio/sfx/player_join.ogg", SFX_VOLUME);
    this.registerSfx("player_leave", "/audio/sfx/player_leave.ogg", SFX_VOLUME);
    this.registerSfx("chat_receive", "/audio/sfx/chat_receive.ogg", SFX_VOLUME);
    this.registerSfx("chat_send", "/audio/sfx/chat_send.ogg", SFX_VOLUME);
    this.registerSfx("level_up", "/audio/sfx/level_up.ogg", SFX_VOLUME);
    this.registerSfx("downed_hit", "/audio/sfx/downed_hit.ogg", SFX_VOLUME);
    this.registerSfx("revive", "/audio/sfx/revive.ogg", SFX_VOLUME);

    // Item use sounds — keyed by ItemDef.useSound
    this.registerSfx("potion_drink", "/audio/sfx/potion_drink.ogg", SFX_VOLUME);

    // Ambient cave loop (starts paused — call playAmbient() to start)
    await new Promise<void>((resolve) => {
      this.ambient = new Sound("ambient_cave", AMBIENT_URL, this.scene, () => resolve(), {
        volume: AMBIENT_VOLUME,
        autoplay: false,
        loop: true,
      });
    });

    // Death state loops (start paused — activated via setDeathLoop)
    this.downedLoop = new Sound("downed_loop", DOWNED_LOOP_URL, this.scene, null, {
      volume: 0,
      autoplay: false,
      loop: true,
    });
    this.deadLoop = new Sound("dead_loop", DEAD_LOOP_URL, this.scene, null, {
      volume: 0,
      autoplay: false,
      loop: true,
    });

    // Spatial sound pools for remote players / creatures
    this.loadSpatialSounds();

    this.loaded = true;
    console.log("[SoundManager] Loaded", this.footsteps.length, "footstep sounds");
  }

  /** Create pooled spatial Sound instances for distance-based audio. */
  private loadSpatialSounds(): void {
    const spatialOpts = (volume: number) => ({
      volume,
      autoplay: false,
      loop: false,
      spatialSound: true,
      maxDistance: SPATIAL_MAX_DISTANCE,
      refDistance: SPATIAL_REF_DISTANCE,
      rolloffFactor: SPATIAL_ROLLOFF,
      distanceModel: "linear" as const,
    });

    // Spatial footstep pool — cycle through footstep variants
    for (let i = 0; i < SPATIAL_FOOTSTEP_POOL; i++) {
      const variantIdx = i % FOOTSTEP_COUNT;
      const idx = String(variantIdx).padStart(2, "0");
      const url = `${FOOTSTEP_BASE_PATH}${idx}.ogg`;
      this.spatialFootsteps.push(
        new Sound(`sp_foot_${i}`, url, this.scene, null, spatialOpts(FOOTSTEP_VOLUME)),
      );
    }

    // Spatial attack sound pools
    this.loadSpatialAnimPool("punch", PUNCH_URLS, spatialOpts(ATTACK_VOLUME));
    this.loadSpatialAnimPool("heavy_punch", HEAVY_PUNCH_URLS, spatialOpts(ATTACK_VOLUME));
  }

  private loadSpatialAnimPool(name: string, urls: string[], opts: Record<string, unknown>): void {
    const sounds: Sound[] = [];
    for (let i = 0; i < SPATIAL_ANIM_POOL; i++) {
      const url = urls[i % urls.length];
      sounds.push(new Sound(`sp_${name}_${i}`, url, this.scene, null, opts));
    }
    this.spatialAnimPools.set(name, { sounds, idx: 0 });
  }

  /**
   * Apply volume settings from the settings store.
   * Re-calculates effective volume for every sound: base × category × master.
   */
  applyVolumes(v: VolumeSettings): void {
    this.masterVol = v.master;
    this.sfxVol = v.sfx;
    this.ambientVol = v.ambient;

    // Footsteps (sfx category)
    const footVol = this.footstepBaseVol * this.sfxVol * this.masterVol;
    for (const sound of this.footsteps) {
      sound.setVolume(footVol);
    }

    // Animation sounds (sfx category)
    for (const [, entry] of this.animSounds) {
      for (let i = 0; i < entry.sounds.length; i++) {
        entry.sounds[i].setVolume(entry.baseVolumes[i] * this.sfxVol * this.masterVol);
      }
    }

    // One-shot SFX
    for (const [, entry] of this.sfxEntries) {
      entry.sound.setVolume(entry.baseVolume * this.sfxVol * this.masterVol);
    }

    // Spatial footsteps
    const spFootVol = FOOTSTEP_VOLUME * this.sfxVol * this.masterVol;
    for (const s of this.spatialFootsteps) s.setVolume(spFootVol);

    // Spatial anim sounds
    const spAtkVol = ATTACK_VOLUME * this.sfxVol * this.masterVol;
    for (const [, pool] of this.spatialAnimPools) {
      for (const s of pool.sounds) s.setVolume(spAtkVol);
    }

    // Ambient
    this.applyAmbientVolume();
  }

  /**
   * Register sound variants for an animation name.
   * Future animations just add another call here.
   */
  private registerAnimSound(animName: string, urls: string[], volume: number): void {
    const sounds: Sound[] = [];
    const baseVolumes: number[] = [];
    for (const url of urls) {
      const name = `${animName}_${url.split("/").pop()}`;
      const sound = new Sound(name, url, this.scene, null, {
        volume,
        autoplay: false,
        loop: false,
      });
      sounds.push(sound);
      baseVolumes.push(volume);
    }
    this.animSounds.set(animName, { sounds, baseVolumes, lastIndex: -1 });
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

  /** Play a spatial footstep at the given world position (for remote entities). */
  playSpatialFootstep(position: Vector3): void {
    if (this.spatialFootsteps.length === 0) return;
    const sound = this.spatialFootsteps[this.spatialFootstepIdx];
    this.spatialFootstepIdx = (this.spatialFootstepIdx + 1) % this.spatialFootsteps.length;
    sound.setPosition(position);
    sound.play();
  }

  /** Play a spatial animation sound at the given world position (for remote entities). */
  playSpatialAnimSound(animName: string, position: Vector3): void {
    const pool = this.spatialAnimPools.get(animName);
    if (!pool || pool.sounds.length === 0) return;
    const sound = pool.sounds[pool.idx];
    pool.idx = (pool.idx + 1) % pool.sounds.length;
    sound.setPosition(position);
    sound.play();
  }

  /** Register a single one-shot sound effect */
  private registerSfx(name: string, url: string, volume: number): void {
    const sound = new Sound(`sfx_${name}`, url, this.scene, null, {
      volume,
      autoplay: false,
      loop: false,
    });
    this.sfxEntries.set(name, { sound, baseVolume: volume });
  }

  /** Play a named sound effect (registered via registerSfx) */
  playSfx(name: string): void {
    const entry = this.sfxEntries.get(name);
    if (entry) entry.sound.play();
  }

  /** Start the ambient cave loop */
  playAmbient(): void {
    if (this.ambient && !this.ambient.isPlaying) {
      this.ambient.play();
    }
  }

  /** Mute or unmute the ambient loop (debug toggle — overrides volume slider) */
  setAmbientMuted(muted: boolean): void {
    this.ambientMuted = muted;
    this.applyAmbientVolume();
  }

  /**
   * Switch the death-state ambient loop.
   * - "none" = normal ambient (cave loop)
   * - "downed" = downed tension loop
   * - "dead" = dead tension loop
   *
   * Fades the normal ambient down when a death loop plays, restores on "none".
   */
  setDeathLoop(state: "none" | "downed" | "dead"): void {
    if (state === this.activeDeathLoop) return;
    this.activeDeathLoop = state;

    // Stop whichever death loop was playing
    if (this.downedLoop?.isPlaying) this.downedLoop.stop();
    if (this.deadLoop?.isPlaying) this.deadLoop.stop();

    if (state === "none") {
      // Restore normal ambient volume
      this.applyAmbientVolume();
      return;
    }

    // Duck normal ambient while death loop plays
    if (this.ambient) this.ambient.setVolume(0);

    const loop = state === "downed" ? this.downedLoop : this.deadLoop;
    if (loop) {
      loop.setVolume(DEATH_LOOP_VOLUME * this.ambientVol * this.masterVol);
      loop.play();
    }

    // Play a one-shot dramatic hit when downed
    if (state === "downed") {
      this.playSfx("downed_hit");
    }
  }

  /** Recalculate ambient volume considering both settings and debug mute */
  private applyAmbientVolume(): void {
    if (!this.ambient) return;
    if (this.ambientMuted || this.activeDeathLoop !== "none") {
      this.ambient.setVolume(0);
    } else {
      this.ambient.setVolume(this.ambientBaseVol * this.ambientVol * this.masterVol);
    }

    // Also update active death loop volume
    if (this.activeDeathLoop === "downed" && this.downedLoop?.isPlaying) {
      this.downedLoop.setVolume(DEATH_LOOP_VOLUME * this.ambientVol * this.masterVol);
    }
    if (this.activeDeathLoop === "dead" && this.deadLoop?.isPlaying) {
      this.deadLoop.setVolume(DEATH_LOOP_VOLUME * this.ambientVol * this.masterVol);
    }
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
    for (const [, entry] of this.sfxEntries) {
      entry.sound.dispose();
    }
    this.sfxEntries.clear();
    for (const s of this.spatialFootsteps) s.dispose();
    this.spatialFootsteps = [];
    for (const [, pool] of this.spatialAnimPools) {
      for (const s of pool.sounds) s.dispose();
    }
    this.spatialAnimPools.clear();
    if (this.ambient) {
      this.ambient.dispose();
      this.ambient = null;
    }
    if (this.downedLoop) {
      this.downedLoop.dispose();
      this.downedLoop = null;
    }
    if (this.deadLoop) {
      this.deadLoop.dispose();
      this.deadLoop = null;
    }
    this.activeDeathLoop = "none";
    this.loaded = false;
  }
}
