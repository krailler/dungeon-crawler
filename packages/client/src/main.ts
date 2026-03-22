import "./ui/index.css";
import "./i18n/i18n";

// Disable native browser context menu globally (game uses pointer events for right-click)
document.addEventListener("contextmenu", (e) => e.preventDefault());
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Room } from "@colyseus/sdk";
import { LoginScreen } from "./ui/screens/LoginScreen";
import { LobbyScreen } from "./ui/screens/LobbyScreen";
import { authStore } from "./ui/stores/authStore";
import { lobbyStore } from "./ui/stores/lobbyStore";
import { matchmakingStore } from "./ui/stores/matchmakingStore";
import { ClientGame } from "./core/ClientGame";
import { lobbyInventoryStore } from "./ui/stores/lobbyInventoryStore";
import { preloadUiSounds, startLobbyMusic, stopLobbyMusic } from "./audio/uiSfx";
import { assetPreloadStore } from "./ui/stores/assetPreloadStore";
import { dungeonSummaryStore } from "./ui/stores/dungeonSummaryStore";
import { GlobalOverlay } from "./ui/components/GlobalOverlay";

// Preload UI sounds early so they work in login/lobby screens
preloadUiSounds();
// Start lobby music on the login screen (requires user gesture to actually play)
startLobbyMusic();

// Global overlay (fullscreen toggle + dev badge) — visible on all screens
const globalRoot = createRoot(document.getElementById("global-overlay")!);
globalRoot.render(createElement(GlobalOverlay));

const loginRoot = createRoot(document.getElementById("login-root")!);
loginRoot.render(createElement(LoginScreen));

// Lobby root (hidden by default)
const lobbyContainer = document.getElementById("lobby-root")!;
const lobbyRoot = createRoot(lobbyContainer);
lobbyRoot.render(createElement(LobbyScreen));
lobbyContainer.style.display = "none";

let game: ClientGame | null = null;

type AppState = "login" | "lobby" | "game";
let currentState: AppState = "login";

function showScreen(state: AppState): void {
  currentState = state;
  document.getElementById("login-root")!.style.display = state === "login" ? "" : "none";
  lobbyContainer.style.display = state === "lobby" ? "" : "none";
  // Start asset prefetch when entering lobby (warms browser cache)
  if (state === "lobby") assetPreloadStore.start();
  // Lobby music plays on login + lobby screens, stops in game
  if (state === "login" || state === "lobby") {
    startLobbyMusic();
  } else {
    stopLobbyMusic();
  }
}

// Called when a dungeon room is successfully joined (from lobbyStore)
function startGame(room: Room): void {
  showScreen("game");

  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  game = new ClientGame(canvas, room);

  // Debug access from console (dev only)
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>;
    w.game = game;
    import("./ui/stores/debugStore").then(({ debugStore }) => (w.debug = debugStore));
    import("./ui/stores/adminStore").then(({ adminStore }) => (w.admin = adminStore));
    import("./ui/stores/minimapStore").then(({ minimapStore }) => (w.minimap = minimapStore));
  }
}

function teardownGame(): void {
  if (game) {
    game.dispose();
    game = null;
  }
}

// Register callbacks
lobbyStore.setOnRoomJoined(startGame);

// When matchmaking finds a match, join the dungeon room
matchmakingStore.setOnMatched((roomId) => {
  const client = authStore.getClient();
  lobbyStore.joinRoom(client, roomId);
});
lobbyStore.setOnReturnToLobby(() => {
  teardownGame();
  showScreen("lobby");
  lobbyStore.connect(authStore.getClient());
  authStore.refreshUserData();
  // Invalidate lobby inventory so it reloads with latest data from dungeon
  lobbyInventoryStore.reset();
  // Show dungeon summary overlay if one was stored during the run
  dungeonSummaryStore.show();
});

// Watch auth state — manage transitions between login, lobby, and game
authStore.subscribe(() => {
  const { isAuthenticated } = authStore.getSnapshot();

  if (isAuthenticated && currentState === "login") {
    const client = authStore.getClient();

    // Try reconnection first (page reload with saved token)
    lobbyStore.tryReconnect(client).then((reconnected) => {
      if (!reconnected) {
        // No reconnection — show lobby (connect will redirect to login if server is down)
        showScreen("lobby");
        lobbyStore.connect(client).catch(() => {
          authStore.reconnectFailed("login.connectionError");
        });
      }
      // If reconnected, startGame() is called via the onRoomJoined callback
    });
  }

  if (!isAuthenticated) {
    // Logged out, kicked, or connection lost — return to login
    // (LoginScreen handles the reconnect UI when canReconnect is true)
    teardownGame();
    matchmakingStore.reset();
    lobbyStore.disconnect();
    showScreen("login");
  }
});

// Dispose engine + WebGL context on page unload to prevent memory accumulation
window.addEventListener("beforeunload", () => {
  teardownGame();
});

// Try to restore a saved token on page load
authStore.tryRestore();
