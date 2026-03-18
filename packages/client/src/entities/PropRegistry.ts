import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Registry for static prop models (chests, decorations, traps, etc.).
 * Loads GLB containers once and provides them for instantiation.
 */

const PROP_PATHS: Record<string, string> = {
  chest: "/models/props/chest.glb",
};

export class PropRegistry {
  private scene: Scene;
  private containers: Map<string, AssetContainer> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Preload all registered props in parallel. */
  async preloadAll(): Promise<void> {
    const entries = Object.entries(PROP_PATHS);
    const results = await Promise.all(
      entries.map(([, path]) => LoadAssetContainerAsync(path, this.scene)),
    );
    for (let i = 0; i < entries.length; i++) {
      this.containers.set(entries[i][0], results[i]);
    }
  }

  /** Get a loaded container by prop key. Returns null if not loaded. */
  get(key: string): AssetContainer | null {
    return this.containers.get(key) ?? null;
  }

  dispose(): void {
    for (const [, container] of this.containers) {
      container.dispose();
    }
    this.containers.clear();
  }
}
