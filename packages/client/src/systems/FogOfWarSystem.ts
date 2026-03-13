import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { Effect } from "@babylonjs/core/Materials/effect";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { FOG_INNER_RADIUS, FOG_OUTER_RADIUS } from "@dungeon/shared";

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

  constructor(scene: Scene, camera: Camera) {
    this.scene = scene;

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
      effect.setMatrix("invViewProj", vp.clone().invert());

      effect.setVector3("playerPos", new Vector3(this.playerX, 0, this.playerZ));
      effect.setFloat("innerRadius", FOG_INNER_RADIUS);
      effect.setFloat("outerRadius", FOG_OUTER_RADIUS);

      effect.setTexture("depthSampler", depthRenderer.getDepthMap());
    };
  }

  update(playerX: number, playerZ: number): void {
    this.playerX = playerX;
    this.playerZ = playerZ;
  }

  dispose(): void {
    this.postProcess.dispose();
  }
}
