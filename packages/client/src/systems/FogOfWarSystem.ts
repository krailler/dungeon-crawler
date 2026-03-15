import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import {
  FOG_INNER_RADIUS,
  FOG_OUTER_RADIUS,
  FOG_SPAWN_INNER_RADIUS,
  FOG_SPAWN_OUTER_RADIUS,
  FOG_SPAWN_TRANSITION,
} from "@dungeon/shared";

// Side-effect: depth renderer support
import "@babylonjs/core/Rendering/depthRendererSceneComponent";

const SHADER_NAME = "fogOfWar";

// Register fragment shader
Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = `
  precision highp float;

  varying vec2 vUV;

  uniform sampler2D textureSampler;
  uniform sampler2D depthSampler;
  uniform mat4 invViewProj;
  uniform vec3 playerPos;
  uniform float innerRadius;
  uniform float outerRadius;

  void main(void) {
    vec4 color = texture2D(textureSampler, vUV);
    float rawDepth = texture2D(depthSampler, vUV).r;

    // Background (no geometry) → fully dark
    if (rawDepth >= 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    // Reconstruct world position from depth buffer
    // Babylon depth renderer stores linear depth normalized to [0,1]
    // We reconstruct clip-space position and unproject
    vec2 ndc = vUV * 2.0 - 1.0;
    ndc.y = -ndc.y;

    // Map rawDepth back to clip-space Z
    // Babylon stores linearDepth/far, we need to convert to NDC Z
    // For perspective: ndcZ = (far + near - 2*near*far/linearDepth) / (far - near)
    // Simpler: use ray marching with near/far plane unprojection
    vec4 nearClip = invViewProj * vec4(ndc, -1.0, 1.0);
    vec4 farClip = invViewProj * vec4(ndc, 1.0, 1.0);
    nearClip.xyz /= nearClip.w;
    farClip.xyz /= farClip.w;

    // rawDepth is linear [0,1] where 0=near, 1=far
    vec3 worldPos = mix(nearClip.xyz, farClip.xyz, rawDepth);

    // Distance on XZ plane from player
    float dist = distance(worldPos.xz, playerPos.xz);

    // Smooth darkness falloff
    float fog = smoothstep(innerRadius, outerRadius, dist);

    gl_FragColor = vec4(color.rgb * (1.0 - fog), 1.0);
  }
`;

export class FogOfWarSystem {
  private postProcess: PostProcess;
  private playerX: number = 0;
  private playerZ: number = 0;
  private scene: Scene;
  private camera: Camera;
  private enabled: boolean = true;

  /** Spawn world position — used to expand fog radii near spawn */
  private spawnX: number = -9999;
  private spawnZ: number = -9999;

  /** Current interpolated fog radii (updated each frame) */
  private currentInner: number = FOG_INNER_RADIUS;
  private currentOuter: number = FOG_OUTER_RADIUS;

  // Pre-allocated temporaries to avoid per-frame allocations
  private tempMatrix: Matrix = Matrix.Identity();
  private tempPlayerPos: Vector3 = Vector3.Zero();

  constructor(scene: Scene, camera: Camera) {
    this.scene = scene;
    this.camera = camera;

    // Enable depth texture
    const depthRenderer = scene.enableDepthRenderer(camera, false);

    this.postProcess = new PostProcess(
      SHADER_NAME,
      SHADER_NAME,
      ["invViewProj", "playerPos", "innerRadius", "outerRadius"],
      ["depthSampler"],
      1.0,
      camera,
    );

    this.postProcess.onApply = (effect) => {
      const vp = this.scene.getTransformMatrix();
      vp.invertToRef(this.tempMatrix);
      effect.setMatrix("invViewProj", this.tempMatrix);

      this.tempPlayerPos.set(this.playerX, 0, this.playerZ);
      effect.setVector3("playerPos", this.tempPlayerPos);
      effect.setFloat("innerRadius", this.currentInner);
      effect.setFloat("outerRadius", this.currentOuter);

      effect.setTexture("depthSampler", depthRenderer.getDepthMap());
    };
  }

  /** Set the spawn room center — call once after dungeon render */
  setSpawnPosition(x: number, z: number): void {
    this.spawnX = x;
    this.spawnZ = z;
  }

  update(playerX: number, playerZ: number): void {
    this.playerX = playerX;
    this.playerZ = playerZ;

    // Lerp fog radii based on distance to spawn
    const dx = playerX - this.spawnX;
    const dz = playerZ - this.spawnZ;
    const distToSpawn = Math.sqrt(dx * dx + dz * dz);
    // t=0 at spawn, t=1 when FOG_SPAWN_TRANSITION away
    const t = Math.min(1, distToSpawn / FOG_SPAWN_TRANSITION);
    this.currentInner = FOG_SPAWN_INNER_RADIUS + (FOG_INNER_RADIUS - FOG_SPAWN_INNER_RADIUS) * t;
    this.currentOuter = FOG_SPAWN_OUTER_RADIUS + (FOG_OUTER_RADIUS - FOG_SPAWN_OUTER_RADIUS) * t;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (on) {
      this.camera.attachPostProcess(this.postProcess);
    } else {
      this.camera.detachPostProcess(this.postProcess);
    }
  }

  dispose(): void {
    this.postProcess.dispose();
  }
}
