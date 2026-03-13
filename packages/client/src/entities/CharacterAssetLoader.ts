import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// Side-effect: register GLB loader
import "@babylonjs/loaders/glTF";

const ANIM_NAMES = ["idle", "run"] as const;
export type AnimName = (typeof ANIM_NAMES)[number];

export type CharacterInstance = {
  root: TransformNode;
  meshes: AbstractMesh[];
  animations: Map<AnimName, AnimationGroup>;
};

/**
 * Loads character GLBs (one per animation) and instantiates them.
 * Each GLB contains the full mesh + skeleton + one animation.
 *
 * We use the idle GLB as the base (mesh source) and merge animation
 * groups from the other GLBs onto each instance.
 */
export class CharacterAssetLoader {
  private scene: Scene;
  private containers: Map<AnimName, AssetContainer> = new Map();
  private loaded: boolean = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    const promises = ANIM_NAMES.map(async (name) => {
      const container = await LoadAssetContainerAsync(`/models/character/${name}.glb`, this.scene);
      this.containers.set(name, container);
    });

    await Promise.all(promises);
    this.loaded = true;
    console.log("[CharacterAssetLoader] Loaded animations:", [...this.containers.keys()]);
  }

  /**
   * Create a new character instance with all animations.
   * Uses the idle container as the base mesh source.
   */
  instantiate(name: string): CharacterInstance {
    const idleContainer = this.containers.get("idle");
    if (!idleContainer) {
      throw new Error("[CharacterAssetLoader] Not loaded — call load() first");
    }

    // Instantiate from the idle container (mesh + skeleton + idle anim)
    const result = idleContainer.instantiateModelsToScene((sourceName) => `${name}_${sourceName}`);

    const root = result.rootNodes[0] as TransformNode;
    const meshes: AbstractMesh[] = [];
    for (const rootNode of result.rootNodes) {
      meshes.push(...rootNode.getChildMeshes(false));
    }

    // Collect animations — idle comes from this instance
    const animations = new Map<AnimName, AnimationGroup>();
    if (result.animationGroups.length > 0) {
      const idleAnim = result.animationGroups[0];
      idleAnim.name = `${name}_idle`;
      animations.set("idle", idleAnim);
    }

    // For other animations, instantiate from their containers and steal the anim group
    for (const animName of ANIM_NAMES) {
      if (animName === "idle") continue;
      const container = this.containers.get(animName);
      if (!container) continue;

      const animResult = container.instantiateModelsToScene(
        (sourceName) => `${name}_${animName}_${sourceName}`,
      );

      // Find the real animation group (skip "Targeting Pose" extras)
      let animGroup = animResult.animationGroups.find((ag) => !ag.name.includes("Targeting Pose"));
      if (!animGroup && animResult.animationGroups.length > 0) {
        animGroup = animResult.animationGroups[0];
      }

      if (animGroup) {
        animGroup.name = `${name}_${animName}`;

        // Retarget the animation to our skeleton by matching bone names
        for (const targetAnim of animGroup.targetedAnimations) {
          const targetName = targetAnim.target?.name as string | undefined;
          if (!targetName) continue;

          // Find the matching bone/node in our instance
          const baseName = targetName.replace(`${name}_${animName}_`, `${name}_`);
          const match = root.getScene().getTransformNodeByName(baseName);
          if (match) {
            targetAnim.target = match;
          }
        }

        animations.set(animName, animGroup);

        // Dispose extra animation groups we don't need
        for (const extra of animResult.animationGroups) {
          if (extra !== animGroup) {
            extra.dispose();
          }
        }
      }

      // Dispose the extra mesh instances (we only wanted the animation)
      for (const rn of animResult.rootNodes) {
        rn.dispose(false, true);
      }
    }

    return { root, meshes, animations };
  }

  dispose(): void {
    for (const [, container] of this.containers) {
      container.dispose();
    }
    this.containers.clear();
    this.loaded = false;
  }
}
