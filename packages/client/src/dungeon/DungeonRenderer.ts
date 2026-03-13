import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  TileMap,
  TileType,
  TILE_SIZE,
  WALL_HEIGHT,
  WALL_DEPTH,
  unpackSetId,
  unpackVariant,
  tileSetNameFromId,
} from "@dungeon/shared";
import { FloorAssetLoader } from "./FloorAssetLoader";
import { WallAssetLoader, WallFace, FACE_DIRECTION, OPPOSITE_FACE } from "./WallAssetLoader";

export class DungeonRenderer {
  /** Floor meshes (GLB children) — used for InputManager raycasting */
  private floorMeshes: AbstractMesh[] = [];
  /** GLB instance root nodes — for disposal */
  private floorRoots: TransformNode[] = [];
  private wallMeshes: Mesh[] = [];

  /** Wall decoration instance roots — for disposal */
  private wallDecoRoots: TransformNode[] = [];
  /** Map from wall cube mesh → its decoration root nodes (for occlusion toggling) */
  private wallDecoMap: Map<Mesh, TransformNode[]> = new Map();

  private wallMaterial!: Material;

  private scene: Scene;
  private floorAssetLoader: FloorAssetLoader;
  private wallAssetLoader: WallAssetLoader;

  constructor(scene: Scene) {
    this.scene = scene;

    // Fallback wall material — replaced by PBR from GLBs after loadAssets()
    const fallback = new StandardMaterial("wallMat_fallback", scene);
    fallback.diffuseColor = Color3.FromHexString("#7a6a60");
    fallback.specularColor = new Color3(0.05, 0.05, 0.05);
    this.wallMaterial = fallback;

    this.floorAssetLoader = new FloorAssetLoader(scene);
    this.wallAssetLoader = new WallAssetLoader(scene);
  }

  /**
   * Pre-load floor and wall tile GLBs for the given sets. Must be called before render().
   * @param floorSetNames Array of set folder names for floors, e.g. ["set1", "set2"]
   * @param wallSetNames  Array of set folder names for walls, e.g. ["set1"]
   */
  async loadAssets(floorSetNames: string[], wallSetNames: string[]): Promise<void> {
    await Promise.all([
      this.floorAssetLoader.loadTileSets(floorSetNames),
      this.wallAssetLoader.loadTileSets(wallSetNames),
    ]);

    // Sample edge color from wall GLB textures → PBR material for wall cubes
    const pbrMat = await this.wallAssetLoader.getWallCubeMaterial();
    if (pbrMat) {
      this.wallMaterial = pbrMat;
    }
  }

  /**
   * Render the dungeon using GLB floor tiles, primitive wall boxes, and wall decorations.
   * @param map            The tile map
   * @param floorVariants  Flat row-major array of packed values: (setId << 8) | variant, 0 = non-floor
   * @param wallVariants   Flat row-major array of packed values for wall tiles, 0 = no decoration
   */
  render(map: TileMap, floorVariants: number[], wallVariants: number[]): void {
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
          const wallPacked = wallVariants[y * map.width + x];
          this.createWallBlock(map, worldX, worldZ, x, y, wallPacked);
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

  getWallDecoMap(): Map<Mesh, TransformNode[]> {
    return this.wallDecoMap;
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
    // Dispose wall decoration instances
    for (const root of this.wallDecoRoots) {
      root.dispose(false, true);
    }
    this.wallDecoRoots = [];
    this.wallDecoMap.clear();

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

  private createWallBlock(
    map: TileMap,
    worldX: number,
    worldZ: number,
    tileX: number,
    tileY: number,
    wallPacked: number,
  ): void {
    // Detect which sides have floor neighbors
    const floorN = map.isFloor(tileX, tileY - 1);
    const floorS = map.isFloor(tileX, tileY + 1);
    const floorW = map.isFloor(tileX - 1, tileY);
    const floorE = map.isFloor(tileX + 1, tileY);
    const hasNS = floorN || floorS;
    const hasEW = floorW || floorE;

    // Thin wall dimensions — full TILE_SIZE along the wall, WALL_DEPTH perpendicular
    let boxW = TILE_SIZE;
    let boxD = TILE_SIZE;
    let shiftX = 0;
    let shiftZ = 0;
    const edgeShift = (TILE_SIZE - WALL_DEPTH) / 2;

    if (hasNS && hasEW) {
      // Corner: small post — thin walls from adjacent tiles provide visual coverage
      boxW = WALL_DEPTH;
      boxD = WALL_DEPTH;
      // Shift toward the corner where the two floor edges meet
      if (floorS) shiftZ = edgeShift;
      else if (floorN) shiftZ = -edgeShift;
      if (floorE) shiftX = edgeShift;
      else if (floorW) shiftX = -edgeShift;
    } else if (hasNS && !hasEW) {
      boxD = WALL_DEPTH;
      if (floorS && !floorN) shiftZ = edgeShift;
      else if (floorN && !floorS) shiftZ = -edgeShift;
    } else if (hasEW && !hasNS) {
      boxW = WALL_DEPTH;
      if (floorE && !floorW) shiftX = edgeShift;
      else if (floorW && !floorE) shiftX = -edgeShift;
    }

    const wall = MeshBuilder.CreateBox(
      `wall_${tileX}_${tileY}`,
      { width: boxW, height: WALL_HEIGHT, depth: boxD },
      this.scene,
    );
    wall.position.set(worldX + shiftX, WALL_HEIGHT / 2, worldZ + shiftZ);
    wall.material = this.wallMaterial;
    wall.receiveShadows = true;
    this.wallMeshes.push(wall);

    // Place GLB decorations on exposed faces + back faces
    if (wallPacked <= 0) return;

    const setId = unpackSetId(wallPacked);
    const variant = unpackVariant(wallPacked);
    const setName = tileSetNameFromId(setId);
    if (!setName) return;

    const decos: TransformNode[] = [];

    const exposedFaces: Array<{ dx: number; dy: number; face: WallFace }> = [
      { dx: 0, dy: -1, face: WallFace.NORTH },
      { dx: 0, dy: 1, face: WallFace.SOUTH },
      { dx: -1, dy: 0, face: WallFace.WEST },
      { dx: 1, dy: 0, face: WallFace.EAST },
    ];

    for (const { dx, dy, face } of exposedFaces) {
      const nx = tileX + dx;
      const ny = tileY + dy;
      if (!map.isFloor(nx, ny)) continue;

      const dir = FACE_DIRECTION[face];
      const frontDist = TILE_SIZE / 2;

      // Front decoration: at tile boundary (same as before)
      const frontX = worldX + dir.x * frontDist;
      const frontZ = worldZ + dir.z * frontDist;
      const frontName = `wallDeco_${tileX}_${tileY}_f${face}`;
      const { root: frontRoot } = this.wallAssetLoader.instantiate(
        setName,
        variant,
        frontX,
        frontZ,
        face,
        frontName,
      );
      decos.push(frontRoot);
      this.wallDecoRoots.push(frontRoot);

      // Back decoration: opposite face of the thin wall
      const backFace = OPPOSITE_FACE[face];
      // Skip if the opposite side already has its own decoration (floor on both sides)
      const ox = tileX - dx;
      const oy = tileY - dy;
      if (map.isFloor(ox, oy)) continue;

      const backDist = frontDist - WALL_DEPTH;
      const backX = worldX + dir.x * backDist;
      const backZ = worldZ + dir.z * backDist;
      const backName = `wallDeco_${tileX}_${tileY}_b${face}`;
      const { root: backRoot } = this.wallAssetLoader.instantiate(
        setName,
        variant,
        backX,
        backZ,
        backFace,
        backName,
      );
      decos.push(backRoot);
      this.wallDecoRoots.push(backRoot);
    }

    if (decos.length > 0) {
      this.wallDecoMap.set(wall, decos);
    }
  }
}
