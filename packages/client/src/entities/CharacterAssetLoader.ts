import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

// Side-effect: register GLB loader
import "@babylonjs/loaders/glTF";

const ALL_ANIM_NAMES = [
  "idle",
  "run",
  "punch",
  "walk",
  "death",
  "heavy_punch",
  "ground_slam",
  "war_cry",
] as const;
export type AnimName = (typeof ALL_ANIM_NAMES)[number];

export type CharacterInstance = {
  root: TransformNode;
  meshes: AbstractMesh[];
  animations: Map<AnimName, AnimationGroup>;
};

/**
 * Loads character models and animations from multiple GLB files.
 *
 * Multi-file approach:
 * - Base GLB (filePath) contains the mesh, skeleton, and idle animation.
 * - Separate GLBs (animFiles) each contain a single animation with the same skeleton.
 * - Animation groups from separate files are retargeted onto the base skeleton by
 *   matching bone names, then the extra meshes/skeletons are disposed.
 *
 * Animation matching:
 * - If an animMap entry exists for an AnimName, the GLB animation group is matched
 *   by checking if its name includes the mapped substring (e.g. "Breathe" → "Long_Breathe_and_Look_Around").
 * - Otherwise falls back to case-insensitive substring match on the AnimName itself.
 */
export class CharacterAssetLoader {
  private scene: Scene;
  private container: AssetContainer | null = null;
  private animContainers: Map<AnimName, AssetContainer> = new Map();
  private loaded: boolean = false;

  private filePath: string;
  private animNames: readonly AnimName[];
  /** Map from AnimName to a substring to match in the GLB animation group name */
  private animMap: Map<AnimName, string> | null;
  /** Map from AnimName to separate GLB file path */
  private animFiles: Map<AnimName, string> | null;

  constructor(
    scene: Scene,
    filePath: string,
    animNames: readonly AnimName[],
    animMap?: Map<AnimName, string>,
    animFiles?: Map<AnimName, string>,
  ) {
    this.scene = scene;
    this.filePath = filePath;
    this.animNames = animNames;
    this.animMap = animMap ?? null;
    this.animFiles = animFiles ?? null;
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    // Load base container (mesh + skeleton + idle animation)
    this.container = await LoadAssetContainerAsync(this.filePath, this.scene);

    // Load separate animation files in parallel
    if (this.animFiles) {
      const entries = [...this.animFiles.entries()];
      const results = await Promise.all(
        entries.map(([, path]) => LoadAssetContainerAsync(path, this.scene)),
      );
      for (let i = 0; i < entries.length; i++) {
        this.animContainers.set(entries[i][0], results[i]);
      }
    }

    this.loaded = true;
  }

  /** Create a new character instance with matched animations. */
  instantiate(name: string): CharacterInstance {
    if (!this.container) {
      throw new Error("[CharacterAssetLoader] Not loaded — call load() first");
    }

    // Instantiate the base model (mesh + skeleton + idle anim)
    const result = this.container.instantiateModelsToScene((sourceName) => `${name}_${sourceName}`);

    const root = result.rootNodes[0] as TransformNode;
    const meshes: AbstractMesh[] = [];
    for (const rootNode of result.rootNodes) {
      meshes.push(...rootNode.getChildMeshes(false));
    }

    const animations = new Map<AnimName, AnimationGroup>();

    // Map idle (and any other anims not in animFiles) from base container
    this._mapBaseAnimations(result.animationGroups, animations);

    // Retarget animations from separate files onto the base skeleton
    this._retargetSeparateAnimations(result, animations, name);

    // Dispose unused animation groups from base
    for (const ag of result.animationGroups) {
      if (![...animations.values()].includes(ag)) {
        ag.dispose();
      }
    }

    return { root, meshes, animations };
  }

  /** Map animations from the base container (those not provided as separate files). */
  private _mapBaseAnimations(
    groups: AnimationGroup[],
    animations: Map<AnimName, AnimationGroup>,
  ): void {
    for (const animName of this.animNames) {
      if (this.animFiles?.has(animName)) continue;

      const group = this._findAnimGroup(groups, animName);
      if (group) {
        group.stop();
        animations.set(animName, group);
      }
    }
  }

  /** Instantiate each separate animation file, retarget onto base skeleton, dispose extra meshes. */
  private _retargetSeparateAnimations(
    _baseResult: ReturnType<AssetContainer["instantiateModelsToScene"]>,
    animations: Map<AnimName, AnimationGroup>,
    name: string,
  ): void {
    for (const [animName, container] of this.animContainers) {
      const animResult = container.instantiateModelsToScene(
        (sourceName) => `${name}_${animName}_${sourceName}`,
      );

      const group = animResult.animationGroups[0];
      if (!group) {
        for (const node of animResult.rootNodes) node.dispose(false, true);
        continue;
      }

      // Retarget: replace animation targets with base skeleton bones
      for (const ta of group.targetedAnimations) {
        if (!ta.target?.name) continue;
        const originalName = ta.target.name.replace(`${name}_${animName}_`, `${name}_`);
        const baseBone = this.scene.getTransformNodeByName(originalName);
        if (baseBone) {
          ta.target = baseBone;
        }
      }

      group.stop();
      animations.set(animName, group);

      // Dispose extra mesh/skeleton nodes from the animation file
      for (const node of animResult.rootNodes) {
        node.dispose(false, true);
      }
    }
  }

  /** Find an animation group by animMap substring or fallback fuzzy match. */
  private _findAnimGroup(groups: AnimationGroup[], animName: AnimName): AnimationGroup | undefined {
    const mapKey = this.animMap?.get(animName);
    return groups.find((ag) => {
      if (mapKey) return ag.name.includes(mapKey);
      return (
        ag.name.toLowerCase().includes(animName.toLowerCase()) &&
        !ag.name.includes("Targeting Pose")
      );
    });
  }

  dispose(): void {
    this.container?.dispose();
    this.container = null;
    for (const [, container] of this.animContainers) {
      container.dispose();
    }
    this.animContainers.clear();
    this.loaded = false;
  }
}
