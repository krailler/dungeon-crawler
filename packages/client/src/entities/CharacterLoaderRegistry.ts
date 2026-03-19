import type { Scene } from "@babylonjs/core/scene";
import { CharacterAssetLoader } from "./CharacterAssetLoader";
import type { AnimName } from "./CharacterAssetLoader";

export type ModelConfig = {
  filePath: string;
  animNames: readonly AnimName[];
  animMap?: Map<AnimName, string>;
  /** Multi-file mode: map AnimName→GLB path for animations not in the base file */
  animFiles?: Map<AnimName, string>;
  scale: number;
};

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  warrior: {
    filePath: "/models/characters/warrior/idle.glb",
    animNames: ["idle", "run", "punch", "walk", "death", "heavy_punch"],
    animMap: new Map<AnimName, string>([["idle", "Breathe"]]),
    animFiles: new Map<AnimName, string>([
      ["run", "/models/characters/warrior/run.glb"],
      ["walk", "/models/characters/warrior/walk.glb"],
      ["punch", "/models/characters/warrior/punch.glb"],
      ["death", "/models/characters/warrior/death.glb"],
      ["heavy_punch", "/models/characters/warrior/heavy_punch.glb"],
    ]),
    scale: 1.0,
  },
  zombie: {
    filePath: "/models/characters/zombie/idle.glb",
    animNames: ["idle", "run", "punch", "walk", "death"],
    animMap: new Map<AnimName, string>([["idle", "Breathe"]]),
    animFiles: new Map<AnimName, string>([
      ["run", "/models/characters/zombie/run.glb"],
      ["walk", "/models/characters/zombie/walk.glb"],
      ["punch", "/models/characters/zombie/punch.glb"],
      ["death", "/models/characters/zombie/death.glb"],
    ]),
    scale: 1.0,
  },
  golem: {
    filePath: "/models/characters/golem/idle.glb",
    animNames: ["idle", "run", "punch", "walk", "death", "heavy_punch"],
    animMap: new Map<AnimName, string>([["idle", "Breathe"]]),
    animFiles: new Map<AnimName, string>([
      ["run", "/models/characters/golem/run.glb"],
      ["walk", "/models/characters/golem/walk.glb"],
      ["punch", "/models/characters/golem/punch.glb"],
      ["death", "/models/characters/golem/death.glb"],
      ["heavy_punch", "/models/characters/golem/heavy_punch.glb"],
    ]),
    scale: 1.5,
  },
};

const FALLBACK_KEY = "warrior";

/**
 * Registry that maps model keys (classId, creatureType) to CharacterAssetLoader instances.
 * Lazily creates loaders on first access using known configs.
 */
export class CharacterLoaderRegistry {
  private scene: Scene;
  private loaders: Map<string, CharacterAssetLoader> = new Map();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Get the config for a model key. */
  getConfig(modelKey: string): ModelConfig {
    return MODEL_CONFIGS[modelKey] ?? MODEL_CONFIGS[FALLBACK_KEY];
  }

  /** Get or create a loader for the given model key. */
  get(modelKey: string): CharacterAssetLoader {
    let loader = this.loaders.get(modelKey);
    if (loader) return loader;

    const config = this.getConfig(modelKey);
    loader = new CharacterAssetLoader(
      this.scene,
      config.filePath,
      config.animNames,
      config.animMap,
      config.animFiles,
    );
    this.loaders.set(modelKey, loader);
    return loader;
  }

  /** Preload multiple model keys in parallel. */
  async preload(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.get(key).load()));
  }

  dispose(): void {
    for (const [, loader] of this.loaders) {
      loader.dispose();
    }
    this.loaders.clear();
  }
}
