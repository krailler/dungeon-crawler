import { Game } from "./core/Game";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("Canvas element #renderCanvas not found");
}

const game = new Game(canvas);

// Debug access from console
(window as unknown as Record<string, unknown>).game = game;
