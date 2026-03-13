import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  TileMap,
  TileType,
  TILE_SIZE,
  unpackSetId,
  unpackVariant,
  tileSetNameFromId,
} from "@dungeon/shared";
import { FloorAssetLoader } from "./FloorAssetLoader";

const WALL_HEIGHT = 3;

export class DungeonRenderer {
  /** Floor meshes (GLB children) — used for InputManager raycasting */
  private floorMeshes: AbstractMesh[] = [];
  /** GLB instance root nodes — for disposal */
  private floorRoots: TransformNode[] = [];
  private wallMeshes: Mesh[] = [];

  private wallMaterial: StandardMaterial;

  private scene: Scene;
  private floorAssetLoader: FloorAssetLoader;

  constructor(scene: Scene) {
    this.scene = scene;

    this.wallMaterial = new StandardMaterial("wallMat", scene);
    this.wallMaterial.diffuseColor = new Color3(0.35, 0.3, 0.28);
    this.wallMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    this.floorAssetLoader = new FloorAssetLoader(scene);
  }

  /**
   * Pre-load floor tile GLBs for the given sets. Must be called before render().
   * @param setNames Array of set folder names, e.g. ["set1", "set2"]
   */
  async loadAssets(setNames: string[]): Promise<void> {
    await this.floorAssetLoader.loadTileSets(setNames);
  }

  /**
   * Render the dungeon using GLB floor tiles and primitive wall boxes.
   * @param map            The tile map
   * @param floorVariants  Flat row-major array of packed values: (setId << 8) | variant, 0 = non-floor
   */
  render(map: TileMap, floorVariants: number[]): void {
    this.dispose();

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.get(x, y);
        const worldX = x * TILE_SIZE;
        const worldZ = y * TILE_SIZE;

        if (map.isFloor(x, y)) {
          const packed = floorVariants[y * map.width + x];
          if (packed > 0) {
            const setId = unpackSetId(packed);
            const variant = unpackVariant(packed);
            const setName = tileSetNameFromId(setId);
            if (setName) {
              this.createFloorTileGLB(worldX, worldZ, x, y, setName, variant);
            }
          }
        } else if (tile === TileType.WALL && map.isAdjacentToFloor(x, y)) {
          this.createWallBlock(worldX, worldZ, x, y);
        }
      }
    }
  }

  getFloorMeshes(): AbstractMesh[] {
    return this.floorMeshes;
  }

  getWallMeshes(): Mesh[] {
    return this.wallMeshes;
  }

  getSpawnWorldPosition(map: TileMap): Vector3 | null {
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.get(x, y) === TileType.SPAWN) {
          return new Vector3(x * TILE_SIZE, 0.5, y * TILE_SIZE);
        }
      }
    }
    return null;
  }

  dispose(): void {
    // Dispose GLB floor instances
    for (const root of this.floorRoots) {
      root.dispose(false, true);
    }
    this.floorRoots = [];
    this.floorMeshes = [];

    // Dispose wall meshes
    for (const mesh of this.wallMeshes) {
      mesh.dispose();
    }
    this.wallMeshes = [];
  }

  private createFloorTileGLB(
    worldX: number,
    worldZ: number,
    tileX: number,
    tileY: number,
    setName: string,
    variant: number,
  ): void {
    const name = `floor_${tileX}_${tileY}`;
    const { root, meshes } = this.floorAssetLoader.instantiate(
      setName,
      variant,
      worldX,
      worldZ,
      name,
    );
    this.floorRoots.push(root);
    this.floorMeshes.push(...meshes);
  }

  private createWallBlock(worldX: number, worldZ: number, tileX: number, tileY: number): void {
    const wall = MeshBuilder.CreateBox(
      `wall_${tileX}_${tileY}`,
      { width: TILE_SIZE, height: WALL_HEIGHT, depth: TILE_SIZE },
      this.scene,
    );
    wall.position.set(worldX, WALL_HEIGHT / 2, worldZ);
    wall.material = this.wallMaterial;
    wall.receiveShadows = true;
    this.wallMeshes.push(wall);
  }
}
