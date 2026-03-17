import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Force a full page reload for every non-style file change.
 * HMR is only kept for CSS/Tailwind — everything else reloads cleanly
 * to avoid stale singleton state (Babylon engine, Colyseus room, stores).
 */
function fullReloadPlugin(): Plugin {
  return {
    name: "full-reload-non-styles",
    handleHotUpdate({ file, server }) {
      if (/\.(css|scss|less|styl|postcss)$/.test(file)) return; // let Vite HMR handle styles
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}

export default defineConfig({
  plugins: [react(), fullReloadPlugin()],
  resolve: {
    alias: {
      // Ensure a single React copy in the monorepo (may hoist to root node_modules)
      react: path.resolve(require.resolve("react/package.json"), ".."),
      "react-dom": path.resolve(require.resolve("react-dom/package.json"), ".."),
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
