import { useEffect, useRef, useSyncExternalStore } from "react";
import { TileType, TILE_SIZE } from "@dungeon/shared";
import { minimapStore } from "../stores/minimapStore";

/** Pixels per tile on the minimap canvas */
const PX = 6;

/** Rotation angle to match isometric camera view (radians) */
const ROTATION = Math.PI / 4; // 45°

const COLOR_WALL = "#2a2a2a";
const COLOR_FLOOR = "#555";
const COLOR_DOOR = "#887744";
const COLOR_LOCAL_PLAYER = "#38bdf8";
const COLOR_OTHER_PLAYER = "#4ade80";
const COLOR_ENEMY = "#f87171";
const PLAYER_DOT_RADIUS = 4;
const ENEMY_DOT_RADIUS = 3;

export const MinimapOverlay = (): JSX.Element | null => {
  const { visible, version } = useSyncExternalStore(
    minimapStore.subscribe,
    minimapStore.getSnapshot,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const tileMap = minimapStore.getTileMap();
    if (!tileMap) return;

    const w = tileMap.width;
    const h = tileMap.height;
    const mapW = w * PX;
    const mapH = h * PX;

    // Canvas sized to fit the rotated content (diagonal)
    const diag = Math.ceil(Math.sqrt(mapW * mapW + mapH * mapH));
    canvas.width = diag;
    canvas.height = diag;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, diag, diag);

    // Transform: center → rotate 45° → flip Y (fix direction) → offset to map origin
    ctx.save();
    ctx.translate(diag / 2, diag / 2);
    ctx.rotate(ROTATION);
    ctx.scale(1, -1); // flip Y so "down in game" = "down in minimap"
    ctx.translate(-mapW / 2, -mapH / 2);

    const discovered = minimapStore.getDiscovered();

    // Draw tiles
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const key = y * w + x;
        if (!discovered.has(key)) continue;

        const tile = tileMap.get(x, y);
        if (tile === TileType.WALL) {
          // Only draw wall if adjacent to a discovered floor
          if (!hasDiscoveredFloorNeighbor(tileMap, discovered, x, y, w)) continue;
          ctx.fillStyle = COLOR_WALL;
        } else if (tile === TileType.DOOR) {
          ctx.fillStyle = COLOR_DOOR;
        } else {
          ctx.fillStyle = COLOR_FLOOR;
        }

        ctx.fillRect(x * PX, y * PX, PX, PX);
      }
    }

    // Draw active enemies (red dots)
    const enemies = minimapStore.getEnemyPositions();
    for (const [, pos] of enemies) {
      const ex = (pos.x / TILE_SIZE) * PX;
      const ey = (pos.z / TILE_SIZE) * PX;

      ctx.beginPath();
      ctx.arc(ex, ey, ENEMY_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_ENEMY;
      ctx.fill();
    }

    // Draw players
    const positions = minimapStore.getPlayerPositions();
    const localId = minimapStore.getLocalSessionId();

    for (const [id, pos] of positions) {
      const px = (pos.x / TILE_SIZE) * PX;
      const py = (pos.z / TILE_SIZE) * PX;

      ctx.beginPath();
      ctx.arc(px, py, PLAYER_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = id === localId ? COLOR_LOCAL_PLAYER : COLOR_OTHER_PLAYER;
      ctx.fill();
    }

    ctx.restore();
  }, [visible, version]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="overflow-hidden rounded-lg bg-black/70 p-2 ring-1 ring-white/20">
        <canvas ref={canvasRef} className="block opacity-90" />
      </div>
    </div>
  );
};

/** Check if any 4-neighbor of (x,y) is a discovered floor tile */
function hasDiscoveredFloorNeighbor(
  tileMap: { isFloor(x: number, y: number): boolean },
  discovered: Set<number>,
  x: number,
  y: number,
  w: number,
): boolean {
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];
  for (const [nx, ny] of neighbors) {
    const key = ny * w + nx;
    if (discovered.has(key) && tileMap.isFloor(nx, ny)) {
      return true;
    }
  }
  return false;
}
