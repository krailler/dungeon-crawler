import { Server, auth, LobbyRoom } from "colyseus";
import express from "express";
import { Encoder } from "@colyseus/schema";
import { DungeonRoom } from "./rooms/DungeonRoom";
import { MatchmakingRoom } from "./rooms/MatchmakingRoom";
import { initDatabase } from "./db/database";
import { loadItemRegistry } from "./items/ItemRegistry";
import { loadCreatureTypeRegistry } from "./creatures/CreatureTypeRegistry";
import { loadSkillRegistry } from "./skills/SkillRegistry";
import { loadEffectRegistry } from "./effects/EffectRegistry";
import { loadClassRegistry } from "./classes/ClassRegistry";
import { loadTalentRegistry } from "./talents/TalentRegistry";
import { getAccountRoom } from "./sessions/reconnectionRegistry";
import inventoryRoutes from "./api/inventoryRoutes";
import { JWT } from "colyseus";

// Side-effect: configure auth callbacks before server starts
import "./auth/authConfig";

export interface CreateServerOptions {
  /** Skip DB init and registry loading (for tests with mocked registries). */
  skipDbInit?: boolean;
}

/**
 * Create and configure a Colyseus Server with all rooms defined.
 * Does NOT call listen() — caller is responsible for that (or @colyseus/testing boot()).
 */
export async function createServer(opts?: CreateServerOptions): Promise<Server> {
  // Increase default buffer size for large dungeon state
  Encoder.BUFFER_SIZE = 32 * 1024;

  const server = new Server({
    beforeListen: async () => {
      if (!opts?.skipDbInit) {
        await initDatabase();
        await loadItemRegistry();
        await loadSkillRegistry();
        await loadEffectRegistry();
        await loadCreatureTypeRegistry();
        await loadClassRegistry();
        await loadTalentRegistry();
      }
    },
    express: (app) => {
      app.use("/auth", auth.routes());
      app.use("/api", express.json());
      app.use("/api/inventory", inventoryRoutes);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      app.get("/reconnect-room", async (req: any, res: any) => {
        const header = req.headers.authorization as string | undefined;
        if (!header?.startsWith("Bearer ")) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
        try {
          const payload = (await JWT.verify(header.slice(7))) as { accountId?: string };
          if (!payload?.accountId) {
            res.status(401).json({ error: "Invalid token" });
            return;
          }
          const roomId = getAccountRoom(payload.accountId);
          res.json({ roomId: roomId ?? null });
        } catch {
          res.status(401).json({ error: "Invalid token" });
        }
      });
    },
  });

  server.define("lobby", LobbyRoom);
  server.define("dungeon", DungeonRoom).enableRealtimeListing();
  server.define("matchmaking", MatchmakingRoom);

  return server;
}
