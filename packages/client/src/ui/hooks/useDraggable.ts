import { useCallback, useEffect, useRef, useState } from "react";

type Position = { x: number; y: number };

const STORAGE_PREFIX = "panel_pos_";
const MIN_VISIBLE = 48; // px of panel that must remain visible

function clamp(pos: Position, panelEl: HTMLElement | null): Position {
  let { x, y } = pos;
  if (panelEl) {
    const rect = panelEl.getBoundingClientRect();
    x = Math.min(x, window.innerWidth - Math.min(rect.width, MIN_VISIBLE));
    y = Math.min(y, window.innerHeight - Math.min(rect.height, MIN_VISIBLE));
  } else {
    x = Math.min(x, window.innerWidth - MIN_VISIBLE);
    y = Math.min(y, window.innerHeight - MIN_VISIBLE);
  }
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

function loadPosition(panelId: string): Position | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + panelId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Position;
    if (typeof parsed.x === "number" && typeof parsed.y === "number") return parsed;
  } catch {
    // ignore
  }
  return null;
}

function savePosition(panelId: string, pos: Position): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + panelId, JSON.stringify(pos));
  } catch {
    // ignore
  }
}

export function useDraggable(
  panelId: string | undefined,
  defaultPosition: Position,
  persistPosition = true,
): {
  position: Position;
  handleRef: React.RefObject<HTMLDivElement>;
  panelRef: React.RefObject<HTMLDivElement>;
  isDragging: boolean;
  enabled: boolean;
} {
  const enabled = panelId !== undefined;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });

  const [position, setPosition] = useState<Position>(() => {
    if (!enabled) return defaultPosition;
    if (!persistPosition) return defaultPosition;
    return loadPosition(panelId) ?? defaultPosition;
  });
  const [isDragging, setIsDragging] = useState(false);

  // Clamp on mount + window resize
  useEffect(() => {
    if (!enabled) return;
    const reclamp = (): void => {
      setPosition((prev) => clamp(prev, panelRef.current));
    };
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [enabled]);

  const onPointerDown = useCallback((e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);
    offsetRef.current = {
      x: e.clientX - (panelRef.current?.getBoundingClientRect().left ?? 0),
      y: e.clientY - (panelRef.current?.getBoundingClientRect().top ?? 0),
    };
    handleRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!draggingRef.current) return;
    setPosition(
      clamp(
        { x: e.clientX - offsetRef.current.x, y: e.clientY - offsetRef.current.y },
        panelRef.current,
      ),
    );
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setIsDragging(false);
      handleRef.current?.releasePointerCapture(e.pointerId);
      if (panelId && persistPosition) {
        setPosition((pos) => {
          savePosition(panelId, pos);
          return pos;
        });
      }
    },
    [panelId],
  );

  useEffect(() => {
    if (!enabled) return;
    const el = handleRef.current;
    if (!el) return;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
    };
  }, [enabled, onPointerDown, onPointerMove, onPointerUp]);

  return { position, handleRef, panelRef, isDragging, enabled };
}
