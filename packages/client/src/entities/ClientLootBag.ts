import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { InteractableMetadata } from "../core/InputManager";

export class ClientLootBag {
  private mesh: AbstractMesh;
  private light: PointLight;
  private renderObserver: Observer<Scene>;
  private startTime: number;
  readonly id: string;

  constructor(scene: Scene, id: string, x: number, z: number) {
    this.id = id;
    this.startTime = performance.now();

    // Golden sphere
    const sphere = MeshBuilder.CreateSphere(`loot_${id}`, { diameter: 0.5 }, scene);
    const mat = new StandardMaterial(`loot_mat_${id}`, scene);
    mat.diffuseColor = new Color3(1, 0.85, 0.2);
    mat.emissiveColor = new Color3(0.5, 0.4, 0.1);
    mat.specularColor = new Color3(0.3, 0.25, 0.1);
    sphere.material = mat;
    sphere.position.set(x, 0.35, z);
    sphere.isPickable = true;

    const meta: InteractableMetadata = { interactType: "loot", interactId: id };
    sphere.metadata = meta;

    this.mesh = sphere;

    // Subtle glow light
    this.light = new PointLight(`loot_light_${id}`, new Vector3(x, 0.5, z), scene);
    this.light.intensity = 0.3;
    this.light.range = 3;
    this.light.diffuse = new Color3(1, 0.85, 0.2);

    // Bobbing animation
    this.renderObserver = scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - this.startTime) / 1000;
      this.mesh.position.y = 0.35 + Math.sin(t * 2) * 0.08;
    })!;
  }

  getMesh(): AbstractMesh {
    return this.mesh;
  }

  dispose(): void {
    this.mesh.getScene().onBeforeRenderObservable.remove(this.renderObserver);
    this.mesh.dispose(false, true);
    this.light.dispose();
  }
}
