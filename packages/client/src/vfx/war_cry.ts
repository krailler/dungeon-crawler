/**
 * War Cry VFX — expanding orange ring + ascending particle burst.
 */

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { VfxContext } from "./index";

const RING_DURATION = 600; // ms — ring expansion time
const RING_SIZE = 8; // final ring diameter
const PARTICLE_DURATION = 500; // ms — particle emission time

export function warCryVfx(ctx: VfxContext): void {
  ring(ctx);
  particles(ctx);
}

function ring(ctx: VfxContext): void {
  const { scene, emitter, addTimer } = ctx;
  const pos = emitter.position;

  // Ground disc with radial gradient (emissive, no light cost)
  const mesh = MeshBuilder.CreateGround("vfx_warcry_ring", { width: 1, height: 1 }, scene);
  mesh.position.set(pos.x, 0.03, pos.z);
  mesh.scaling.setAll(0.1);
  mesh.isPickable = false;

  const texSize = 128;
  const tex = new DynamicTexture("vfx_warcry_ring_tex", texSize, scene, false);
  const ctx2d = tex.getContext();
  const cx = texSize / 2;

  // Hollow ring gradient: transparent center → orange ring → transparent edge
  const gradient = ctx2d.createRadialGradient(cx, cx, 0, cx, cx, cx);
  gradient.addColorStop(0, "rgba(255, 160, 30, 0)");
  gradient.addColorStop(0.55, "rgba(255, 160, 30, 0)");
  gradient.addColorStop(0.7, "rgba(255, 180, 50, 0.7)");
  gradient.addColorStop(0.85, "rgba(255, 140, 20, 0.5)");
  gradient.addColorStop(1, "rgba(255, 120, 10, 0)");
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, texSize, texSize);
  tex.update();

  const mat = new StandardMaterial("vfx_warcry_ring_mat", scene);
  mat.diffuseTexture = tex;
  mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.emissiveTexture = tex;
  mat.disableLighting = true;
  mat.alpha = 0.8;
  mat.backFaceCulling = false;
  mesh.material = mat;

  // Animate: expand + fade out
  const startTime = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / RING_DURATION, 1);

    // Ease-out: fast start, slow end
    const eased = 1 - (1 - t) * (1 - t);
    const scale = 0.1 + eased * RING_SIZE;
    mesh.scaling.set(scale, 1, scale);
    mat.alpha = 0.8 * (1 - t);

    if (t >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      mesh.dispose();
      mat.dispose();
      tex.dispose();
    }
  });

  // Safety cleanup in case scene disposes mid-animation
  addTimer(
    setTimeout(() => {
      scene.onBeforeRenderObservable.remove(observer);
      try {
        mesh.dispose();
        mat.dispose();
        tex.dispose();
      } catch {
        // Already disposed
      }
    }, RING_DURATION + 100),
  );
}

function particles(ctx: VfxContext): void {
  const { scene, emitter, addParticle, addTimer } = ctx;

  const ps = new ParticleSystem("vfx_warcry_particles", 150, scene);
  ps.particleTexture = new Texture("/textures/flare.png", scene);

  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-0.6, 0, -0.6);
  ps.maxEmitBox = new Vector3(0.6, 0.3, 0.6);

  // Particles burst outward and upward
  ps.direction1 = new Vector3(-1.5, 2, -1.5);
  ps.direction2 = new Vector3(1.5, 4, 1.5);
  ps.gravity = new Vector3(0, -0.3, 0);

  // Orange/golden color: bright → warm amber → fade
  ps.color1 = new Color4(1.0, 0.7, 0.2, 1.0);
  ps.color2 = new Color4(1.0, 0.5, 0.1, 0.9);
  ps.colorDead = new Color4(1.0, 0.3, 0.0, 0.0);

  ps.minSize = 0.04;
  ps.maxSize = 0.12;
  ps.minLifeTime = 0.4;
  ps.maxLifeTime = 0.9;
  ps.emitRate = 200;
  ps.minEmitPower = 1.5;
  ps.maxEmitPower = 3.0;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;

  ps.start();
  addParticle(ps);

  addTimer(setTimeout(() => ps.stop(), PARTICLE_DURATION));
  addTimer(
    setTimeout(() => {
      ps.dispose();
    }, PARTICLE_DURATION + 1200),
  );
}
