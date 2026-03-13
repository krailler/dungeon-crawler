import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// Side-effect: register the glTF/GLB loader plugin
import "@babylonjs/loaders/glTF";

import { FLOOR_VARIANT_COUNT, TILE_SIZE } from "@dungeon/shared";

/**
 * Loads floor tile GLB models for one or more tile sets and efficiently
 * instantiates them. Uses AssetContainer + instantiateModelsToScene so
 * all copies share the same geometry and material data (GPU-friendly).
 */
export class FloorAssetLoader {
  private scene: Scene;
  /** setName → (variant → AssetContainer) */
  private containers: Map<string, Map<number, AssetContainer>> = new Map();
  /** setName → (variant → scale factor) */
  private scaleFactors: Map<string, Map<number, number>> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Load GLB files for multiple tile sets in parallel.
   * @param setNames e.g. ["set1", "set2"]
   */
  async loadTileSets(setNames: string[]): Promise<void> {
    // Skip sets that are already loaded
    const toLoad = setNames.filter((name) => !this.containers.has(name));
    await Promise.all(toLoad.map((name) => this.loadTileSet(name)));
  }

  /**
   * Load all GLB files for a single tile set.
   * @param setName e.g. "set1"
   */
  async loadTileSet(setName: string): Promise<void> {
    const basePath = `/models/floors/${setName}/`;
    const setContainers = new Map<number, AssetContainer>();
    const setScales = new Map<number, number>();
    const promises: Promise<void>[] = [];

    for (let i = 1; i <= FLOOR_VARIANT_COUNT; i++) {
      const fileName = `floor_${i}.glb`;
      const p = LoadAssetContainerAsync(`${basePath}${fileName}`, this.scene).then((container) => {
        setContainers.set(i, container);
      });
      promises.push(p);
    }

    await Promise.all(promises);

    // Measure each variant and compute scale factor to fit TILE_SIZE
    for (const [variant, container] of setContainers) {
      let maxExtent = 0;
      for (const mesh of container.meshes) {
        if (!mesh.getBoundingInfo) continue;
        const bb = mesh.getBoundingInfo().boundingBox;
        maxExtent = Math.max(
          maxExtent,
          Math.abs(bb.minimumWorld.x),
          Math.abs(bb.maximumWorld.x),
          Math.abs(bb.minimumWorld.z),
          Math.abs(bb.maximumWorld.z),
        );
      }
      const modelSize = maxExtent * 2;
      const scale = modelSize > TILE_SIZE ? TILE_SIZE / modelSize : 1;
      setScales.set(variant, scale);
    }

    this.containers.set(setName, setContainers);
    this.scaleFactors.set(setName, setScales);

    console.log(`[FloorAssetLoader] Loaded ${setContainers.size} variants from ${setName}`);
  }

  /**
   * Create an instance of a floor variant at the given world position.
   *
   * @param setName e.g. "set1"
   * @param variant 1-8 variant index
   * @param worldX  world X position
   * @param worldZ  world Z position
   * @param name    unique mesh name
   * @returns Object with root TransformNode and child meshes
   */
  instantiate(
    setName: string,
    variant: number,
    worldX: number,
    worldZ: number,
    name: string,
  ): { root: TransformNode; meshes: AbstractMesh[] } {
    const setContainers = this.containers.get(setName);
    const container = setContainers?.get(variant);
    if (!container) {
      throw new Error(`[FloorAssetLoader] Set "${setName}" variant ${variant} not loaded`);
    }

    const result = container.instantiateModelsToScene((sourceName) => `${name}_${sourceName}`);

    // The first root node is the instance root (cast from Node to TransformNode)
    const root = result.rootNodes[0] as TransformNode;
    root.position.set(worldX, 0, worldZ);

    // Scale to fit TILE_SIZE if the model is oversized
    const scale = this.scaleFactors.get(setName)?.get(variant) ?? 1;
    if (scale < 1) {
      root.scaling.setAll(scale);
    }

    // Collect all meshes from the instance for raycasting
    const meshes: AbstractMesh[] = [];
    for (const rootNode of result.rootNodes) {
      const childMeshes = rootNode.getChildMeshes(false);
      meshes.push(...childMeshes);
    }

    // Enable shadow receiving on all meshes
    for (const mesh of meshes) {
      mesh.receiveShadows = true;
    }

    return { root, meshes };
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
