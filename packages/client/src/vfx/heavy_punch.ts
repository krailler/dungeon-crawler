/**
 * Heavy Punch VFX — red impact flash (used by Heavy Strike + Execute).
 */

import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { VfxContext } from "./index";

const PARTICLE_DURATION = 250; // ms — short, punchy burst

export function heavyPunchVfx(ctx: VfxContext): void {
  const { scene, emitter, addParticle, addTimer } = ctx;

  const ps = new ParticleSystem("vfx_heavy_punch", 80, scene);
  ps.particleTexture = new Texture("/textures/flare.png", scene);

  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-0.3, 0.3, -0.3);
  ps.maxEmitBox = new Vector3(0.3, 0.8, 0.3);

  // Particles burst outward from impact point
  ps.direction1 = new Vector3(-1.5, 0.5, -1.5);
  ps.direction2 = new Vector3(1.5, 2.5, 1.5);
  ps.gravity = new Vector3(0, -1, 0);

  // Red/crimson impact: bright red → dark red → fade
  ps.color1 = new Color4(1.0, 0.2, 0.1, 1.0);
  ps.color2 = new Color4(0.9, 0.1, 0.05, 0.8);
  ps.colorDead = new Color4(0.6, 0.0, 0.0, 0.0);

  ps.minSize = 0.03;
  ps.maxSize = 0.1;
  ps.minLifeTime = 0.2;
  ps.maxLifeTime = 0.5;
  ps.emitRate = 250;
  ps.minEmitPower = 1;
  ps.maxEmitPower = 3;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;

  ps.start();
  addParticle(ps);

  addTimer(setTimeout(() => ps.stop(), PARTICLE_DURATION));
  addTimer(
    setTimeout(() => {
      ps.dispose();
    }, PARTICLE_DURATION + 800),
  );
}
