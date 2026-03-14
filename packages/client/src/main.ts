import "./ui/index.css";
import "./i18n/i18n";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { LoginScreen } from "./ui/screens/LoginScreen";
import { authStore } from "./ui/stores/authStore";
import { ClientGame } from "./core/ClientGame";

const loginRoot = createRoot(document.getElementById("login-root")!);
loginRoot.render(createElement(LoginScreen));

let game: ClientGame | null = null;

// Watch auth state — start game on login, tear down on logout
authStore.subscribe(() => {
  const { isAuthenticated } = authStore.getSnapshot();

  if (isAuthenticated && !game) {
    // Hide login root
    document.getElementById("login-root")!.style.display = "none";

    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    const client = authStore.getClient();
    game = new ClientGame(canvas, client);

    // Debug access from console (dev only)
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      w.game = game;
      import("./ui/stores/debugStore").then(({ debugStore }) => (w.debug = debugStore));
      import("./ui/stores/adminStore").then(({ adminStore }) => (w.admin = adminStore));
      import("./ui/stores/minimapStore").then(({ minimapStore }) => (w.minimap = minimapStore));
    }
  }

  if (!isAuthenticated && game) {
    game.dispose();
    game = null;
    document.getElementById("login-root")!.style.display = "";
  }
});

// Try to restore a saved token on page load
authStore.tryRestore();
