import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { WallFadePlugin } from "./WallFadePlugin";

const OCCLUDE_RADIUS = 10;
const OCCLUDE_RADIUS_SQ = OCCLUDE_RADIUS * OCCLUDE_RADIUS;
/** Spatial grid cell size — matches occlusion radius for efficient 3×3 lookup */
const GRID_CELL_SIZE = OCCLUDE_RADIUS;

type WallFace = "n" | "s" | "w" | "e";

export class WallOcclusionSystem {
  /**
   * Per decoration-mesh: original material + faded clone (with WallFadePlugin).
   * The plugin computes per-pixel alpha in the shader — no flat alpha needed.
   */
  private decoMaterialCache: Map<AbstractMesh, { original: Material; faded: Material }> = new Map();
  /** Walls currently using the faded material */
  private fadedWalls: Set<Mesh> = new Set();
  private camera: ArcRotateCamera;
  private wallDecoMap: Map<Mesh, TransformNode[]>;
  /** Spatial grid: cell key → walls in that cell */
  private grid: Map<number, Mesh[]> = new Map();
  /** Pre-computed adjacent neighbors for L-corner propagation */
  private neighbors: Map<Mesh, Mesh[]> = new Map();

  constructor(
    _scene: Scene,
    camera: ArcRotateCamera,
    wallMeshes: Mesh[],
    wallDecoMap: Map<Mesh, TransformNode[]>,
  ) {
    this.camera = camera;
    this.wallDecoMap = wallDecoMap;

    for (const wall of wallMeshes) {
      const key = this.cellKey(wall.position.x, wall.position.z);
      let bucket = this.grid.get(key);
      if (!bucket) {
        bucket = [];
        this.grid.set(key, bucket);
      }
      bucket.push(wall);
    }

    this.buildNeighbors(wallMeshes);
  }

  // ── Neighbor graph (perpendicular + parallel) ─────────────────────────────

  private buildNeighbors(wallMeshes: Mesh[]): void {
    const byKey = new Map<string, Mesh>();
    const wallInfo = new Map<Mesh, { tx: number; ty: number; face: WallFace }>();

    for (const wall of wallMeshes) {
      const parsed = this.parseWallName(wall.name);
      if (!parsed) continue;
      byKey.set(`${parsed.tx}_${parsed.ty}_${parsed.face}`, wall);
      wallInfo.set(wall, parsed);
    }

    for (const wall of wallMeshes) {
      const info = wallInfo.get(wall);
      if (!info) continue;
      const { tx, ty, face } = info;
      const adj: Mesh[] = [];

      if (face === "n" || face === "s") {
        this.pushIfExists(byKey, `${tx}_${ty}_w`, adj);
        this.pushIfExists(byKey, `${tx}_${ty}_e`, adj);
        this.pushIfExists(byKey, `${tx - 1}_${ty}_e`, adj);
        this.pushIfExists(byKey, `${tx + 1}_${ty}_w`, adj);
        this.pushIfExists(byKey, `${tx - 1}_${ty}_${face}`, adj);
        this.pushIfExists(byKey, `${tx + 1}_${ty}_${face}`, adj);
      } else {
        this.pushIfExists(byKey, `${tx}_${ty}_n`, adj);
        this.pushIfExists(byKey, `${tx}_${ty}_s`, adj);
        this.pushIfExists(byKey, `${tx}_${ty - 1}_s`, adj);
        this.pushIfExists(byKey, `${tx}_${ty + 1}_n`, adj);
        this.pushIfExists(byKey, `${tx}_${ty - 1}_${face}`, adj);
        this.pushIfExists(byKey, `${tx}_${ty + 1}_${face}`, adj);
      }

      if (adj.length > 0) this.neighbors.set(wall, adj);
    }
  }

  private parseWallName(name: string): { tx: number; ty: number; face: WallFace } | null {
    const match = name.match(/^wall_(\d+)_(\d+)_([nswe])$/);
    if (!match) return null;
    return { tx: +match[1], ty: +match[2], face: match[3] as WallFace };
  }

  private pushIfExists(map: Map<string, Mesh>, key: string, out: Mesh[]): void {
    const m = map.get(key);
    if (m) out.push(m);
  }

  private cellKey(x: number, z: number): number {
    const cx = Math.floor(x / GRID_CELL_SIZE);
    const cz = Math.floor(z / GRID_CELL_SIZE);
    return cx * 10007 + cz;
  }

  // ── Per-frame update ──────────────────────────────────────────────────────

  update(playerX: number, playerZ: number): void {
    const camPos = this.camera.position;
    const camTarget = this.camera.target;
    const dirX = camTarget.x - camPos.x;
    const dirZ = camTarget.z - camPos.z;
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const normX = dirX / dirLen;
    const normZ = dirZ / dirLen;

    // Update shared shader uniforms (once per frame, all plugins read these)
    WallFadePlugin.updateGlobals(playerX, playerZ, normX, normZ);

    // Determine which walls should use the faded shader
    const shouldFade: Set<Mesh> = new Set();

    const pcx = Math.floor(playerX / GRID_CELL_SIZE);
    const pcz = Math.floor(playerZ / GRID_CELL_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = (pcx + dx) * 10007 + (pcz + dz);
        const bucket = this.grid.get(key);
        if (!bucket) continue;

        for (const wall of bucket) {
          const wx = wall.position.x - playerX;
          const wz = wall.position.z - playerZ;
          if (wx * wx + wz * wz > OCCLUDE_RADIUS_SQ) continue;

          const dot = wx * normX + wz * normZ;

          const meta = wall.metadata as {
            floorN: boolean;
            floorS: boolean;
            floorW: boolean;
            floorE: boolean;
          } | null;

          let facesCamera = true;
          if (meta) {
            facesCamera =
              (meta.floorS && normZ > 0) ||
              (meta.floorN && normZ < 0) ||
              (meta.floorE && normX > 0) ||
              (meta.floorW && normX < 0);
          }

          if (dot < 0 && facesCamera) {
            shouldFade.add(wall);
          }
        }
      }
    }

    // Propagate to corner/parallel neighbors (multiple rings so the shader
    // gradient has enough walls to smoothly reach alpha=1.0 at the edge)
    let currentRing = new Set(shouldFade);
    for (let ring = 0; ring < 3; ring++) {
      const nextRing: Set<Mesh> = new Set();
      for (const wall of currentRing) {
        const adj = this.neighbors.get(wall);
        if (!adj) continue;
        for (const neighbor of adj) {
          if (!shouldFade.has(neighbor)) {
            shouldFade.add(neighbor);
            nextRing.add(neighbor);
          }
        }
      }
      currentRing = nextRing;
    }

    // Swap materials
    for (const wall of shouldFade) {
      if (!this.fadedWalls.has(wall)) this.fadeWall(wall);
    }
    for (const wall of this.fadedWalls) {
      if (!shouldFade.has(wall)) this.restoreWall(wall);
    }
  }

  // ── Material swapping ─────────────────────────────────────────────────────

  private fadeWall(wall: Mesh): void {
    this.fadedWalls.add(wall);

    const decos = this.wallDecoMap.get(wall);
    if (!decos) return;

    for (const root of decos) {
      for (const child of root.getChildMeshes(false)) {
        if (!child.material) continue;

        let cached = this.decoMaterialCache.get(child);
        if (!cached) {
          const original = child.material;
          const faded = original.clone(`${original.name}_faded`);
          if (!faded) continue;
          faded.transparencyMode = 2; // ALPHABLEND
          faded.backFaceCulling = false;
          // Attach the shader plugin — computes per-pixel gradient
          new WallFadePlugin(faded);
          cached = { original, faded };
          this.decoMaterialCache.set(child, cached);
        }

        child.material = cached.faded;
      }
    }
  }

  private restoreWall(wall: Mesh): void {
    if (!this.fadedWalls.delete(wall)) return;

    const decos = this.wallDecoMap.get(wall);
    if (!decos) return;

    for (const root of decos) {
      for (const child of root.getChildMeshes(false)) {
        const cached = this.decoMaterialCache.get(child);
        if (cached) child.material = cached.original;
      }
    }
  }

  dispose(): void {
    for (const wall of this.fadedWalls) {
      this.restoreWall(wall);
    }
    this.fadedWalls.clear();

    for (const [, { faded }] of this.decoMaterialCache) {
      faded.dispose();
    }
    this.decoMaterialCache.clear();
  }
}
