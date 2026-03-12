import { TileMap, TileType } from "@dungeon/shared";

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class DungeonGenerator {
  private rooms: Room[] = [];

  generate(width: number, height: number, roomCount: number): TileMap {
    this.rooms = [];
    const map = new TileMap(width, height);

    // Place random non-overlapping rooms
    const maxAttempts = roomCount * 10;
    for (let i = 0; i < maxAttempts && this.rooms.length < roomCount; i++) {
      const room = this.randomRoom(width, height);
      if (!this.overlapsAny(room)) {
        this.rooms.push(room);
        this.carveRoom(map, room);
      }
    }

    // Connect rooms with L-shaped corridors
    for (let i = 1; i < this.rooms.length; i++) {
      this.carveCorridor(map, this.rooms[i - 1], this.rooms[i]);
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

    return map;
  }

  getRooms(): Room[] {
    return this.rooms;
  }

  private randomRoom(mapWidth: number, mapHeight: number): Room {
    const minSize = 4;
    const maxSize = 8;
    const w = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
    const h = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
    const x = 1 + Math.floor(Math.random() * (mapWidth - w - 2));
    const y = 1 + Math.floor(Math.random() * (mapHeight - h - 2));
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

  private carveRoom(map: TileMap, room: Room): void {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        map.set(x, y, TileType.FLOOR);
      }
    }
  }

  private carveCorridor(map: TileMap, a: Room, b: Room): void {
    const ax = a.x + Math.floor(a.w / 2);
    const ay = a.y + Math.floor(a.h / 2);
    const bx = b.x + Math.floor(b.w / 2);
    const by = b.y + Math.floor(b.h / 2);

    if (Math.random() < 0.5) {
      this.carveHorizontal(map, ax, bx, ay);
      this.carveVertical(map, ay, by, bx);
    } else {
      this.carveVertical(map, ay, by, ax);
      this.carveHorizontal(map, ax, bx, by);
    }
  }

  private carveHorizontal(map: TileMap, x1: number, x2: number, y: number): void {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);
    for (let x = start; x <= end; x++) {
      if (map.get(x, y) === TileType.WALL) {
        map.set(x, y, TileType.FLOOR);
      }
    }
  }

  private carveVertical(map: TileMap, y1: number, y2: number, x: number): void {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);
    for (let y = start; y <= end; y++) {
      if (map.get(x, y) === TileType.WALL) {
        map.set(x, y, TileType.FLOOR);
      }
    }
  }
}
