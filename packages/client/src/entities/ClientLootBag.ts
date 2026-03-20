import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { fixGlbMaterials } from "./entityUtils";
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
  private glowDisc: AbstractMesh;
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
      fixGlbMaterials(this.modelMeshes, { metallic: 0, roughness: 0.8 });
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

    // Golden glow blob on the ground (fake light, zero GPU light cost)
    const glowDisc = MeshBuilder.CreateGround(
      `loot_glow_${id}`,
      { width: 2.5, height: 2.5 },
      scene,
    );
    glowDisc.position.set(x, 0.02, z); // just above floor to avoid z-fighting
    glowDisc.isPickable = false;

    // Procedural radial gradient texture
    const glowSize = 128;
    const glowTex = new DynamicTexture(`loot_glow_tex_${id}`, glowSize, scene, false);
    const ctx = glowTex.getContext();
    const cx = glowSize / 2;
    const gradient = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    gradient.addColorStop(0, "rgba(255, 200, 50, 0.6)");
    gradient.addColorStop(0.5, "rgba(255, 170, 30, 0.2)");
    gradient.addColorStop(1, "rgba(255, 150, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, glowSize, glowSize);
    glowTex.update();

    const glowMat = new StandardMaterial(`loot_glow_mat_${id}`, scene);
    glowMat.diffuseTexture = glowTex;
    glowMat.diffuseTexture.hasAlpha = true;
    glowMat.useAlphaFromDiffuseTexture = true;
    glowMat.emissiveTexture = glowTex;
    glowMat.disableLighting = true;
    glowMat.alpha = 0.3;
    glowMat.backFaceCulling = false;
    glowDisc.material = glowMat;
    this.glowDisc = glowDisc;

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
    // Dispose meshes but NOT materials (shared across all chest instances)
    this.anchor.dispose(false, false);
    this.hitbox.dispose();
    this.glowDisc.material?.dispose(true, true); // dispose textures + effects
    this.glowDisc.dispose();
  }
}
