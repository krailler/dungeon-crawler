/**
 * Asset pre-fetcher — warms the browser HTTP cache while the player
 * is in the lobby so that Babylon.js asset loads are near-instant.
 *
 * Uses plain fetch() (no Babylon dependency). Files are fetched and
 * discarded — the browser cache does the rest.
 *
 * Asset URLs are imported from each source of truth so there's only
 * one place to update when adding new models, props, or sounds.
 */

import { getAllCharacterModelUrls } from "../../entities/CharacterLoaderRegistry";
import { getAllPropUrls } from "../../entities/PropRegistry";
import { getAllAudioUrls } from "../../audio/SoundManager";

type Listener = () => void;

export type AssetPreloadSnapshot = {
  /** 0..1 progress */
  progress: number;
  /** Total assets to prefetch */
  total: number;
  /** Assets loaded so far */
  loaded: number;
  /** True when all done */
  done: boolean;
};

const listeners = new Set<Listener>();
let snapshot: AssetPreloadSnapshot = { progress: 0, total: 0, loaded: 0, done: false };
let started = false;

function emit(): void {
  for (const fn of listeners) fn();
}

function update(partial: Partial<AssetPreloadSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emit();
}

// ── Tile URLs (only place these are defined — tile sets may vary) ────────

function getTileUrls(): string[] {
  const urls: string[] = [];
  // Floor tiles (set1, 8 variants)
  for (let i = 1; i <= 8; i++) {
    urls.push(`/models/floors/set1/floor_${i}.glb`);
  }
  // Wall decorations (set1, 3 variants)
  for (let i = 1; i <= 3; i++) {
    urls.push(`/models/walls/set1/wall_${i}.glb`);
  }
  return urls;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const assetPreloadStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): AssetPreloadSnapshot {
    return snapshot;
  },

  /** Start prefetching all game assets. Safe to call multiple times. */
  start(): void {
    if (started) return;
    started = true;

    const urls = [
      ...getAllCharacterModelUrls(),
      ...getAllPropUrls(),
      ...getAllAudioUrls(),
      ...getTileUrls(),
    ];
    update({ total: urls.length, loaded: 0, progress: 0, done: false });

    // Fetch in parallel with concurrency limit to avoid saturating the connection
    const CONCURRENCY = 4;
    let idx = 0;
    let loaded = 0;

    const next = async (): Promise<void> => {
      while (idx < urls.length) {
        const url = urls[idx++];
        try {
          await fetch(url);
        } catch {
          // Failed — skip, will load later when Babylon needs it
        }
        loaded++;
        update({ loaded, progress: loaded / urls.length, done: loaded === urls.length });
      }
    };

    // Start N workers
    const workers = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, () => next());
    Promise.all(workers);
  },
};
