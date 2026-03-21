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
  ui_queue_start: "/audio/ui/queue_start.ogg",
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
let uiVolumeMultiplier = 1.0;
/** Current effective volume for lobby music (ambient × master). */
let musicVolumeMultiplier = 1.0;

/** Called once at startup to connect UI sound volume to settingsStore. */
export function initUiSfxVolume(
  getVolume: () => { ui: number; master: number; ambient: number },
): void {
  const update = (): void => {
    const v = getVolume();
    uiVolumeMultiplier = v.ui * v.master;
    musicVolumeMultiplier = v.ambient * v.master;
    if (gainNode) {
      gainNode.gain.value = uiVolumeMultiplier;
    }
    if (lobbyGain) {
      lobbyGain.gain.value = musicVolumeMultiplier;
    }
  };
  update();
}

// ── Lobby music ─────────────────────────────────────────────────────────────

const LOBBY_MUSIC_URL = "/audio/music/lobby_theme.ogg";
let lobbySource: AudioBufferSourceNode | null = null;
let lobbyBuffer: AudioBuffer | null = null;
let lobbyGain: GainNode | null = null;
/** Incremented on each start/stop to cancel stale async loads */
let lobbyGeneration = 0;

/** Start looping lobby/login background music. Safe to call multiple times. */
export async function startLobbyMusic(): Promise<void> {
  if (lobbySource) return; // already playing
  const gen = ++lobbyGeneration;
  const audioCtx = getContext();

  if (!lobbyBuffer) {
    try {
      const res = await fetch(LOBBY_MUSIC_URL);
      const arrayBuf = await res.arrayBuffer();
      lobbyBuffer = await audioCtx.decodeAudioData(arrayBuf);
    } catch {
      return;
    }
  }

  // stop was called or another start happened while loading — abort
  if (gen !== lobbyGeneration) return;

  lobbyGain = audioCtx.createGain();
  lobbyGain.gain.value = musicVolumeMultiplier;
  lobbyGain.connect(audioCtx.destination);

  lobbySource = audioCtx.createBufferSource();
  lobbySource.buffer = lobbyBuffer;
  lobbySource.loop = true;
  lobbySource.connect(lobbyGain);
  lobbySource.start();
}

/** Stop lobby music. */
export function stopLobbyMusic(): void {
  lobbyGeneration++;
  if (lobbySource) {
    lobbySource.stop();
    lobbySource.disconnect();
    lobbySource = null;
  }
  if (lobbyGain) {
    lobbyGain.disconnect();
    lobbyGain = null;
  }
}

/** Release the AudioContext and buffers */
export function disposeUiSounds(): void {
  stopLobbyMusic();
  lobbyBuffer = null;
  buffers.clear();
  if (ctx) {
    ctx.close().catch(() => {});
    ctx = null;
    gainNode = null;
  }
}
