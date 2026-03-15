/**
 * Lightweight UI sound bridge — plays short audio clips from React components
 * without coupling to Babylon.js or SoundManager.
 *
 * Uses HTML5 Audio API (no Scene dependency).
 */

const UI_SOUNDS = {
  ui_click: "/audio/ui/click.ogg",
  ui_rollover: "/audio/ui/rollover.ogg",
} as const;

type UiSoundName = keyof typeof UI_SOUNDS;

const cache = new Map<string, HTMLAudioElement>();

/** Pre-load all UI sounds into browser cache */
export function preloadUiSounds(): void {
  for (const [name, url] of Object.entries(UI_SOUNDS)) {
    const audio = new Audio(url);
    audio.preload = "auto";
    cache.set(name, audio);
  }
}

/** Play a UI sound effect by name */
export function playUiSfx(name: UiSoundName): void {
  const url = UI_SOUNDS[name];
  // Clone from cache so overlapping plays work
  const audio = new Audio(url);
  audio.volume = 0.5;
  audio.play().catch(() => {
    /* AudioContext not yet unlocked — ignore */
  });
}
