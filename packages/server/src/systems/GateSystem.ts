import type { Client } from "colyseus";
import type { ClockTimer } from "@colyseus/timer";
import type { Logger } from "pino";
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
  log: Logger;
}

export class GateSystem {
  private state: DungeonState;
  private pathfinder: Pathfinder;
  private chatSystem: ChatSystem;
  private clock: ClockTimer;
  private log: Logger;
  private gateCountdowns: Set<string> = new Set();

  constructor(deps: GateSystemDeps) {
    this.state = deps.state;
    this.pathfinder = deps.pathfinder;
    this.chatSystem = deps.chatSystem;
    this.clock = deps.clock;
    this.log = deps.log;
  }

  /** Reset countdowns (called on dungeon regeneration). */
  reset(deps: Omit<GateSystemDeps, "clock" | "log">): void {
    this.gateCountdowns.clear();
    this.state = deps.state;
    this.pathfinder = deps.pathfinder;
    this.chatSystem = deps.chatSystem;
  }

  /** Handle a GATE_INTERACT message from a client. */
  handleInteract(client: Client, player: PlayerState, data: GateInteractMessage): void {
    const gate = this.state.gates.get(data.gateId);
    if (!gate || gate.open) return;

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

    // If any lobby gate countdown is already running, ignore
    if (gate.gateType === "lobby" && this.gateCountdowns.size > 0) return;

    // Check proximity
    const gateWX = gate.tileX * TILE_SIZE;
    const gateWZ = gate.tileY * TILE_SIZE;
    const dx = player.x - gateWX;
    const dz = player.z - gateWZ;
    if (dx * dx + dz * dz > GATE_INTERACT_RANGE * GATE_INTERACT_RANGE) return;

    // Lobby gates use countdown; other types open immediately
    if (gate.gateType === "lobby") {
      // Mark ALL lobby gates as counting down
      this.state.gates.forEach((g: any, id: string) => {
        if (g.gateType === "lobby") this.gateCountdowns.add(id);
      });

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
        // Open ALL lobby gates simultaneously
        this.openAllLobbyGates();

        let partySize = 0;
        this.state.players.forEach(() => partySize++);
        this.log.info(
          { leader: leaderName, partySize, dungeonLevel: this.state.dungeonLevel },
          "Dungeon started — gates opened",
        );

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

  /** Open all lobby gates and unblock their tiles. */
  private openAllLobbyGates(): void {
    this.state.gates.forEach((g: any, id: string) => {
      if (g.gateType === "lobby" && !g.open) {
        g.open = true;
        this.pathfinder.unblockTile(g.tileX, g.tileY);
        this.gateCountdowns.delete(id);
      }
    });
  }
}
