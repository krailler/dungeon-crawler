import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import type { Material } from "@babylonjs/core/Materials/material";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";

/** Minimum alpha for walls deep behind the camera */
const MIN_ALPHA = 0.01;
/** Dot value where fading begins (positive → well ahead of the threshold for smooth entry) */
const FADE_START = 3.0;
/** Dot value where fade reaches minimum alpha */
const FADE_END = -4.0;

/**
 * Material plugin that computes a per-pixel alpha gradient for wall occlusion.
 *
 * Instead of setting a flat alpha per wall mesh, this plugin injects GLSL code
 * into the PBR fragment shader that smoothly interpolates alpha based on each
 * fragment's world-space position relative to the player and camera direction.
 *
 * Shared uniforms (player position + camera normal) are updated once per frame
 * via the static `updateGlobals()` method.
 */
export class WallFadePlugin extends MaterialPluginBase {
  // ── Shared state updated once per frame ────────────────────────────────────
  private static _playerX = 0;
  private static _playerZ = 0;
  private static _normX = 0;
  private static _normZ = 0;

  /** Call once per frame before rendering to update shared uniforms. */
  static updateGlobals(playerX: number, playerZ: number, normX: number, normZ: number): void {
    WallFadePlugin._playerX = playerX;
    WallFadePlugin._playerZ = playerZ;
    WallFadePlugin._normX = normX;
    WallFadePlugin._normZ = normZ;
  }

  constructor(material: Material) {
    super(material, "WallFade", 200, { WALL_FADE: false }, true, true);
  }

  override getClassName(): string {
    return "WallFadePlugin";
  }

  override getUniforms(): {
    ubo: Array<{ name: string; size: number; type: string }>;
    fragment: string;
  } {
    return {
      ubo: [
        { name: "wfPlayerPos", size: 2, type: "vec2" },
        { name: "wfCameraNorm", size: 2, type: "vec2" },
        { name: "wfFadeStart", size: 1, type: "float" },
        { name: "wfFadeRange", size: 1, type: "float" },
        { name: "wfMinAlpha", size: 1, type: "float" },
      ],
      fragment: `
        uniform vec2 wfPlayerPos;
        uniform vec2 wfCameraNorm;
        uniform float wfFadeStart;
        uniform float wfFadeRange;
        uniform float wfMinAlpha;
      `,
    };
  }

  override bindForSubMesh(
    uniformBuffer: UniformBuffer,
    _scene: Scene,
    _engine: AbstractEngine,
    _subMesh: SubMesh,
  ): void {
    uniformBuffer.updateFloat2("wfPlayerPos", WallFadePlugin._playerX, WallFadePlugin._playerZ);
    uniformBuffer.updateFloat2("wfCameraNorm", WallFadePlugin._normX, WallFadePlugin._normZ);
    uniformBuffer.updateFloat("wfFadeStart", FADE_START);
    uniformBuffer.updateFloat("wfFadeRange", FADE_START - FADE_END);
    uniformBuffer.updateFloat("wfMinAlpha", MIN_ALPHA);
  }

  override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
    if (shaderType === "fragment") {
      return {
        // Injected right after `float alpha = ...` in the PBR fragment shader
        CUSTOM_FRAGMENT_UPDATE_ALPHA: `
          {
            vec2 toFrag = vPositionW.xz - wfPlayerPos;
            float d = dot(toFrag, wfCameraNorm);
            float t = clamp((wfFadeStart - d) / wfFadeRange, 0.0, 1.0);
            // Smoothstep for a nicer curve (ease in/out instead of linear)
            t = t * t * (3.0 - 2.0 * t);
            alpha *= mix(1.0, wfMinAlpha, t);
          }
        `,
      };
    }
    return null;
  }
}
