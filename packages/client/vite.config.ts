import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vite plugin that forces a full page reload when certain modules are edited.
 *
 * Stores (module-level singletons), core classes (Babylon engine, Colyseus room),
 * and audio managers hold live state that cannot be safely hot-replaced.
 * Attempting HMR on these files leads to stale references and a broken UI.
 * Instead, we invalidate these modules so Vite triggers a clean full reload.
 */
function forceReloadPlugin(): Plugin {
  // Patterns (relative to src/) that should force a full reload
  const RELOAD_PATTERNS = [
    /\/stores\//, // all pub-sub stores (hudStore, authStore, etc.)
    /\/core\//, // ClientGame, StateSync, InputManager, ClientUpdateLoop
    /\/audio\//, // SoundManager, uiSfx (AudioContext singletons)
  ];

  return {
    name: "force-reload-stateful-modules",
    handleHotUpdate({ file, server }) {
      // Only apply to our source files
      if (!file.includes("/packages/client/src/")) return;

      const shouldReload = RELOAD_PATTERNS.some((re) => re.test(file));
      if (shouldReload) {
        server.ws.send({ type: "full-reload" });
        return []; // Prevent default HMR processing
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), forceReloadPlugin()],
  resolve: {
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },
  server: {
    proxy: {
      "/auth": "http://localhost:3000",
      "/matchmake": "http://localhost:3000",
      "/colyseus": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["recast-detour"],
  },
  assetsInclude: ["**/*.wasm"],
});
