import { describe, it, expect } from "bun:test";
import { mulberry32, selectByWeight } from "../src/random.js";

describe("mulberry32", () => {
  it("same seed produces same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const same = Array.from({ length: 10 }, () => a() === b()).every(Boolean);
    expect(same).toBe(false);
  });

  it("values are in [0, 1)", () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("selectByWeight", () => {
  it("single weight always returns 1", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 20; i++) {
      expect(selectByWeight([5], 5, rng)).toBe(1);
    }
  });

  it("selects first item when rand is near 0", () => {
    const result = selectByWeight([10, 20, 30], 60, () => 0);
    expect(result).toBe(1);
  });

  it("selects middle item", () => {
    // r = 0.25 * 60 = 15 -> cumulative: 10 (no), 30 (yes) -> index 1 -> returns 2
    const result = selectByWeight([10, 20, 30], 60, () => 0.25);
    expect(result).toBe(2);
  });

  it("selects last item when rand is near 1", () => {
    // r = 0.99 * 60 = 59.4 -> cumulative: 10 (no), 30 (no), 60 (yes) -> returns 3
    const result = selectByWeight([10, 20, 30], 60, () => 0.99);
    expect(result).toBe(3);
  });

  it("returns fallback (weights.length) when rand >= weightTotal", () => {
    // When rand() returns 1.0, r = 1.0 * 60 = 60, cumulative never exceeds r
    // because cumulative maxes at 60 and the check is r < cumulative (strict).
    // This triggers the fallback return on line 29.
    const result = selectByWeight([10, 20, 30], 60, () => 1.0);
    expect(result).toBe(3);
  });

  it("returns fallback when weightTotal is less than actual sum (r overshoots)", () => {
    // Passing a weightTotal smaller than actual sum doesn't matter —
    // what matters is rand() * weightTotal >= cumulative sum
    const result = selectByWeight([10, 20, 30], 60, () => 1.5);
    // r = 1.5 * 60 = 90 -> cumulative never reaches 90 -> fallback
    expect(result).toBe(3);
  });
});
