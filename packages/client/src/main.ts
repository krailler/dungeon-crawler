import "./ui/index.css";
import "./i18n/i18n";
import { ClientGame } from "./core/ClientGame";

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

if (!canvas) {
  throw new Error("Canvas element #renderCanvas not found");
}

const game = new ClientGame(canvas);

// Debug access from console
(window as unknown as Record<string, unknown>).game = game;
