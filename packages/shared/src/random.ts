/**
 * Mulberry32 — a simple, fast, seeded 32-bit PRNG.
 * Returns a function that yields [0, 1) floats.
 */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Weighted random selection. Returns a 1-indexed variant number.
 *
 * @param weights      Weight for each option (index 0 = variant 1)
 * @param weightTotal  Pre-computed sum of all weights
 * @param rand         PRNG function returning [0, 1)
 */
export function selectByWeight(weights: number[], weightTotal: number, rand: () => number): number {
  const r = rand() * weightTotal;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return i + 1;
  }
  return weights.length; // fallback
}
