import { TileMap, TILE_SIZE } from "@dungeon/shared";

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export interface WorldPos {
  x: number;
  z: number;
}

export class Pathfinder {
  private map: TileMap;
  private mapWidth: number;

  constructor(map: TileMap) {
    this.map = map;
    this.mapWidth = map.width;
  }

  findPath(start: WorldPos, end: WorldPos): WorldPos[] {
    const sx = Math.round(start.x / TILE_SIZE);
    const sy = Math.round(start.z / TILE_SIZE);
    const ex = Math.round(end.x / TILE_SIZE);
    const ey = Math.round(end.z / TILE_SIZE);

    if (!this.map.isFloor(ex, ey)) return [];

    const tilePath = this.astar(sx, sy, ex, ey);
    if (tilePath.length === 0) return [];

    // Convert tile coords to world positions, use exact click target as final waypoint
    const path = tilePath.map((node) => ({
      x: node.x * TILE_SIZE,
      z: node.y * TILE_SIZE,
    }));
    path[path.length - 1] = { x: end.x, z: end.z };
    return path;
  }

  /** Numeric key for tile coordinates — avoids string allocation */
  private tileKey(x: number, y: number): number {
    return y * this.mapWidth + x;
  }

  private astar(sx: number, sy: number, ex: number, ey: number): { x: number; y: number }[] {
    const open: Node[] = [];
    const closed = new Set<number>();
    // Track best g-score per open node by numeric key for O(1) lookup
    const openMap = new Map<number, Node>();

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
    openMap.set(this.tileKey(sx, sy), startNode);

    const directions = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];

    while (open.length > 0) {
      // Find node with lowest f score
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open[bestIdx];
      // Swap-remove: move last element into bestIdx slot (O(1) removal)
      open[bestIdx] = open[open.length - 1];
      open.pop();

      const currentKey = this.tileKey(current.x, current.y);
      openMap.delete(currentKey);

      if (current.x === ex && current.y === ey) {
        return this.reconstructPath(current);
      }

      closed.add(currentKey);

      for (const [dx, dy] of directions) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nKey = this.tileKey(nx, ny);

        if (closed.has(nKey)) continue;
        if (!this.map.isFloor(nx, ny)) continue;

        // Prevent diagonal movement through walls
        if (dx !== 0 && dy !== 0) {
          if (
            !this.map.isFloor(current.x + dx, current.y) ||
            !this.map.isFloor(current.x, current.y + dy)
          ) {
            continue;
          }
        }

        const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
        const g = current.g + moveCost;

        const existing = openMap.get(nKey);
        if (existing) {
          if (g < existing.g) {
            existing.g = g;
            existing.f = g + existing.h;
            existing.parent = current;
          }
          continue;
        }

        const h = this.heuristic(nx, ny, ex, ey);
        const node: Node = { x: nx, y: ny, g, h, f: g + h, parent: current };
        open.push(node);
        openMap.set(nKey, node);
      }
    }

    return [];
  }

  private heuristic(x1: number, y1: number, x2: number, y2: number): number {
    const dx = Math.abs(x1 - x2);
    const dy = Math.abs(y1 - y2);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  }

  private reconstructPath(node: Node): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let current: Node | null = node;
    while (current) {
      path.push({ x: current.x, y: current.y });
      current = current.parent;
    }
    path.reverse();
    // Skip starting position
    if (path.length > 1) path.shift();
    return path;
  }
}
