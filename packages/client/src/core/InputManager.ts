import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Room } from "@colyseus/sdk";
import { MessageType, TutorialStep, ENTITY_COLLISION_RADIUS } from "@dungeon/shared";
import type { SprintMessage } from "@dungeon/shared";
import { tutorialStore } from "../ui/stores/tutorialStore";
import { settingsStore } from "../ui/stores/settingsStore";

/** Min interval (ms) between MOVE messages while holding mouse */
const HOLD_SEND_INTERVAL = 150;

/** Min interval (ms) between floor raycasts while holding (≈20 Hz) */
const RAYCAST_INTERVAL = 50;

/**
 * Metadata placed on any mesh that the player can click to interact with.
 * Future interactables (chests, NPCs, …) reuse the same shape.
 */
export interface InteractableMetadata {
  interactType: string; // e.g. "gate", "chest"
  interactId: string; // unique id within that type
  /**
   * Canonical interaction position (world units).
   * Used for distance checks instead of mesh.getAbsolutePosition() when set,
   * so that visually-offset meshes still respect the authoritative tile position.
   */
  interactX?: number;
  interactZ?: number;
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
  /** Called when a creature or player mesh is clicked */
  onEntityPicked?: (pickType: string, pickId: string) => void;
  /** Called when left-click hits nothing (floor/empty) — used to deselect target */
  onNothingPicked?: () => void;
  /** Called when Tab is pressed — cycle through nearby targets */
  onTabTarget?: () => void;
}

/** Tracks a click on an interactable that was out of range — player walks toward it */
interface PendingInteract {
  type: string;
  id: string;
  /** Canonical interaction position for the range check (tile-based) */
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
  private onEntityPicked: ((pickType: string, pickId: string) => void) | undefined;
  private onNothingPicked: (() => void) | undefined;
  private onTabTarget: (() => void) | undefined;

  /** Pending interaction — player is walking toward an interactable */
  private pendingInteract: PendingInteract | null = null;

  /** Last raycast hit point on the floor while holding (world coords) */
  private cursorWorldPoint: { x: number; z: number } | null = null;

  // Bound handlers for cleanup
  private handlePointerDown: (ev: PointerEvent) => void;
  private handlePointerUp: (ev: PointerEvent) => void;
  private handlePointerMove: () => void;
  private handlePointerLeave: () => void;
  private handleContextMenu: (ev: Event) => void;
  private handleKeyDown: (ev: KeyboardEvent) => void;
  private handleKeyUp: (ev: KeyboardEvent) => void;
  private handleWindowBlur: () => void;
  private renderObserver: Observer<Scene> | null = null;
  /** Whether the client is requesting sprint (Shift held) */
  private sprintActive: boolean = false;
  /** Current cursor style applied to the canvas */
  private currentCursor: string = "";
  /** Last time a floor raycast was performed (ms) — used to throttle raycasts */
  private lastRaycastTime: number = 0;

  constructor(deps: InputManagerDeps) {
    this.scene = deps.scene;
    this.floorMeshSet = new Set(deps.floorMeshes);
    this.room = deps.room;
    this.interactable = deps.interactable;
    this.onEntityPicked = deps.onEntityPicked;
    this.onNothingPicked = deps.onNothingPicked;
    this.onTabTarget = deps.onTabTarget;

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

      // Try to pick an entity (creature or player) first
      if (this.tryEntityPick()) return;

      // Clicking on empty space deselects any current target
      this.onNothingPicked?.();

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
      this.setCursor("");
    };

    // Update cursor style on pointer move (must run AFTER Babylon's internal handler)
    this.handlePointerMove = () => this.updateCursorStyle();

    // Prevent browser context menu on the game canvas
    this.handleContextMenu = (ev: Event) => ev.preventDefault();

    // Sprint: configurable key hold (default Shift)
    this.handleKeyDown = (ev: KeyboardEvent) => {
      // Tab target cycling
      if (ev.key === settingsStore.getBinding("tabTarget")) {
        ev.preventDefault();
        this.onTabTarget?.();
        return;
      }
      if (ev.key === settingsStore.getBinding("sprint") && !this.sprintActive) {
        this.sprintActive = true;
        this.room.send(MessageType.SPRINT, { active: true } satisfies SprintMessage);
        tutorialStore.dismiss(TutorialStep.SPRINT);
      }
    };
    this.handleKeyUp = (ev: KeyboardEvent) => {
      if (ev.key === settingsStore.getBinding("sprint") && this.sprintActive) {
        this.sprintActive = false;
        this.room.send(MessageType.SPRINT, { active: false } satisfies SprintMessage);
      }
    };
    // Safety: stop sprinting if window loses focus while Shift is held
    this.handleWindowBlur = () => {
      if (this.sprintActive) {
        this.sprintActive = false;
        this.room.send(MessageType.SPRINT, { active: false } satisfies SprintMessage);
      }
    };

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);

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

  /** Update cursor world position from raycast (throttled to ~20 Hz while holding). */
  private updateCursorPosition(): void {
    const now = performance.now();
    if (now - this.lastRaycastTime < RAYCAST_INTERVAL) return;
    this.lastRaycastTime = now;

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
    if (!this.cursorWorldPoint) return;

    this.room.send(MessageType.MOVE, {
      x: this.cursorWorldPoint.x,
      z: this.cursorWorldPoint.z,
    });
    this.lastSendTime = performance.now();
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

    // Walk to the mesh position (not the canonical tile position) because
    // the mesh is offset toward the room and is always reachable.
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

    // Use the canonical interaction position (tile-based) for range checks
    // so they match the server and the "Press F" hint.
    // The mesh may be visually offset from the tile center.
    const ix = meta.interactX ?? meshPos.x;
    const iz = meta.interactZ ?? meshPos.z;
    const dx = ix - playerPos.x;
    const dz = iz - playerPos.z;
    const distSq = dx * dx + dz * dz;
    const rangeSq = this.interactable.range * this.interactable.range;

    if (distSq <= rangeSq) {
      // In range — interact immediately
      this.pendingInteract = null;
      this.interactable.onClick(meta.interactType, meta.interactId);
    } else {
      // Out of range — walk toward the mesh (reachable), interact on arrival
      this.pendingInteract = {
        type: meta.interactType,
        id: meta.interactId,
        x: ix,
        z: iz,
      };
      // Walk to the mesh position (not the tile position) because the mesh
      // is offset toward the room and is always reachable by pathfinding.
      this.room.send(MessageType.MOVE, { x: meshPos.x, z: meshPos.z });
      this.lastSendTime = performance.now();
    }
    return true;
  }

  /**
   * Try to pick a creature or player entity under the pointer.
   * Returns true if an entity was picked (cancels hold-to-move).
   * Also walks toward the entity so the player can reach revive range.
   */
  private tryEntityPick(): boolean {
    if (!this.onEntityPicked) return false;

    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => !!(mesh.metadata && mesh.metadata.pickType),
    );
    if (!pick?.hit || !pick.pickedMesh) return false;

    const meta = pick.pickedMesh.metadata;
    if (!meta?.pickType || !meta?.pickId) return false;

    this.onEntityPicked(meta.pickType, meta.pickId);

    // Walk toward the picked entity, stopping just outside collision range.
    const pos = pick.pickedMesh.getAbsolutePosition();
    const playerPos = this.interactable?.getPlayerPosition();
    if (playerPos) {
      const dx = pos.x - playerPos.x;
      const dz = pos.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const stopDist = ENTITY_COLLISION_RADIUS * 2 + 0.1; // just outside collision diameter
      if (dist > stopDist) {
        const ratio = (dist - stopDist) / dist;
        this.room.send(MessageType.MOVE, {
          x: playerPos.x + dx * ratio,
          z: playerPos.z + dz * ratio,
        });
      }
      // If already within range, no need to move
    } else {
      // Fallback: walk to exact position (collision will resolve)
      this.room.send(MessageType.MOVE, { x: pos.x, z: pos.z });
    }
    this.lastSendTime = performance.now();

    return true;
  }

  /** Update the canvas cursor based on what's under the pointer. */
  private updateCursorStyle(): void {
    if (this.isHolding) {
      this.setCursor("");
      return;
    }

    // Check for entity hover (creatures, players)
    const entityPick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => !!(mesh.metadata && mesh.metadata.pickType),
    );
    if (entityPick?.hit) {
      this.setCursor("pointer");
      return;
    }

    // Check for interactable hover (gates, loot bags)
    if (this.interactable) {
      const meshes = this.interactable.getMeshes();
      if (meshes.length > 0) {
        const meshSet = new Set(meshes);
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (mesh) =>
          meshSet.has(mesh),
        );
        if (pick?.hit) {
          this.setCursor("pointer");
          return;
        }
      }
    }

    this.setCursor("");
  }

  private setCursor(cursor: string): void {
    if (this.currentCursor === cursor) return;
    this.currentCursor = cursor;
    this.scene.defaultCursor = cursor;
    this.canvas.style.cursor = cursor;
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
    this.setCursor("");
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
  }
}
