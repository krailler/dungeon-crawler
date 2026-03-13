import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TORCH_INTENSITY, TORCH_RANGE, TORCH_ANGLE } from "@dungeon/shared";

// Side-effect: shadow map support
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";

/** Smoothing factor — higher = snappier (0 = no movement, 1 = instant) */
const LERP_FACTOR = 12;

export class ClientPlayer {
  public mesh: Mesh;
  public isLocal: boolean;
  public torchLight: SpotLight | null = null;
  public shadowGenerator: ShadowGenerator | null = null;

  // Target state from server
  private targetX: number = 0;
  private targetZ: number = 0;
  private targetRotY: number = 0;

  constructor(scene: Scene, isLocal: boolean, id: string) {
    this.isLocal = isLocal;

    this.mesh = MeshBuilder.CreateCylinder(
      `player_${id}`,
      { height: 1.4, diameterTop: 0.6, diameterBottom: 0.7, tessellation: 12 },
      scene,
    );

    const head = MeshBuilder.CreateSphere(
      `playerHead_${id}`,
      { diameter: 0.65, segments: 8 },
      scene,
    );
    head.position.y = 0.9;
    head.parent = this.mesh;

    const material = new StandardMaterial(`playerMat_${id}`, scene);
    if (isLocal) {
      material.diffuseColor = new Color3(0.2, 0.6, 0.9);
    } else {
      material.diffuseColor = new Color3(0.2, 0.9, 0.4);
    }
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    this.mesh.material = material;
    head.material = material;

    this.mesh.position.y = 0.7;

    // Only local player gets a torch light
    if (isLocal) {
      this.torchLight = new SpotLight(
        `playerTorch_${id}`,
        new Vector3(0, 3, 0),
        new Vector3(0, -0.8, 0.2).normalize(),
        TORCH_ANGLE,
        1,
        scene,
      );
      this.torchLight.intensity = TORCH_INTENSITY;
      this.torchLight.range = TORCH_RANGE;
      this.torchLight.diffuse = new Color3(1.0, 0.85, 0.6);
      this.torchLight.specular = new Color3(0.5, 0.4, 0.3);
      this.torchLight.parent = this.mesh;

      // PCF shadow generator
      this.shadowGenerator = new ShadowGenerator(1024, this.torchLight);
      this.shadowGenerator.usePercentageCloserFiltering = true;
      this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    }
  }

  /** Called when server state changes */
  setServerState(x: number, z: number, rotY: number): void {
    this.targetX = x;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  /** Snap position immediately (used on first spawn) */
  snapToPosition(x: number, z: number): void {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.targetX = x;
    this.targetZ = z;
  }

  /** Interpolate toward server state each frame */
  update(dt: number): void {
    const t = 1 - Math.exp(-LERP_FACTOR * dt);
    this.mesh.position.x += (this.targetX - this.mesh.position.x) * t;
    this.mesh.position.z += (this.targetZ - this.mesh.position.z) * t;
    this.mesh.rotation.y = this.targetRotY;
  }

  getWorldPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  dispose(): void {
    this.shadowGenerator?.dispose();
    this.torchLight?.dispose();
    this.mesh.dispose();
  }
}
