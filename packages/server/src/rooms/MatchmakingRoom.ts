import { Room, matchMaker } from "colyseus";
import type { Client } from "colyseus";
import {
  MATCHMAKING_LEVEL_RANGE,
  MATCHMAKING_MIN_PLAYERS,
  MATCHMAKING_MAX_PLAYERS,
  MATCHMAKING_TICK_INTERVAL,
  PROTOCOL_VERSION,
} from "@dungeon/shared";
import { logger } from "../logger";

type QueueEntry = {
  sessionId: string;
  client: Client;
  level: number;
  joinedAt: number;
};

/**
 * MatchmakingRoom — lightweight room that collects players in a queue
 * and groups them by level range. When a group is formed, creates a
 * dungeon room and tells all matched players to join it.
 *
 * Messages:
 *   Client → Server: (join with options { level })
 *   Server → Client: "matched" { roomId }
 *   Server → Client: "queue_status" { playersInQueue, position }
 */
/** Secret used to ensure only the server can create this room */
export const MATCHMAKING_SECRET = "__mm_internal__";

export class MatchmakingRoom extends Room {
  private queue: QueueEntry[] = [];
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  onCreate(options: { secret?: string }): void {
    if (options.secret !== MATCHMAKING_SECRET) {
      throw new Error("not_allowed");
    }

    this.autoDispose = false;

    logger.info("MatchmakingRoom created");

    this.tickInterval = setInterval(() => {
      this.tryFormGroups();
    }, MATCHMAKING_TICK_INTERVAL);
  }

  onJoin(client: Client, options: { level?: number; protocolVersion?: number }): void {
    if (options.protocolVersion !== PROTOCOL_VERSION) {
      client.leave(4102); // VERSION_MISMATCH
      return;
    }

    const level = options.level ?? 1;

    this.queue.push({
      sessionId: client.sessionId,
      client,
      level,
      joinedAt: Date.now(),
    });

    logger.info(
      { sessionId: client.sessionId, level, queueSize: this.queue.length },
      "Player joined matchmaking queue",
    );

    // Try to form a group immediately
    this.tryFormGroups();

    // Notify all queued players of updated status
    this.broadcastQueueStatus();
  }

  onLeave(client: Client): void {
    this.queue = this.queue.filter((e) => e.sessionId !== client.sessionId);
    logger.info(
      { sessionId: client.sessionId, queueSize: this.queue.length },
      "Player left matchmaking queue",
    );
    this.broadcastQueueStatus();
  }

  onDispose(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    logger.info("MatchmakingRoom disposed");
  }

  /**
   * Try to form groups from the queue.
   * Algorithm: sort by level, then sliding window to find compatible groups.
   */
  private tryFormGroups(): void {
    if (this.queue.length < MATCHMAKING_MIN_PLAYERS) return;

    // Sort by level ascending
    const sorted = [...this.queue].sort((a, b) => a.level - b.level);

    let i = 0;
    while (i < sorted.length) {
      // Find the largest group starting at i where max-min <= LEVEL_RANGE
      let end = i + 1;
      while (
        end < sorted.length &&
        end - i < MATCHMAKING_MAX_PLAYERS &&
        sorted[end].level - sorted[i].level <= MATCHMAKING_LEVEL_RANGE
      ) {
        end++;
      }

      const groupSize = end - i;
      if (groupSize >= MATCHMAKING_MIN_PLAYERS) {
        // Take up to MAX_PLAYERS from this window
        const group = sorted.slice(i, Math.min(i + MATCHMAKING_MAX_PLAYERS, end));
        this.matchGroup(group);

        // Remove matched players from queue
        const matchedIds = new Set(group.map((e) => e.sessionId));
        this.queue = this.queue.filter((e) => !matchedIds.has(e.sessionId));

        // Re-sort remaining for next iteration
        return this.tryFormGroups();
      }

      i++;
    }
  }

  private async matchGroup(group: QueueEntry[]): Promise<void> {
    try {
      const levels = group.map((e) => e.level);
      const avgLevel = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);

      logger.info(
        { players: group.length, levels, avgLevel },
        "Match formed — creating dungeon room",
      );

      // Create a new dungeon room
      const reservation = await matchMaker.create("dungeon", {
        protocolVersion: PROTOCOL_VERSION,
      });

      const roomId = reservation.roomId;

      // Notify all matched players
      for (const entry of group) {
        try {
          entry.client.send("matched", { roomId });
        } catch {
          // Player may have disconnected
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to create dungeon room for match");
    }
  }

  private broadcastQueueStatus(): void {
    for (let i = 0; i < this.queue.length; i++) {
      const entry = this.queue[i];
      try {
        entry.client.send("queue_status", {
          playersInQueue: this.queue.length,
          position: i + 1,
        });
      } catch {
        // Player may have disconnected
      }
    }
  }
}
