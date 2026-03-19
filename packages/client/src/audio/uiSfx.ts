/**
 * Lightweight UI sound bridge — plays short audio clips from React components
 * without coupling to Babylon.js or SoundManager.
 *
 * Uses the Web Audio API: each sound is decoded once into an AudioBuffer,
 * and every play() creates a cheap AudioBufferSourceNode that auto-disposes.
 */

const UI_SOUNDS = {
  ui_click: "/audio/ui/click.ogg",
  ui_rollover: "/audio/ui/rollover.ogg",
  ui_announcement: "/audio/ui/announcement.ogg",
  ui_tutorial: "/audio/ui/tutorial_hint.ogg",
  level_up: "/audio/sfx/level_up.ogg",
} as const;

type UiSoundName = keyof typeof UI_SOUNDS;

let ctx: AudioContext | null = null;
let gainNode: GainNode | null = null;
const buffers = new Map<string, AudioBuffer>();

/** Lazily create / resume the shared AudioContext */
function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    gainNode = ctx.createGain();
    gainNode.gain.value = uiVolumeMultiplier;
    gainNode.connect(ctx.destination);
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** Fetch + decode all UI sounds into AudioBuffers */
export async function preloadUiSounds(): Promise<void> {
  const audioCtx = getContext();
  const entries = Object.entries(UI_SOUNDS);

  await Promise.all(
    entries.map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuf);
        buffers.set(name, decoded);
      } catch {
        // Failed to load — sound will simply not play
      }
    }),
  );
}

/** Play a UI sound effect by name. Supports unlimited overlaps with zero allocation overhead. */
export function playUiSfx(name: UiSoundName): void {
  const buffer = buffers.get(name);
  if (!buffer || !ctx || !gainNode) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(gainNode);
  source.start();
  // AudioBufferSourceNode auto-disposes after playback — no cleanup needed
}

// ── Volume integration ──────────────────────────────────────────────────────

/** Current effective volume for UI sounds (ui × master). Updated by settingsStore listener. */
let uiVolumeMultiplier = 0.5;

/** Called once at startup to connect UI sound volume to settingsStore. */
export function initUiSfxVolume(getVolume: () => { ui: number; master: number }): void {
  const update = (): void => {
    const v = getVolume();
    uiVolumeMultiplier = v.ui * v.master;
    if (gainNode) {
      gainNode.gain.value = uiVolumeMultiplier;
    }
  };
  update();
}

/** Release the AudioContext and buffers */
export function disposeUiSounds(): void {
  buffers.clear();
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
    gainNode = null;
  }
}
