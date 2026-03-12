import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TileMap } from "../dungeon/TileMap";
import { TILE_SIZE } from "../utils/Constants";

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export class Pathfinder {
  private map: TileMap;

  constructor(map: TileMap) {
    this.map = map;
  }

  findPath(startWorld: Vector3, endWorld: Vector3): Vector3[] {
    const sx = Math.round(startWorld.x / TILE_SIZE);
    const sy = Math.round(startWorld.z / TILE_SIZE);
    const ex = Math.round(endWorld.x / TILE_SIZE);
    const ey = Math.round(endWorld.z / TILE_SIZE);

    if (!this.map.isFloor(ex, ey)) return [];

    const tilePath = this.astar(sx, sy, ex, ey);
    if (tilePath.length === 0) return [];

    // Convert tile coords to world positions
    return tilePath.map(
      (node) => new Vector3(node.x * TILE_SIZE, 0, node.y * TILE_SIZE),
    );
  }

  private astar(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
  ): { x: number; y: number }[] {
    const open: Node[] = [];
    const closed = new Set<string>();

    const key = (x: number, y: number) => `${x},${y}`;

    const startNode: Node = {
      x: sx,
      y: sy,
      g: 0,
      h: this.heuristic(sx, sy, ex, ey),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    open.push(startNode);

    const directions = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
      // Diagonals
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    while (open.length > 0) {
      // Find node with lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];

      if (current.x === ex && current.y === ey) {
        return this.reconstructPath(current);
      }

      closed.add(key(current.x, current.y));

      for (const [dx, dy] of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;

        if (closed.has(key(nx, ny))) continue;
        if (!this.map.isFloor(nx, ny)) continue;

        // Prevent diagonal movement through walls
        if (dx !== 0 && dy !== 0) {
          if (!this.map.isFloor(current.x + dx, current.y) ||
              !this.map.isFloor(current.x, current.y + dy)) {
            continue;
          }
        }

        const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
        const g = current.g + moveCost;
        const h = this.heuristic(nx, ny, ex, ey);

        const existingIdx = open.findIndex((n) => n.x === nx && n.y === ny);
        if (existingIdx !== -1) {
          if (g < open[existingIdx].g) {
            open[existingIdx].g = g;
            open[existingIdx].f = g + h;
            open[existingIdx].parent = current;
          }
          continue;
        }

        open.push({ x: nx, y: ny, g, h, f: g + h, parent: current });
      }
    }

    return [];
  }

  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    // Octile distance for 8-directional movement
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  }

  private reconstructPath(node: Node): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let current: Node | null = node;
    while (current) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    // Skip starting position
    if (path.length > 1) path.shift();
    return path;
  }
}
