import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TileMap, TileType } from "./TileMap";
import { TILE_SIZE } from "../utils/Constants";

const WALL_HEIGHT = 3;

export class DungeonRenderer {
  private floorMeshes: Mesh[] = [];
  private wallMeshes: Mesh[] = [];
  private floorMaterial: StandardMaterial;
  private wallMaterial: StandardMaterial;
  private spawnMaterial: StandardMaterial;
  private exitMaterial: StandardMaterial;

  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    this.floorMaterial = new StandardMaterial("floorMat", scene);
    this.floorMaterial.diffuseColor = new Color3(0.25, 0.22, 0.2);
    this.floorMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    this.wallMaterial = new StandardMaterial("wallMat", scene);
    this.wallMaterial.diffuseColor = new Color3(0.35, 0.3, 0.28);
    this.wallMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    this.spawnMaterial = new StandardMaterial("spawnMat", scene);
    this.spawnMaterial.diffuseColor = new Color3(0.2, 0.4, 0.6);
    this.spawnMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    this.exitMaterial = new StandardMaterial("exitMat", scene);
    this.exitMaterial.diffuseColor = new Color3(0.6, 0.4, 0.2);
    this.exitMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
  }

  render(map: TileMap): void {
    this.dispose();

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.get(x, y);
        const worldX = x * TILE_SIZE;
        const worldZ = y * TILE_SIZE;

        if (tile === TileType.FLOOR || tile === TileType.DOOR) {
          this.createFloorTile(worldX, worldZ, x, y, this.floorMaterial);
        } else if (tile === TileType.SPAWN) {
          this.createFloorTile(worldX, worldZ, x, y, this.spawnMaterial);
        } else if (tile === TileType.EXIT) {
          this.createFloorTile(worldX, worldZ, x, y, this.exitMaterial);
        } else if (tile === TileType.WALL && map.isAdjacentToFloor(x, y)) {
          this.createWallBlock(worldX, worldZ, x, y);
        }
      }
    }
  }

  getFloorMeshes(): Mesh[] {
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
    for (const mesh of this.floorMeshes) {
      mesh.dispose();
    }
    for (const mesh of this.wallMeshes) {
      mesh.dispose();
    }
    this.floorMeshes = [];
    this.wallMeshes = [];
  }

  private createFloorTile(
    worldX: number,
    worldZ: number,
    tileX: number,
    tileY: number,
    material: StandardMaterial,
  ): void {
    const floor = MeshBuilder.CreateBox(
      `floor_${tileX}_${tileY}`,
      { width: TILE_SIZE, height: 0.1, depth: TILE_SIZE },
      this.scene,
    );
    floor.position.set(worldX, 0, worldZ);
    floor.material = material;
    floor.receiveShadows = true;
    this.floorMeshes.push(floor);
  }

  private createWallBlock(
    worldX: number,
    worldZ: number,
    tileX: number,
    tileY: number,
  ): void {
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
