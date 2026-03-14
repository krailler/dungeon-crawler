import "./ui/index.css";
import "./i18n/i18n";
import { ClientGame } from "./core/ClientGame";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("Canvas element #renderCanvas not found");
}

const game = new ClientGame(canvas);

// Debug access from console (dev only — tree-shaken in production by Vite)
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.game = game;

  // Lazy-load stores so they don't bloat the main chunk if unused
  import("./ui/debugStore").then(({ debugStore }) => (w.debug = debugStore));
  import("./ui/adminStore").then(({ adminStore }) => (w.admin = adminStore));
  import("./ui/minimapStore").then(({ minimapStore }) => (w.minimap = minimapStore));
}
