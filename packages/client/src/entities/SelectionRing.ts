import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

const DIAMETER = 1.2;
const THICKNESS = 0.06;
const TESSELLATION = 32;
const ALPHA = 0.7;
const Y_OFFSET = 0.08;

/**
 * Reusable selection ring (torus) that can be parented to any entity mesh.
 * Used by both ClientCreature (green) and ClientPlayer (blue).
 */
export class SelectionRing {
  private ring: Mesh | null = null;
  private selected: boolean = false;
  private readonly name: string;
  private readonly color: Color3;
  private readonly parent: TransformNode;
  private readonly scene: Scene;

  constructor(name: string, color: Color3, parent: TransformNode, scene: Scene) {
    this.name = name;
    this.color = color;
    this.parent = parent;
    this.scene = scene;
  }

  get isSelected(): boolean {
    return this.selected;
  }

  setSelected(selected: boolean): void {
    if (selected === this.selected) return;
    this.selected = selected;

    if (selected) {
      if (!this.ring) {
        this.ring = MeshBuilder.CreateTorus(
          `selectRing_${this.name}`,
          { diameter: DIAMETER, thickness: THICKNESS, tessellation: TESSELLATION },
          this.scene,
        );
        const mat = new StandardMaterial(`selectRingMat_${this.name}`, this.scene);
        mat.emissiveColor = this.color;
        mat.disableLighting = true;
        mat.alpha = ALPHA;
        this.ring.material = mat;
        this.ring.parent = this.parent;
        this.ring.position.y = Y_OFFSET;
        this.ring.isPickable = false;
      }
      this.ring.setEnabled(true);
    } else if (this.ring) {
      this.ring.setEnabled(false);
    }
  }

  dispose(): void {
    if (this.ring) {
      this.ring.material?.dispose();
      this.ring.dispose();
      this.ring = null;
    }
    this.selected = false;
  }
}
