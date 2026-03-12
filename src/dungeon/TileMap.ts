export const TileType = {
  WALL: 0,
  FLOOR: 1,
  DOOR: 2,
  SPAWN: 3,
  EXIT: 4,
} as const;

export type TileType = (typeof TileType)[keyof typeof TileType];

export class TileMap {
  public grid: TileType[][];
  public width: number;
  public height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () => Array<TileType>(width).fill(TileType.WALL));
  }

  get(x: number, y: number): TileType {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return TileType.WALL;
    }
    return this.grid[y][x];
  }

  set(x: number, y: number, type: TileType): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.grid[y][x] = type;
    }
  }

  isFloor(x: number, y: number): boolean {
    const tile = this.get(x, y);
    return (
      tile === TileType.FLOOR ||
      tile === TileType.SPAWN ||
      tile === TileType.EXIT ||
      tile === TileType.DOOR
    );
  }

  isAdjacentToFloor(x: number, y: number): boolean {
    return (
      this.isFloor(x - 1, y) ||
      this.isFloor(x + 1, y) ||
      this.isFloor(x, y - 1) ||
      this.isFloor(x, y + 1)
    );
  }
}
