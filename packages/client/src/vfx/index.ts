/**
 * Skill VFX registry — maps animState names to visual effect functions.
 *
 * To add a new skill VFX:
 *   1. Create src/vfx/<animState>.ts exporting a VfxFn
 *   2. Import and register it in SKILL_VFX below
 */

import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { warCryVfx } from "./war_cry";
import { groundSlamVfx } from "./ground_slam";
import { heavyPunchVfx } from "./heavy_punch";
import { executeVfx } from "./execute";

export type VfxContext = {
  scene: Scene;
  /** Mesh to emit particles from / position reference */
  emitter: Mesh;
  /** Track a particle system for disposal on player cleanup */
  addParticle: (ps: ParticleSystem) => void;
  /** Track a timer for disposal on player cleanup */
  addTimer: (timer: ReturnType<typeof setTimeout>) => void;
};

type VfxFn = (ctx: VfxContext) => void;

const SKILL_VFX: Record<string, VfxFn> = {
  war_cry: warCryVfx,
  ground_slam: groundSlamVfx,
  heavy_punch: heavyPunchVfx,
  execute: executeVfx,
};

/** Play a skill VFX if one is registered for the given animState. */
export function playSkillVfx(animState: string, ctx: VfxContext): void {
  const fn = SKILL_VFX[animState];
  if (fn) fn(ctx);
}
