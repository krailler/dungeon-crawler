import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";

/** Min interval (ms) between MOVE messages while holding mouse */
const HOLD_SEND_INTERVAL = 150;

export class InputManager {
  private scene: Scene;
  private floorMeshSet: Set<AbstractMesh>;
  private room: Room;
  private canvas: HTMLCanvasElement;
  private isHolding: boolean = false;
  private lastSendTime: number = 0;

  // Bound handlers for cleanup
  private handlePointerDown: (ev: PointerEvent) => void;
  private handlePointerUp: (ev: PointerEvent) => void;
  private handlePointerLeave: () => void;
  private renderObserver: import("@babylonjs/core/Misc/observable").Observer<Scene> | null = null;

  constructor(scene: Scene, floorMeshes: AbstractMesh[], room: Room) {
    this.scene = scene;
    this.floorMeshSet = new Set(floorMeshes);
    this.room = room;

    this.canvas = this.scene.getEngine().getRenderingCanvas()!;

    this.handlePointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      if (this.isOverUi(ev)) return;
      this.isHolding = true;
      this.trySendMove();
    };

    this.handlePointerUp = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      this.isHolding = false;
    };

    this.handlePointerLeave = () => {
      this.isHolding = false;
    };

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);

    // While holding, continuously send move toward cursor
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.isHolding) return;
      const now = performance.now();
      if (now - this.lastSendTime < HOLD_SEND_INTERVAL) return;
      this.trySendMove();
    });
  }

  /**
   * Returns true when the pointer is over a UI overlay element.
   * Uses elementFromPoint to check the topmost element under the cursor;
   * if it's anything other than the canvas, the UI is consuming the event.
   */
  private isOverUi(ev: PointerEvent): boolean {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    return !!el && el !== this.canvas;
  }

  /** Check if the current Babylon pointer position is over UI (for hold-and-drag). */
  private isPointerOverUi(): boolean {
    const engine = this.scene.getEngine();
    const rect = this.canvas.getBoundingClientRect();
    const clientX = rect.left + this.scene.pointerX / engine.getHardwareScalingLevel();
    const clientY = rect.top + this.scene.pointerY / engine.getHardwareScalingLevel();
    const el = document.elementFromPoint(clientX, clientY);
    return !!el && el !== this.canvas;
  }

  private trySendMove(): void {
    if (this.isPointerOverUi()) return;
    // Use predicate to only raycast against floor meshes (skip walls, enemies, etc.)
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) =>
      this.floorMeshSet.has(mesh),
    );
    if (pick && pick.hit && pick.pickedPoint) {
      this.room.send(MessageType.MOVE, {
        x: pick.pickedPoint.x,
        z: pick.pickedPoint.z,
      });
      this.lastSendTime = performance.now();
    }
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
  }
}
