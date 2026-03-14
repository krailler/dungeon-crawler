import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
