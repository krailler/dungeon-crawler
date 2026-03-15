import type { Client } from "colyseus";
import type { ClockTimer } from "@colyseus/timer";
import type { DungeonState } from "../state/DungeonState";
import type { PlayerState } from "../state/PlayerState";
import type { Pathfinder } from "../navigation/Pathfinder";
import type { ChatSystem } from "../chat/ChatSystem";
import { TILE_SIZE, GATE_INTERACT_RANGE, GATE_COUNTDOWN_SECONDS } from "@dungeon/shared";
import type { GateInteractMessage } from "@dungeon/shared";

export interface GateSystemDeps {
  state: DungeonState;
  pathfinder: Pathfinder;
  chatSystem: ChatSystem;
  clock: ClockTimer;
}

export class GateSystem {
  private state: DungeonState;
  private pathfinder: Pathfinder;
  private chatSystem: ChatSystem;
  private clock: ClockTimer;
  private gateCountdowns: Set<string> = new Set();

  constructor(deps: GateSystemDeps) {
    this.state = deps.state;
    this.pathfinder = deps.pathfinder;
    this.chatSystem = deps.chatSystem;
    this.clock = deps.clock;
  }

  /** Reset countdowns (called on dungeon regeneration). */
  reset(deps: Omit<GateSystemDeps, "clock">): void {
    this.gateCountdowns.clear();
    this.state = deps.state;
    this.pathfinder = deps.pathfinder;
    this.chatSystem = deps.chatSystem;
  }

  /** Handle a GATE_INTERACT message from a client. */
  handleInteract(client: Client, player: PlayerState, data: GateInteractMessage): void {
    const gate = this.state.gates.get(data.gateId);
    if (!gate || gate.open || this.gateCountdowns.has(data.gateId)) return;

    // Lobby gates require leader
    if (gate.gateType === "lobby" && !player.isLeader) {
      this.chatSystem.sendToClientI18n(
        client,
        "message",
        "chat.gateLeaderOnly",
        {},
        "Only the party leader can open the gate.",
        "error",
      );
      return;
    }

    // Check proximity
    const gateWX = gate.tileX * TILE_SIZE;
    const gateWZ = gate.tileY * TILE_SIZE;
    const dx = player.x - gateWX;
    const dz = player.z - gateWZ;
    if (dx * dx + dz * dz > GATE_INTERACT_RANGE * GATE_INTERACT_RANGE) return;

    // Lobby gates use countdown; other types open immediately
    if (gate.gateType === "lobby") {
      this.gateCountdowns.add(data.gateId);
      const leaderName = player.characterName || client.sessionId.slice(0, 6);
      this.chatSystem.broadcastAnnouncement(
        "announce.gateCountdownStart",
        { name: leaderName, seconds: GATE_COUNTDOWN_SECONDS },
        `${leaderName} is opening the gate... ${GATE_COUNTDOWN_SECONDS}`,
      );

      for (let s = GATE_COUNTDOWN_SECONDS - 1; s >= 1; s--) {
        this.clock.setTimeout(
          () => {
            if (gate.open) return;
            this.chatSystem.broadcastAnnouncement(
              "announce.gateCountdownStart",
              { name: leaderName, seconds: s },
              `${leaderName} is opening the gate... ${s}`,
            );
          },
          (GATE_COUNTDOWN_SECONDS - s) * 1000,
        );
      }

      this.clock.setTimeout(() => {
        if (gate.open) return;
        gate.open = true;
        this.gateCountdowns.delete(data.gateId);
        this.pathfinder.unblockTile(gate.tileX, gate.tileY);
        this.chatSystem.broadcastAnnouncement(
          "announce.gateOpened",
          {},
          "The gate opens... The dungeon awaits!",
        );
      }, GATE_COUNTDOWN_SECONDS * 1000);
    } else {
      // Non-lobby gates open immediately
      gate.open = true;
      this.pathfinder.unblockTile(gate.tileX, gate.tileY);
    }
  }
}
