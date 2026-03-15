import { TileMap, TileType, mulberry32 } from "@dungeon/shared";

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class DungeonGenerator {
  private rooms: Room[] = [];
  /** Grid tracking which room (index) owns each tile. -1 = unowned. */
  private roomOwnership: number[][] = [];
  private rng: () => number = Math.random;
  /** Gate info: dir = 0(N) 1(S) 2(W) 3(E) — which direction the corridor exits */
  private gatePosition: { x: number; y: number; isNS: boolean; dir: number } | null = null;

  generate(width: number, height: number, roomCount: number, seed?: number): TileMap {
    this.rng = seed != null ? mulberry32(seed) : Math.random;
    this.rooms = [];
    const map = new TileMap(width, height);

    // Initialize ownership grid to -1 (unowned)
    this.roomOwnership = Array.from({ length: height }, () => Array<number>(width).fill(-1));

    // Place random non-overlapping rooms
    const maxAttempts = roomCount * 10;
    for (let i = 0; i < maxAttempts && this.rooms.length < roomCount; i++) {
      const room = this.randomRoom(width, height);
      if (!this.overlapsAny(room)) {
        const roomIndex = this.rooms.length;
        this.rooms.push(room);
        this.carveRoom(map, room, roomIndex);
      }
    }

    // Connect rooms with L-shaped corridors
    for (let i = 1; i < this.rooms.length; i++) {
      this.carveCorridor(map, this.rooms[i - 1], this.rooms[i], i - 1);
    }

    // Mark spawn in first room center
    if (this.rooms.length > 0) {
      const first = this.rooms[0];
      const cx = first.x + Math.floor(first.w / 2);
      const cy = first.y + Math.floor(first.h / 2);
      map.set(cx, cy, TileType.SPAWN);
    }

    // Mark exit in last room center
    if (this.rooms.length > 1) {
      const last = this.rooms[this.rooms.length - 1];
      const cx = last.x + Math.floor(last.w / 2);
      const cy = last.y + Math.floor(last.h / 2);
      map.set(cx, cy, TileType.EXIT);
    }

    // Find gate position (first corridor tile leaving the spawn room)
    // The tile stays as FLOOR — the gate is an object, not a tile type.
    this.gatePosition = this.findGatePosition(map);

    return map;
  }

  getRooms(): Room[] {
    return this.rooms;
  }

  /** Get the room ownership grid. Each cell is a room index or -1. */
  getRoomOwnership(): number[][] {
    return this.roomOwnership;
  }

  /** Get the gate tile position, orientation, and exit direction. */
  getGatePosition(): { x: number; y: number; isNS: boolean; dir: number } | null {
    return this.gatePosition;
  }

  private randomRoom(mapWidth: number, mapHeight: number): Room {
    const minSize = 4;
    const maxSize = 8;
    const w = minSize + Math.floor(this.rng() * (maxSize - minSize + 1));
    const h = minSize + Math.floor(this.rng() * (maxSize - minSize + 1));
    const x = 1 + Math.floor(this.rng() * (mapWidth - w - 2));
    const y = 1 + Math.floor(this.rng() * (mapHeight - h - 2));
    return { x, y, w, h };
  }

  private overlapsAny(room: Room): boolean {
    const padding = 1;
    for (const other of this.rooms) {
      if (
        room.x - padding < other.x + other.w &&
        room.x + room.w + padding > other.x &&
        room.y - padding < other.y + other.h &&
        room.y + room.h + padding > other.y
      ) {
        return true;
      }
    }
    return false;
  }

  private carveRoom(map: TileMap, room: Room, roomIndex: number): void {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        map.set(x, y, TileType.FLOOR);
        this.roomOwnership[y][x] = roomIndex;
      }
    }
  }

  private carveCorridor(map: TileMap, a: Room, b: Room, sourceRoomIndex: number): void {
    const ax = a.x + Math.floor(a.w / 2);
    const ay = a.y + Math.floor(a.h / 2);
    const bx = b.x + Math.floor(b.w / 2);
    const by = b.y + Math.floor(b.h / 2);

    if (this.rng() < 0.5) {
      this.carveHorizontal(map, ax, bx, ay, sourceRoomIndex);
      this.carveVertical(map, ay, by, bx, sourceRoomIndex);
    } else {
      this.carveVertical(map, ay, by, ax, sourceRoomIndex);
      this.carveHorizontal(map, ax, bx, by, sourceRoomIndex);
    }
  }

  private carveHorizontal(
    map: TileMap,
    x1: number,
    x2: number,
    y: number,
    sourceRoomIndex: number,
  ): void {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);
    for (let x = start; x <= end; x++) {
      if (map.get(x, y) === TileType.WALL) {
        map.set(x, y, TileType.FLOOR);
      }
      // Only assign ownership if tile is not already owned by a room
      if (this.roomOwnership[y][x] === -1) {
        this.roomOwnership[y][x] = sourceRoomIndex;
      }
    }
  }

  private carveVertical(
    map: TileMap,
    y1: number,
    y2: number,
    x: number,
    sourceRoomIndex: number,
  ): void {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);
    for (let y = start; y <= end; y++) {
      if (map.get(x, y) === TileType.WALL) {
        map.set(x, y, TileType.FLOOR);
      }
      // Only assign ownership if tile is not already owned by a room
      if (this.roomOwnership[y][x] === -1) {
        this.roomOwnership[y][x] = sourceRoomIndex;
      }
    }
  }

  /**
   * Find the first corridor tile just outside the spawn room.
   * The gate blocks this tile and is rendered at the boundary between room and corridor.
   */
  private findGatePosition(
    map: TileMap,
  ): { x: number; y: number; isNS: boolean; dir: number } | null {
    if (this.rooms.length < 2) return null;
    const spawn = this.rooms[0];

    // Scan tiles just outside each edge of room 0 for a corridor floor tile.
    // Top edge — corridor tile above room (dir=0: North)
    for (let x = spawn.x; x < spawn.x + spawn.w; x++) {
      const outside = spawn.y - 1;
      if (outside >= 0 && map.isFloor(x, outside)) {
        return { x, y: outside, isNS: true, dir: 0 };
      }
    }
    // Bottom edge — corridor tile below room (dir=1: South)
    for (let x = spawn.x; x < spawn.x + spawn.w; x++) {
      const outside = spawn.y + spawn.h;
      if (outside < map.height && map.isFloor(x, outside)) {
        return { x, y: outside, isNS: true, dir: 1 };
      }
    }
    // Left edge — corridor tile left of room (dir=2: West)
    for (let y = spawn.y; y < spawn.y + spawn.h; y++) {
      const outside = spawn.x - 1;
      if (outside >= 0 && map.isFloor(outside, y)) {
        return { x: outside, y, isNS: false, dir: 2 };
      }
    }
    // Right edge — corridor tile right of room (dir=3: East)
    for (let y = spawn.y; y < spawn.y + spawn.h; y++) {
      const outside = spawn.x + spawn.w;
      if (outside < map.width && map.isFloor(outside, y)) {
        return { x: outside, y, isNS: false, dir: 3 };
      }
    }
    return null;
  }
}
