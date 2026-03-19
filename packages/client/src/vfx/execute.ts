/**
 * Execute VFX — crimson slash burst (finishing blow feel).
 */

import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { VfxContext } from "./index";

const PARTICLE_DURATION = 300; // ms

export function executeVfx(ctx: VfxContext): void {
  const { scene, emitter, addParticle, addTimer } = ctx;

  const ps = new ParticleSystem("vfx_execute", 120, scene);
  ps.particleTexture = new Texture("/textures/flare.png", scene);

  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-0.3, 0.2, -0.3);
  ps.maxEmitBox = new Vector3(0.3, 0.9, 0.3);

  // Aggressive outward burst — faster and wider than heavy_punch
  ps.direction1 = new Vector3(-2, 1, -2);
  ps.direction2 = new Vector3(2, 3, 2);
  ps.gravity = new Vector3(0, -1.5, 0);

  // Dark crimson / blood red: deep red → dark → fade
  ps.color1 = new Color4(0.9, 0.05, 0.05, 1.0);
  ps.color2 = new Color4(0.7, 0.0, 0.0, 0.9);
  ps.colorDead = new Color4(0.3, 0.0, 0.0, 0.0);

  ps.minSize = 0.04;
  ps.maxSize = 0.14;
  ps.minLifeTime = 0.25;
  ps.maxLifeTime = 0.6;
  ps.emitRate = 300;
  ps.minEmitPower = 2;
  ps.maxEmitPower = 4;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;

  ps.start();
  addParticle(ps);

  addTimer(setTimeout(() => ps.stop(), PARTICLE_DURATION));
  addTimer(
    setTimeout(() => {
      ps.dispose();
    }, PARTICLE_DURATION + 900),
  );
}
