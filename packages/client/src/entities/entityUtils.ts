import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

/**
 * Fix GLB materials: force opaque + tame emissive for dungeon lighting.
 * Optionally set metallic/roughness overrides.
 */
export function fixGlbMaterials(
  meshes: AbstractMesh[],
  opts?: { metallic?: number; roughness?: number },
): void {
  for (const m of meshes) {
    const mat = m.material;
    if (mat instanceof PBRMaterial) {
      mat.alpha = 1;
      mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
      mat.backFaceCulling = true;
      mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 0.4);
      if (opts?.metallic != null) mat.metallic = opts.metallic;
      if (opts?.roughness != null) mat.roughness = opts.roughness;
    }
    m.isPickable = false;
  }
}

/**
 * Create an invisible hitbox cylinder for click targeting.
 */
export function createHitboxMesh(
  name: string,
  parent: TransformNode,
  scene: Scene,
  metadata: { pickType: string; pickId: string },
  opts?: { diameter?: number; height?: number },
): Mesh {
  const hitbox = MeshBuilder.CreateCylinder(
    name,
    {
      diameter: opts?.diameter ?? 1.2,
      height: opts?.height ?? 2.0,
    },
    scene,
  );
  hitbox.parent = parent;
  hitbox.position.y = (opts?.height ?? 2.0) / 2;
  hitbox.visibility = 0;
  hitbox.isPickable = true;
  hitbox.metadata = metadata;
  return hitbox;
}
