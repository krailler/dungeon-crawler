import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Material } from "@babylonjs/core/Materials/material";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color4 as BColor4 } from "@babylonjs/core/Maths/math.color";
import {
  TileMap,
  TileType,
  TILE_SIZE,
  WALL_HEIGHT,
  WALL_DEPTH,
  WALL_TORCH_INTENSITY,
  WALL_TORCH_RANGE,
  WALL_TORCH_CHANCE,
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

  /** Wall torch lights and particles */
  private torchLights: PointLight[] = [];
  private torchParticles: ParticleSystem[] = [];

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

    // Dispose torch lights & particles
    for (const ps of this.torchParticles) {
      ps.dispose();
    }
    this.torchParticles = [];
    for (const light of this.torchLights) {
      light.dispose();
    }
    this.torchLights = [];

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

  /**
   * One independent thin wall per exposed face.
   * Corners → two walls in L. Room junctions → two separate walls, one per room.
   */
  private createWallBlock(
    map: TileMap,
    worldX: number,
    worldZ: number,
    tileX: number,
    tileY: number,
    wallPacked: number,
  ): void {
    const edgeShift = (TILE_SIZE - WALL_DEPTH) / 2;

    // One thin wall per floor-adjacent face
    if (map.isFloor(tileX, tileY - 1)) {
      this.createWallSegment(
        worldX,
        worldZ,
        tileX,
        tileY,
        TILE_SIZE,
        WALL_DEPTH,
        0,
        -edgeShift,
        WallFace.NORTH,
        wallPacked,
        "_n",
      );
    }
    if (map.isFloor(tileX, tileY + 1)) {
      this.createWallSegment(
        worldX,
        worldZ,
        tileX,
        tileY,
        TILE_SIZE,
        WALL_DEPTH,
        0,
        edgeShift,
        WallFace.SOUTH,
        wallPacked,
        "_s",
      );
    }
    if (map.isFloor(tileX - 1, tileY)) {
      this.createWallSegment(
        worldX,
        worldZ,
        tileX,
        tileY,
        WALL_DEPTH,
        TILE_SIZE,
        -edgeShift,
        0,
        WallFace.WEST,
        wallPacked,
        "_w",
      );
    }
    if (map.isFloor(tileX + 1, tileY)) {
      this.createWallSegment(
        worldX,
        worldZ,
        tileX,
        tileY,
        WALL_DEPTH,
        TILE_SIZE,
        edgeShift,
        0,
        WallFace.EAST,
        wallPacked,
        "_e",
      );
    }
  }

  /** Create a single thin wall + its decoration for one face. */
  private createWallSegment(
    worldX: number,
    worldZ: number,
    tileX: number,
    tileY: number,
    boxW: number,
    boxD: number,
    shiftX: number,
    shiftZ: number,
    face: WallFace,
    wallPacked: number,
    nameSuffix: string,
  ): void {
    const meta = {
      floorN: face === WallFace.NORTH,
      floorS: face === WallFace.SOUTH,
      floorW: face === WallFace.WEST,
      floorE: face === WallFace.EAST,
    };

    // Invisible anchor — only used by WallOcclusionSystem for position tracking
    const wall = MeshBuilder.CreateGround(
      `wall_${tileX}_${tileY}${nameSuffix}`,
      { width: boxW, height: boxD },
      this.scene,
    );
    wall.position.set(worldX + shiftX, WALL_HEIGHT, worldZ + shiftZ);
    wall.visibility = 0;
    wall.isPickable = false;
    wall.metadata = meta;
    this.wallMeshes.push(wall);

    if (wallPacked <= 0) return;

    const setId = unpackSetId(wallPacked);
    const variant = unpackVariant(wallPacked);
    const setName = tileSetNameFromId(setId);
    if (!setName) return;

    const decos: TransformNode[] = [];
    const dir = FACE_DIRECTION[face];
    const frontDist = TILE_SIZE / 2;

    // Front decoration at tile boundary
    const frontX = worldX + dir.x * frontDist;
    const frontZ = worldZ + dir.z * frontDist;
    const frontName = `wallDeco_${tileX}_${tileY}_f${face}${nameSuffix}`;
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

    // Back decoration on the inside of the thin wall
    const backDist = frontDist - WALL_DEPTH;
    const backX = worldX + dir.x * backDist;
    const backZ = worldZ + dir.z * backDist;
    const backFace = OPPOSITE_FACE[face];
    const backName = `wallDeco_${tileX}_${tileY}_b${face}${nameSuffix}`;
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

    this.wallDecoMap.set(wall, decos);

    // Deterministic torch placement on front face only
    const hash = ((tileX * 73856093) ^ (tileY * 19349663) ^ (face * 83492791)) >>> 0;
    if ((hash % 1000) / 1000 < WALL_TORCH_CHANCE) {
      this.createWallTorch(frontX, frontZ, dir);
    }
  }

  private createWallTorch(x: number, z: number, dir: { x: number; z: number }): void {
    const torchY = WALL_HEIGHT * 0.6;
    // Offset slightly inward from wall face
    const offsetDist = 0.3;
    const px = x - dir.x * offsetDist;
    const pz = z - dir.z * offsetDist;

    const name = `wallTorch_${this.torchLights.length}`;

    // PointLight
    const light = new PointLight(name, new Vector3(px, torchY, pz), this.scene);
    light.intensity = WALL_TORCH_INTENSITY;
    light.range = WALL_TORCH_RANGE;
    light.diffuse = new Color3(1.0, 0.7, 0.3);
    light.specular = new Color3(0.4, 0.2, 0.1);
    this.torchLights.push(light);

    // Fire particle system
    const ps = new ParticleSystem(`${name}_fire`, 30, this.scene);
    ps.createPointEmitter(new Vector3(-0.05, 0, -0.05), new Vector3(0.05, 0.3, 0.05));
    ps.emitter = new Vector3(px, torchY, pz);

    // Use default particle texture (built-in)
    ps.particleTexture = new Texture(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAKNJREFUWEft1DEKwDAMA1D5/0enQ4eQIZClxKR0syT+NjapzN1i5v4tAD8HZG4ROU7MfBb4x8gRwMzswF0AhxVPAPpMAO4GACIAMA3knIDtACIA0ACsAmDrAEIA0ADMAqDLAGIA0ABMAaDrAOIA0ABMA6DrABIA0ABsA6DLAFIAnwB+f4qPfwB3d/3+q/nqrxDy/0KyD2j/HNj+M2S7A/0OAN8JbtwgkzFIRwAAAABJRU5ErkJggg==",
      this.scene,
    );

    ps.minSize = 0.1;
    ps.maxSize = 0.25;
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.5;
    ps.emitRate = 20;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;

    ps.color1 = new BColor4(1.0, 0.6, 0.1, 1.0);
    ps.color2 = new BColor4(1.0, 0.3, 0.0, 0.8);
    ps.colorDead = new BColor4(0.3, 0.1, 0.0, 0.0);

    ps.minEmitPower = 0.3;
    ps.maxEmitPower = 0.6;
    ps.updateSpeed = 0.02;

    ps.gravity = new Vector3(0, 1.5, 0);

    ps.start();
    this.torchParticles.push(ps);
  }
}
