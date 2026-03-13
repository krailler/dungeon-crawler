import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

// Side-effect: register the glTF/GLB loader plugin (may already be loaded by FloorAssetLoader)
import "@babylonjs/loaders/glTF";

import { WALL_VARIANT_COUNT, TILE_SIZE, WALL_HEIGHT } from "@dungeon/shared";

// ─── Wall face directions ───────────────────────────────────────────

export const WallFace = {
  NORTH: 0,
  SOUTH: 1,
  WEST: 2,
  EAST: 3,
} as const;

export type WallFace = (typeof WallFace)[keyof typeof WallFace];

/**
 * Rotation Y (radians) for each face so the model's FRONT faces the floor tile.
 * After clearing rotationQuaternion the model's front faces +Z in local space.
 * We rotate so the front points toward the adjacent floor (toward the player).
 */
const FACE_ROTATION_Y: Record<WallFace, number> = {
  [WallFace.NORTH]: Math.PI, // front +Z rotates to -Z (faces north)
  [WallFace.SOUTH]: 0, // front +Z stays +Z (faces south)
  [WallFace.WEST]: -Math.PI / 2, // front +Z rotates to -X (faces west)
  [WallFace.EAST]: Math.PI / 2, // front +Z rotates to +X (faces east)
};

/**
 * Unit direction vector per face — multiply by desired offset distance.
 */
export const FACE_DIRECTION: Record<WallFace, { x: number; z: number }> = {
  [WallFace.NORTH]: { x: 0, z: -1 },
  [WallFace.SOUTH]: { x: 0, z: 1 },
  [WallFace.WEST]: { x: -1, z: 0 },
  [WallFace.EAST]: { x: 1, z: 0 },
};

/** Opposite face lookup. */
export const OPPOSITE_FACE: Record<WallFace, WallFace> = {
  [WallFace.NORTH]: WallFace.SOUTH,
  [WallFace.SOUTH]: WallFace.NORTH,
  [WallFace.WEST]: WallFace.EAST,
  [WallFace.EAST]: WallFace.WEST,
};

/**
 * Loads wall decoration GLB models for one or more tile sets and efficiently
 * instantiates them on exposed wall faces. Uses AssetContainer +
 * instantiateModelsToScene so all copies share the same GPU data.
 */
export class WallAssetLoader {
  private scene: Scene;
  /** setName → (variant → AssetContainer) */
  private containers: Map<string, Map<number, AssetContainer>> = new Map();
  /** setName → (variant → { scaleXZ, scaleY }) */
  private scaleFactors: Map<string, Map<number, { scaleXZ: number; scaleY: number }>> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Load GLB files for multiple tile sets in parallel.
   * @param setNames e.g. ["set1", "set2"]
   */
  async loadTileSets(setNames: string[]): Promise<void> {
    const toLoad = setNames.filter((name) => !this.containers.has(name));
    await Promise.all(toLoad.map((name) => this.loadTileSet(name)));
  }

  /**
   * Load all GLB files for a single tile set.
   * @param setName e.g. "set1"
   */
  async loadTileSet(setName: string): Promise<void> {
    const basePath = `/models/walls/${setName}/`;
    const setContainers = new Map<number, AssetContainer>();
    const setScales = new Map<number, { scaleXZ: number; scaleY: number }>();
    const promises: Promise<void>[] = [];

    for (let i = 1; i <= WALL_VARIANT_COUNT; i++) {
      const fileName = `wall_${i}.glb`;
      const p = LoadAssetContainerAsync(`${basePath}${fileName}`, this.scene).then((container) => {
        setContainers.set(i, container);
      });
      promises.push(p);
    }

    await Promise.all(promises);

    // Measure each variant and compute scale factors to fit TILE_SIZE × WALL_HEIGHT
    for (const [variant, container] of setContainers) {
      let minX = Infinity,
        maxX = -Infinity;
      let minY = Infinity,
        maxY = -Infinity;
      let minZ = Infinity,
        maxZ = -Infinity;

      for (const mesh of container.meshes) {
        if (!mesh.getBoundingInfo) continue;
        const bb = mesh.getBoundingInfo().boundingBox;
        minX = Math.min(minX, bb.minimumWorld.x);
        maxX = Math.max(maxX, bb.maximumWorld.x);
        minY = Math.min(minY, bb.minimumWorld.y);
        maxY = Math.max(maxY, bb.maximumWorld.y);
        minZ = Math.min(minZ, bb.minimumWorld.z);
        maxZ = Math.max(maxZ, bb.maximumWorld.z);
      }

      const modelWidth = maxX - minX;
      const modelHeight = maxY - minY;
      // We don't scale depth (Z) — the model is single-face so depth is negligible

      // Scale XZ to fit TILE_SIZE width, Y to fit WALL_HEIGHT
      const scaleXZ = modelWidth > 0 ? TILE_SIZE / modelWidth : 1;
      const scaleY = modelHeight > 0 ? WALL_HEIGHT / modelHeight : 1;

      setScales.set(variant, { scaleXZ, scaleY });
    }

    this.containers.set(setName, setContainers);
    this.scaleFactors.set(setName, setScales);

    console.log(`[WallAssetLoader] Loaded ${setContainers.size} variants from ${setName}`);
  }

  /**
   * Create an instance of a wall variant at the given world position on a specific face.
   *
   * @param setName  e.g. "set1"
   * @param variant  1-3 variant index
   * @param posX     final world X position for the decoration
   * @param posZ     final world Z position for the decoration
   * @param face     which direction the decoration faces
   * @param name     unique mesh name
   * @returns Object with root TransformNode and child meshes
   */
  instantiate(
    setName: string,
    variant: number,
    posX: number,
    posZ: number,
    face: WallFace,
    name: string,
  ): { root: TransformNode; meshes: AbstractMesh[] } {
    const setContainers = this.containers.get(setName);
    const container = setContainers?.get(variant);
    if (!container) {
      throw new Error(`[WallAssetLoader] Set "${setName}" variant ${variant} not loaded`);
    }

    const result = container.instantiateModelsToScene((sourceName) => `${name}_${sourceName}`);

    const root = result.rootNodes[0] as TransformNode;

    // Scale to fit TILE_SIZE × WALL_HEIGHT
    const scales = this.scaleFactors.get(setName)?.get(variant);
    if (scales) {
      root.scaling = new Vector3(scales.scaleXZ, scales.scaleY, scales.scaleXZ);
    }

    root.position.set(posX, 0, posZ);

    // Clear glTF rotationQuaternion so euler rotation.y takes effect
    root.rotationQuaternion = null;
    root.rotation.y = FACE_ROTATION_Y[face];

    // Setup meshes
    const meshes: AbstractMesh[] = [];
    for (const rootNode of result.rootNodes) {
      const childMeshes = rootNode.getChildMeshes(false);
      meshes.push(...childMeshes);
    }

    for (const mesh of meshes) {
      mesh.receiveShadows = true;
      mesh.isPickable = false;
    }

    return { root, meshes };
  }

  /**
   * Sample the average color from loaded wall albedo textures and return a flat
   * PBRMaterial that matches the overall perceived stone color.
   * Matches metallic/roughness from the GLB materials.
   * Must be called after loadTileSets().
   */
  async getWallCubeMaterial(): Promise<Material | null> {
    // Collect unique albedo textures + material properties from all loaded containers
    const seen = new Set<string>();
    const textures: { tex: any }[] = [];
    let roughness = 0.6;

    for (const [, setContainers] of this.containers) {
      for (const [, container] of setContainers) {
        for (const mesh of container.meshes) {
          const pbrMat = mesh.material as PBRMaterial | null;
          if (!pbrMat || !pbrMat.albedoTexture) continue;
          roughness = pbrMat.roughness ?? 0.6;
          const key = pbrMat.albedoTexture.uid ?? pbrMat.albedoTexture.name;
          if (seen.has(key)) continue;
          seen.add(key);
          textures.push({ tex: pbrMat.albedoTexture });
        }
      }
    }

    // Sample ALL opaque pixels from all unique textures
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let count = 0;

    for (const { tex } of textures) {
      try {
        const pixels = await tex.readPixels();
        if (!pixels) continue;
        const data = new Uint8Array(pixels.buffer);
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          totalR += data[i];
          totalG += data[i + 1];
          totalB += data[i + 2];
          count++;
        }
      } catch {
        // skip unreadable textures
      }
    }

    // Compute average color in linear space (textures have gammaSpace=false).
    // A flat color always looks brighter than a textured surface (no dark mortar
    // lines, no micro-shadow contrast) so we darken the average to match the
    // perceived brightness of the stone texture.
    const BRIGHTNESS_CORRECTION = 0.45;
    let r: number;
    let g: number;
    let b: number;
    if (count > 0) {
      r = (totalR / count / 255) * BRIGHTNESS_CORRECTION;
      g = (totalG / count / 255) * BRIGHTNESS_CORRECTION;
      b = (totalB / count / 255) * BRIGHTNESS_CORRECTION;
    } else {
      // Fallback: neutral stone gray in linear space
      r = 0.2;
      g = 0.2;
      b = 0.21;
    }

    const mat = new PBRMaterial("wallCubePBR", this.scene);
    mat.albedoColor = new Color3(r, g, b);
    mat.metallic = 0;
    mat.roughness = roughness;
    return mat;
  }

  /**
   * Dispose all loaded containers.
   */
  dispose(): void {
    for (const [, setContainers] of this.containers) {
      for (const [, container] of setContainers) {
        container.dispose();
      }
    }
    this.containers.clear();
    this.scaleFactors.clear();
  }
}
