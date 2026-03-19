/**
 * Ground Slam VFX — dust/earth ring eruption + camera shake.
 */

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { VfxContext } from "./index";

const RING_DURATION = 500; // ms
const RING_SIZE = 6; // final ring diameter (matches ~4.0 aoeRange)
const DUST_DURATION = 400; // ms — particle emission time
const SHAKE_DURATION = 300; // ms
const SHAKE_INTENSITY = 0.06; // camera displacement

export function groundSlamVfx(ctx: VfxContext): void {
  impactRing(ctx);
  dustParticles(ctx);
  cameraShake(ctx);
}

function impactRing(ctx: VfxContext): void {
  const { scene, emitter, addTimer } = ctx;
  const pos = emitter.position;

  const mesh = MeshBuilder.CreateGround("vfx_slam_ring", { width: 1, height: 1 }, scene);
  mesh.position.set(pos.x, 0.03, pos.z);
  mesh.scaling.setAll(0.1);
  mesh.isPickable = false;

  const texSize = 128;
  const tex = new DynamicTexture("vfx_slam_ring_tex", texSize, scene, false);
  const ctx2d = tex.getContext();
  const cx = texSize / 2;

  // Brown/earth-tone ring gradient
  const gradient = ctx2d.createRadialGradient(cx, cx, 0, cx, cx, cx);
  gradient.addColorStop(0, "rgba(180, 120, 50, 0)");
  gradient.addColorStop(0.5, "rgba(180, 120, 50, 0)");
  gradient.addColorStop(0.65, "rgba(200, 140, 60, 0.6)");
  gradient.addColorStop(0.8, "rgba(160, 100, 40, 0.4)");
  gradient.addColorStop(1, "rgba(140, 80, 30, 0)");
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, texSize, texSize);
  tex.update();

  const mat = new StandardMaterial("vfx_slam_ring_mat", scene);
  mat.diffuseTexture = tex;
  mat.diffuseTexture.hasAlpha = true;
  mat.useAlphaFromDiffuseTexture = true;
  mat.emissiveTexture = tex;
  mat.disableLighting = true;
  mat.alpha = 0.9;
  mat.backFaceCulling = false;
  mesh.material = mat;

  const startTime = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / RING_DURATION, 1);

    // Ease-out
    const eased = 1 - (1 - t) * (1 - t);
    const scale = 0.1 + eased * RING_SIZE;
    mesh.scaling.set(scale, 1, scale);
    mat.alpha = 0.9 * (1 - t);

    if (t >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
      mesh.dispose();
      mat.dispose();
      tex.dispose();
    }
  });

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

function dustParticles(ctx: VfxContext): void {
  const { scene, emitter, addParticle, addTimer } = ctx;

  const ps = new ParticleSystem("vfx_slam_dust", 200, scene);
  ps.particleTexture = new Texture("/textures/flare.png", scene);

  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-1.0, 0, -1.0);
  ps.maxEmitBox = new Vector3(1.0, 0.1, 1.0);

  // Particles burst outward along the ground
  ps.direction1 = new Vector3(-3, 0.5, -3);
  ps.direction2 = new Vector3(3, 2, 3);
  ps.gravity = new Vector3(0, -2, 0);

  // Brown/earth dust colors
  ps.color1 = new Color4(0.7, 0.5, 0.25, 0.9);
  ps.color2 = new Color4(0.5, 0.35, 0.15, 0.7);
  ps.colorDead = new Color4(0.4, 0.3, 0.1, 0.0);

  ps.minSize = 0.06;
  ps.maxSize = 0.18;
  ps.minLifeTime = 0.3;
  ps.maxLifeTime = 0.8;
  ps.emitRate = 300;
  ps.minEmitPower = 2;
  ps.maxEmitPower = 5;
  ps.blendMode = ParticleSystem.BLENDMODE_ADD;

  ps.start();
  addParticle(ps);

  addTimer(setTimeout(() => ps.stop(), DUST_DURATION));
  addTimer(
    setTimeout(() => {
      ps.dispose();
    }, DUST_DURATION + 1200),
  );
}

function cameraShake(ctx: VfxContext): void {
  const { scene, addTimer } = ctx;
  const camera = scene.activeCamera;
  if (!camera) return;

  const startTime = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / SHAKE_DURATION, 1);

    // Decaying random shake
    const decay = 1 - t;
    const offsetX = (Math.random() - 0.5) * 2 * SHAKE_INTENSITY * decay;
    const offsetY = (Math.random() - 0.5) * 2 * SHAKE_INTENSITY * decay;
    camera.position.x += offsetX;
    camera.position.y += offsetY;

    if (t >= 1) {
      scene.onBeforeRenderObservable.remove(observer);
    }
  });

  addTimer(
    setTimeout(() => {
      scene.onBeforeRenderObservable.remove(observer);
    }, SHAKE_DURATION + 50),
  );
}
