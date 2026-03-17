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
  /** Set of tile keys (y * width + x) that are blocked by objects (e.g. gate) */
  private blockedTiles: Set<number> = new Set();

  constructor(map: TileMap) {
    this.map = map;
    this.mapWidth = map.width;
  }

  /** Block a tile position (e.g. closed gate). Pathfinder will treat it as a wall. */
  blockTile(x: number, y: number): void {
    this.blockedTiles.add(this.tileKey(x, y));
  }

  /** Unblock a tile position (e.g. gate opened). */
  unblockTile(x: number, y: number): void {
    this.blockedTiles.delete(this.tileKey(x, y));
  }

  /** Check if a tile is walkable (floor and not blocked by objects like closed gates) */
  isWalkable(x: number, y: number): boolean {
    return this.map.isFloor(x, y) && !this.blockedTiles.has(this.tileKey(x, y));
  }

  /**
   * Tile-grid line-of-sight check (Bresenham).
   * Returns true if every tile along the line from (ax,az) to (bx,bz) is walkable.
   */
  hasLineOfSight(a: WorldPos, b: WorldPos): boolean {
    let x0 = Math.round(a.x / TILE_SIZE);
    let y0 = Math.round(a.z / TILE_SIZE);
    const x1 = Math.round(b.x / TILE_SIZE);
    const y1 = Math.round(b.z / TILE_SIZE);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      if (!this.isWalkable(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      const stepX = e2 > -dy;
      const stepY = e2 < dx;
      // Prevent diagonal corner-cutting: if stepping diagonally,
      // both adjacent cardinal tiles must also be walkable
      if (stepX && stepY) {
        if (!this.isWalkable(x0 + sx, y0) || !this.isWalkable(x0, y0 + sy)) {
          return false;
        }
      }
      if (stepX) {
        err -= dy;
        x0 += sx;
      }
      if (stepY) {
        err += dx;
        y0 += sy;
      }
    }
    return true;
  }

  findPath(start: WorldPos, end: WorldPos): WorldPos[] {
    const sx = Math.round(start.x / TILE_SIZE);
    const sy = Math.round(start.z / TILE_SIZE);
    const ex = Math.round(end.x / TILE_SIZE);
    const ey = Math.round(end.z / TILE_SIZE);

    if (!this.isWalkable(ex, ey)) return [];

    // Fast path: if direct line-of-sight, skip A* entirely
    if (this.hasLineOfSight(start, end)) {
      return [{ x: end.x, z: end.z }];
    }

    const tilePath = this.astar(sx, sy, ex, ey);
    if (tilePath.length === 0) return [];

    // Convert tile coords to world positions, use exact click target as final waypoint
    const path = tilePath.map((node) => ({
      x: node.x * TILE_SIZE,
      z: node.y * TILE_SIZE,
    }));
    path[path.length - 1] = { x: end.x, z: end.z };

    // Smooth path: remove unnecessary waypoints using line-of-sight checks
    return this.smoothPath(start, path);
  }

  /**
   * Remove redundant waypoints by checking line-of-sight.
   * Greedy algorithm: from current anchor, find the farthest reachable
   * waypoint with clear LoS, skip everything in between.
   */
  private smoothPath(start: WorldPos, path: WorldPos[]): WorldPos[] {
    if (path.length <= 1) return path;

    const smoothed: WorldPos[] = [];
    let anchor: WorldPos = start;
    let i = 0;

    while (i < path.length) {
      // Look ahead as far as possible from the current anchor
      let farthest = i;
      for (let j = i + 1; j < path.length; j++) {
        if (this.hasLineOfSight(anchor, path[j])) {
          farthest = j;
        }
      }
      smoothed.push(path[farthest]);
      anchor = path[farthest];
      i = farthest + 1;
    }

    return smoothed;
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
        if (!this.isWalkable(nx, ny)) continue;

        // Prevent diagonal movement through walls
        if (dx !== 0 && dy !== 0) {
          if (
            !this.isWalkable(current.x + dx, current.y) ||
            !this.isWalkable(current.x, current.y + dy)
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
