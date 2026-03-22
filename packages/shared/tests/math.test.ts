import { describe, it, expect } from "bun:test";
import { distSq, angleBetween, isFromBehind } from "../src/math.js";

describe("distSq", () => {
  it("returns 0 for same point", () => {
    expect(distSq(3, 4, 3, 4)).toBe(0);
  });

  it("(0,0) to (3,4) = 25", () => {
    expect(distSq(0, 0, 3, 4)).toBe(25);
  });

  it("handles negative coordinates", () => {
    // (-1,-2) to (2,2): dx=3, dz=4 → 25
    expect(distSq(-1, -2, 2, 2)).toBe(25);
  });
});

describe("angleBetween", () => {
  it("returns 0 for same angle", () => {
    expect(angleBetween(1.0, 1.0)).toBeCloseTo(0, 5);
  });

  it("returns PI/2 for 90 degrees apart", () => {
    expect(angleBetween(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 5);
  });

  it("returns PI for opposite angles", () => {
    expect(angleBetween(0, Math.PI)).toBeCloseTo(Math.PI, 5);
  });

  it("wraps correctly beyond +/- PI", () => {
    // 0.1 and -0.1 + 2*PI should be ~0.2 apart
    expect(angleBetween(0.1, -0.1 + 2 * Math.PI)).toBeCloseTo(0.2, 5);
  });

  it("handles large angles", () => {
    expect(angleBetween(0, 3 * Math.PI)).toBeCloseTo(Math.PI, 5);
  });
});

describe("isFromBehind", () => {
  it("returns true when directly behind (180 degrees)", () => {
    // Target faces +Z (rotY=0), source is at -Z (behind)
    expect(isFromBehind(0, 0, 0, 0, -5)).toBe(true);
  });

  it("returns false when directly ahead", () => {
    // Target faces +Z (rotY=0), source is at +Z (ahead)
    expect(isFromBehind(0, 0, 0, 0, 5)).toBe(false);
  });

  it("returns false at 90 degrees (side)", () => {
    // Target faces +Z (rotY=0), source is at +X (right side)
    // hitAngle = atan2(5, 0) = PI/2, angleBetween(0, PI/2) = PI/2 ≈ 90°
    // 90° < 100° threshold → false
    expect(isFromBehind(0, 0, 0, 5, 0)).toBe(false);
  });

  it("respects custom threshold", () => {
    // At 90° with threshold 80° → true (90 > 80)
    expect(isFromBehind(0, 0, 0, 5, 0, 80)).toBe(true);
    // At 90° with threshold 100° → false (90 < 100)
    expect(isFromBehind(0, 0, 0, 5, 0, 100)).toBe(false);
  });
});
