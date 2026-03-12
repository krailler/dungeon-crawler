import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["recast-detour"],
  },
  assetsInclude: ["**/*.wasm"],
});
