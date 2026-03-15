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

  /** Last raycast hit point on the floor while holding (world coords) */
  private cursorWorldPoint: { x: number; z: number } | null = null;

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
      this.cursorWorldPoint = null;
    };

    this.handlePointerLeave = () => {
      this.isHolding = false;
      this.cursorWorldPoint = null;
    };

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);

    // While holding, update cursor position each frame and throttle MOVE sends
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      if (!this.isHolding) return;
      // Always update cursor world position for smooth facing
      this.updateCursorPosition();
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

  /** Update cursor world position from raycast (called every frame while holding). */
  private updateCursorPosition(): void {
    if (this.isPointerOverUi()) return;
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) =>
      this.floorMeshSet.has(mesh),
    );
    if (pick && pick.hit && pick.pickedPoint) {
      this.cursorWorldPoint = { x: pick.pickedPoint.x, z: pick.pickedPoint.z };
    }
  }

  private trySendMove(): void {
    if (this.isPointerOverUi()) return;
    // Reuse cursor position if already updated this frame
    if (this.cursorWorldPoint) {
      this.room.send(MessageType.MOVE, {
        x: this.cursorWorldPoint.x,
        z: this.cursorWorldPoint.z,
      });
      this.lastSendTime = performance.now();
    }
  }

  /**
   * Returns the world position the cursor is pointing at while holding click.
   * Returns null when not holding or cursor is not over the floor.
   */
  getHoldTarget(): { x: number; z: number } | null {
    if (!this.isHolding) return null;
    return this.cursorWorldPoint;
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
