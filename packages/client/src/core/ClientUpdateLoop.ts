import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { Room } from "@colyseus/sdk";

import type { IsometricCamera } from "../camera/IsometricCamera";
import type { DungeonRenderer } from "../dungeon/DungeonRenderer";
import type { ClientPlayer } from "../entities/ClientPlayer";
import type { ClientCreature } from "../entities/ClientCreature";
import type { InputManager } from "./InputManager";
import type { WallOcclusionSystem } from "../systems/WallOcclusionSystem";
import type { FogOfWarSystem } from "../systems/FogOfWarSystem";
import type { SoundManager } from "../audio/SoundManager";
import { hudStore } from "../ui/stores/hudStore";

import { debugStore } from "../ui/stores/debugStore";
import type { DebugSnapshot } from "../ui/stores/debugStore";
import { gateStore } from "../ui/stores/gateStore";
import { promptStore } from "../ui/stores/promptStore";
import { minimapStore } from "../ui/stores/minimapStore";
import {
  MessageType,
  TILE_SIZE,
  MINIMAP_DISCOVERY_RADIUS,
  INTERACT_RANGE,
  GateType,
} from "@dungeon/shared";
import type { DebugPathsMessage } from "@dungeon/shared";

export interface UpdateLoopDeps {
  readonly isoCamera: IsometricCamera;
  readonly fogOfWar: FogOfWarSystem;
  readonly soundManager: SoundManager;
  readonly dungeonRenderer: DungeonRenderer;
  readonly scene: Scene;
  getPlayers(): Map<string, ClientPlayer>;
  getCreatures(): Map<string, ClientCreature>;
  getLocalSessionId(): string;
  getInputManager(): InputManager | null;
  getWallOcclusion(): WallOcclusionSystem | null;
  getRoom(): Room | null;
}

export class ClientUpdateLoop {
  private deps: UpdateLoopDeps;
  private lastDebug: DebugSnapshot = debugStore.getSnapshot();
  private activeCreaturesMap: Map<string, { x: number; z: number }> = new Map();
  private debugPathLines: Map<string, LinesMesh> = new Map();

  constructor(deps: UpdateLoopDeps) {
    this.deps = deps;
    // Apply persisted debug state immediately (fog, freeCamera, wireframe, etc.)
    this.applyDebugFlagsForced();
  }

  update(dt: number): void {
    // Apply debug toggles (only when changed)
    this.applyDebugFlags();

    const players = this.deps.getPlayers();
    const creatures = this.deps.getCreatures();
    const localSessionId = this.deps.getLocalSessionId();

    // Interpolate all entities toward server state
    for (const [, player] of players) {
      player.update(dt);
    }

    for (const [, creature] of creatures) {
      creature.update(dt);
    }

    // Local player faces cursor while holding click
    const localPlayer = players.get(localSessionId);
    const inputManager = this.deps.getInputManager();
    if (localPlayer && inputManager) {
      const holdTarget = inputManager.getHoldTarget();
      if (holdTarget) {
        localPlayer.setFacingTarget(holdTarget.x, holdTarget.z);
      } else {
        localPlayer.clearFacingTarget();
      }
    }

    // Gate proximity check — find nearest interactable gate for "Press F" hint
    if (localPlayer && !promptStore.getSnapshot().current) {
      const gateWorldPositions = this.deps.dungeonRenderer.getGateWorldPositions();
      const gateSnap = gateStore.getSnapshot();
      const pPos = localPlayer.getWorldPosition();
      const localMember = hudStore.getSnapshot().members.find((m) => m.isLocal);
      const isLeader = localMember?.isLeader ?? false;
      const rangeSq = INTERACT_RANGE * INTERACT_RANGE;

      let nearestId: string | null = null;
      let nearestDistSq = Infinity;

      for (const [id, wpos] of gateWorldPositions) {
        // Skip gates that are already open
        const info = gateSnap.gates.get(id);
        if (!info || info.isOpen) continue;
        // Lobby gates require leader
        if (info.gateType === GateType.LOBBY && !isLeader) continue;

        const dx = pPos.x - wpos.x;
        const dz = pPos.z - wpos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq <= rangeSq && distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestId = id;
        }
      }

      gateStore.setNearestInteractable(nearestId);
    }

    // Update debug coords
    if (localPlayer && debugStore.getSnapshot().showCoords) {
      const cp = localPlayer.getWorldPosition();
      hudStore.setLocalCoords(cp.x, cp.z);
    }

    // Camera follows local player
    if (localPlayer) {
      const pos = localPlayer.getWorldPosition();

      // Free camera: don't follow player
      const debug = debugStore.getSnapshot();
      if (!debug.freeCamera) {
        this.deps.isoCamera.followTarget(pos);
      } else {
        this.deps.isoCamera.updateFreeCamera();
      }

      // Wall occlusion
      const wallOcclusion = this.deps.getWallOcclusion();
      if (wallOcclusion && debug.wallOcclusion) {
        wallOcclusion.update(pos.x, pos.z);
      }

      // Fog of war
      this.deps.fogOfWar.update(pos.x, pos.z);

      // Minimap: reveal tiles around local player
      const tileX = Math.floor(pos.x / TILE_SIZE);
      const tileY = Math.floor(pos.z / TILE_SIZE);
      minimapStore.revealAround(tileX, tileY, MINIMAP_DISCOVERY_RADIUS);
    }

    // Minimap: update all player positions (silent, no emit)
    for (const [sessionId, player] of players) {
      const p = player.getWorldPosition();
      minimapStore.updatePlayerPosition(sessionId, p.x, p.z);
    }

    // Minimap: update active creature positions (moving or attacking only)
    // Reuse existing position objects to reduce GC pressure
    const staleIds = new Set(this.activeCreaturesMap.keys());
    for (const [id, creature] of creatures) {
      if (creature.isActive) {
        const ep = creature.getWorldPosition();
        const existing = this.activeCreaturesMap.get(id);
        if (existing) {
          existing.x = ep.x;
          existing.z = ep.z;
        } else {
          this.activeCreaturesMap.set(id, { x: ep.x, z: ep.z });
        }
        staleIds.delete(id);
      } else {
        staleIds.add(id); // ensure inactive creatures are removed
      }
    }
    for (const id of staleIds) {
      this.activeCreaturesMap.delete(id);
    }
    minimapStore.setActiveCreatures(this.activeCreaturesMap);

    // Single batched emit per frame (only when minimap is visible)
    minimapStore.flush();

    // FPS
    hudStore.updateFPS(dt);
  }

  /** Apply all debug flags unconditionally (used on startup to restore persisted state). */
  private applyDebugFlagsForced(): void {
    const debug = debugStore.getSnapshot();
    this.deps.fogOfWar.setEnabled(debug.fog);
    this.deps.isoCamera.setFreeCamera(debug.freeCamera);
    this.deps.scene.forceWireframe = debug.wireframe;
    this.deps.soundManager.setAmbientMuted(!debug.ambient);
    // showPaths requires a room connection — skip here, will be sent on first toggle
    this.lastDebug = debug;
  }

  private applyDebugFlags(): void {
    const debug = debugStore.getSnapshot();
    if (debug === this.lastDebug) return;

    if (debug.fog !== this.lastDebug.fog) {
      this.deps.fogOfWar.setEnabled(debug.fog);
    }
    if (debug.freeCamera !== this.lastDebug.freeCamera) {
      this.deps.isoCamera.setFreeCamera(debug.freeCamera);
    }
    if (debug.wireframe !== this.lastDebug.wireframe) {
      this.deps.scene.forceWireframe = debug.wireframe;
    }
    if (debug.ambient !== this.lastDebug.ambient) {
      this.deps.soundManager.setAmbientMuted(!debug.ambient);
    }
    if (debug.showPaths !== this.lastDebug.showPaths) {
      this.deps.getRoom()?.send(MessageType.DEBUG_PATHS, { enabled: debug.showPaths });
      if (!debug.showPaths) {
        this.clearDebugPaths();
      }
    }
    if (debug.showAllCreatures !== this.lastDebug.showAllCreatures) {
      // AOI enabled = NOT showing all creatures (inverted logic)
      this.deps.getRoom()?.send(MessageType.TOGGLE_AOI, { enabled: !debug.showAllCreatures });
    }

    this.lastDebug = debug;
  }

  handleDebugPaths(msg: DebugPathsMessage): void {
    // Track which IDs are in this update
    const activeIds = new Set<string>();

    for (const entry of msg.paths) {
      activeIds.add(entry.id);

      // Build points: current position → each waypoint
      const points: Vector3[] = [new Vector3(entry.x, 0.15, entry.z)];
      for (const wp of entry.path) {
        points.push(new Vector3(wp.x, 0.15, wp.z));
      }

      if (points.length < 2) continue;

      const color =
        entry.kind === "player" ? new Color3(0.22, 0.74, 0.97) : new Color3(0.97, 0.44, 0.44);
      const colors = points.map(() => new Color4(color.r, color.g, color.b, 1));

      // Reuse or create line mesh
      const existing = this.debugPathLines.get(entry.id);
      if (existing) {
        existing.dispose();
      }

      const line = MeshBuilder.CreateLines(
        `debug_path_${entry.id}`,
        { points, colors, updatable: false },
        this.deps.scene,
      );
      line.isPickable = false;
      this.debugPathLines.set(entry.id, line);
    }

    // Remove lines for entities no longer in the update
    for (const [id, line] of this.debugPathLines) {
      if (!activeIds.has(id)) {
        line.dispose();
        this.debugPathLines.delete(id);
      }
    }
  }

  private clearDebugPaths(): void {
    for (const [, line] of this.debugPathLines) {
      line.dispose();
    }
    this.debugPathLines.clear();
  }

  dispose(): void {
    this.clearDebugPaths();
  }
}
