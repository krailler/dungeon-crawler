import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { InteractableMetadata } from "../core/InputManager";

/** Scale of the chest model */
const CHEST_SCALE = 0.04;
/** Y offset for bobbing center */
const BOB_Y = 0.15;
/** Bobbing amplitude */
const BOB_AMPLITUDE = 0.06;
/** Bobbing speed */
const BOB_SPEED = 2;
/** Slow rotation speed (radians/s) */
const ROTATE_SPEED = 0.8;

export class ClientLootBag {
  private anchor: TransformNode;
  private modelMeshes: AbstractMesh[] = [];
  private hitbox: AbstractMesh;
  private light: PointLight;
  private renderObserver: Observer<Scene>;
  private startTime: number;
  readonly id: string;

  constructor(scene: Scene, id: string, x: number, z: number, container: AssetContainer | null) {
    this.id = id;
    this.startTime = performance.now();

    // Invisible anchor for positioning
    this.anchor = new TransformNode(`loot_anchor_${id}`, scene);
    this.anchor.position.set(x, BOB_Y, z);

    if (container) {
      // Instantiate chest model
      const result = container.instantiateModelsToScene((sourceName) => `loot_${id}_${sourceName}`);
      const root = result.rootNodes[0] as TransformNode;
      root.parent = this.anchor;
      root.scaling.setAll(CHEST_SCALE);

      this.modelMeshes = root.getChildMeshes(false);
      for (const m of this.modelMeshes) {
        const mat = m.material;
        if (mat instanceof PBRMaterial) {
          mat.alpha = 1;
          mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
          mat.backFaceCulling = true;
          mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 0.4);
        }
        m.isPickable = false;
      }
    }

    // Invisible hitbox for click targeting
    this.hitbox = MeshBuilder.CreateCylinder(
      `loot_hitbox_${id}`,
      { height: 1.0, diameter: 1.0, tessellation: 8 },
      scene,
    );
    this.hitbox.parent = this.anchor;
    this.hitbox.position.y = 0.3;
    this.hitbox.visibility = 0;
    this.hitbox.isPickable = true;

    const meta: InteractableMetadata = { interactType: "loot", interactId: id };
    this.hitbox.metadata = meta;

    // Subtle glow light
    this.light = new PointLight(`loot_light_${id}`, new Vector3(x, 0.5, z), scene);
    this.light.intensity = 0.3;
    this.light.range = 3;
    this.light.diffuse = new Color3(1, 0.85, 0.2);

    // Bobbing + rotation animation
    this.renderObserver = scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - this.startTime) / 1000;
      this.anchor.position.y = BOB_Y + Math.sin(t * BOB_SPEED) * BOB_AMPLITUDE;
      this.anchor.rotation.y += (ROTATE_SPEED * scene.getEngine().getDeltaTime()) / 1000;
    })!;
  }

  getMesh(): AbstractMesh {
    return this.hitbox;
  }

  dispose(): void {
    this.anchor.getScene().onBeforeRenderObservable.remove(this.renderObserver);
    this.anchor.dispose(false, true);
    this.hitbox.dispose();
    this.light.dispose();
  }
}
