import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";

/** Min interval (ms) between MOVE messages while holding mouse */
const HOLD_SEND_INTERVAL = 150;

/**
 * Metadata placed on any mesh that the player can click to interact with.
 * Future interactables (chests, NPCs, …) reuse the same shape.
 */
export interface InteractableMetadata {
  interactType: string; // e.g. "gate", "chest"
  interactId: string; // unique id within that type
}

/** Configuration for the generic interactable-click system. */
export interface InteractableConfig {
  /** Returns all interactable meshes currently in the scene */
  getMeshes: () => AbstractMesh[];
  /** Returns the local player's world position (for distance check) */
  getPlayerPosition: () => { x: number; z: number } | null;
  /** Max interaction distance (world units) */
  range: number;
  /** Called when an interactable mesh is clicked within range */
  onClick: (type: string, id: string) => void;
}

export interface InputManagerDeps {
  scene: Scene;
  floorMeshes: AbstractMesh[];
  room: Room;
  /** Optional interactable click system (gates, chests, etc.) */
  interactable?: InteractableConfig;
}

/** Tracks a click on an interactable that was out of range — player walks toward it */
interface PendingInteract {
  type: string;
  id: string;
  /** World position of the interactable mesh (XZ) */
  x: number;
  z: number;
}

export class InputManager {
  private scene: Scene;
  private floorMeshSet: Set<AbstractMesh>;
  private room: Room;
  private canvas: HTMLCanvasElement;
  private isHolding: boolean = false;
  private lastSendTime: number = 0;
  private interactable: InteractableConfig | undefined;

  /** Pending interaction — player is walking toward an interactable */
  private pendingInteract: PendingInteract | null = null;

  /** Last raycast hit point on the floor while holding (world coords) */
  private cursorWorldPoint: { x: number; z: number } | null = null;

  // Bound handlers for cleanup
  private handlePointerDown: (ev: PointerEvent) => void;
  private handlePointerUp: (ev: PointerEvent) => void;
  private handlePointerLeave: () => void;
  private handleContextMenu: (ev: Event) => void;
  private renderObserver: Observer<Scene> | null = null;

  constructor(deps: InputManagerDeps) {
    this.scene = deps.scene;
    this.floorMeshSet = new Set(deps.floorMeshes);
    this.room = deps.room;
    this.interactable = deps.interactable;

    this.canvas = this.scene.getEngine().getRenderingCanvas()!;

    this.handlePointerDown = (ev: PointerEvent) => {
      if (this.isOverUi(ev)) return;

      // Right-click → interact with objects (gates, chests, etc.)
      if (ev.button === 2) {
        if (this.tryInteractableClick()) return;
        return;
      }

      // Left-click → move
      if (ev.button !== 0) return;

      // Left-click cancels any pending interaction
      this.pendingInteract = null;

      // If clicking on an interactable mesh, walk toward it (but don't interact)
      if (this.tryWalkToInteractable()) {
        return;
      }

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

    // Prevent browser context menu on the game canvas
    this.handleContextMenu = (ev: Event) => ev.preventDefault();

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);

    // While holding, update cursor position each frame and throttle MOVE sends
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      // Check if pending interaction is now in range
      this.checkPendingInteract();

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

  /**
   * Left-click on an interactable: walk toward it without triggering the interaction.
   * Returns true if an interactable mesh was picked.
   */
  private tryWalkToInteractable(): boolean {
    if (!this.interactable) return false;
    const meshes = this.interactable.getMeshes();
    if (meshes.length === 0) return false;

    const meshSet = new Set(meshes);
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) =>
      meshSet.has(mesh),
    );
    if (!pick?.hit || !pick.pickedMesh) return false;

    const meshPos = pick.pickedMesh.getAbsolutePosition();
    this.room.send(MessageType.MOVE, { x: meshPos.x, z: meshPos.z });
    this.lastSendTime = performance.now();
    return true;
  }

  /**
   * Right-click on an interactable: interact with the object.
   * If in range → trigger immediately. If out of range → walk toward it and interact on arrival.
   * Returns true if an interactable was picked (regardless of range).
   */
  private tryInteractableClick(): boolean {
    if (!this.interactable) return false;
    const meshes = this.interactable.getMeshes();
    if (meshes.length === 0) return false;

    const meshSet = new Set(meshes);
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) =>
      meshSet.has(mesh),
    );
    if (!pick?.hit || !pick.pickedMesh) return false;

    const meta = pick.pickedMesh.metadata as InteractableMetadata | null;
    if (!meta?.interactType || !meta?.interactId) return false;

    const playerPos = this.interactable.getPlayerPosition();
    if (!playerPos) return false;

    const meshPos = pick.pickedMesh.getAbsolutePosition();
    const dx = meshPos.x - playerPos.x;
    const dz = meshPos.z - playerPos.z;
    const distSq = dx * dx + dz * dz;
    const rangeSq = this.interactable.range * this.interactable.range;

    if (distSq <= rangeSq) {
      // In range — interact immediately
      this.pendingInteract = null;
      this.interactable.onClick(meta.interactType, meta.interactId);
    } else {
      // Out of range — walk toward it, interact on arrival
      this.pendingInteract = {
        type: meta.interactType,
        id: meta.interactId,
        x: meshPos.x,
        z: meshPos.z,
      };
      this.room.send(MessageType.MOVE, { x: meshPos.x, z: meshPos.z });
      this.lastSendTime = performance.now();
    }
    return true;
  }

  /** Each frame, check if a pending interaction target is now within range. */
  private checkPendingInteract(): void {
    if (!this.pendingInteract || !this.interactable) return;

    const playerPos = this.interactable.getPlayerPosition();
    if (!playerPos) return;

    const dx = this.pendingInteract.x - playerPos.x;
    const dz = this.pendingInteract.z - playerPos.z;
    const distSq = dx * dx + dz * dz;
    const rangeSq = this.interactable.range * this.interactable.range;

    if (distSq <= rangeSq) {
      const { type, id } = this.pendingInteract;
      this.pendingInteract = null;
      this.interactable.onClick(type, id);
    }
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
  }
}
