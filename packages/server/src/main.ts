import { Server, auth, JWT, LobbyRoom, matchMaker } from "colyseus";
import express from "express";
import { Encoder } from "@colyseus/schema";
import { DungeonRoom } from "./rooms/DungeonRoom";
import { MatchmakingRoom, MATCHMAKING_SECRET } from "./rooms/MatchmakingRoom";
import { initDatabase } from "./db/database";
import { loadItemRegistry } from "./items/ItemRegistry";
import { loadCreatureTypeRegistry } from "./creatures/CreatureTypeRegistry";
import { loadSkillRegistry } from "./skills/SkillRegistry";
import { loadEffectRegistry } from "./effects/EffectRegistry";
import { loadClassRegistry } from "./classes/ClassRegistry";
import { loadTalentRegistry } from "./talents/TalentRegistry";
import { getAccountRoom } from "./sessions/reconnectionRegistry";
import inventoryRoutes from "./api/inventoryRoutes";
import { logger } from "./logger";
import { PROTOCOL_VERSION, MIN_PROTOCOL_VERSION } from "@dungeon/shared";

// Side-effect: configure auth callbacks before server starts
import "./auth/authConfig";

// Increase default buffer size for large dungeon state (wall + floor variant data)
Encoder.BUFFER_SIZE = 32 * 1024; // 32 KB

const port = parseInt(process.env.PORT ?? "3000", 10);

const server = new Server({
  beforeListen: async () => {
    await initDatabase();
    await loadItemRegistry();
    await loadSkillRegistry();
    await loadEffectRegistry();
    await loadCreatureTypeRegistry();
    await loadClassRegistry();
    await loadTalentRegistry();
  },
  express: (app) => {
    app.use("/auth", auth.routes());

    // REST API routes
    app.use("/api", express.json());
    app.use("/api/inventory", inventoryRoutes);

    // Returns the roomId the authenticated player is currently in (if any).
    // Used by the client to auto-rejoin after page reload / localStorage loss.
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

server.listen(port).then(async () => {
  // Create the single matchmaking room (secret prevents client-side creation)
  await matchMaker.createRoom("matchmaking", { secret: MATCHMAKING_SECRET });

  logger.info(
    {
      port,
      protocolVersion: PROTOCOL_VERSION,
      minClientVersion: MIN_PROTOCOL_VERSION,
      runtime: `Bun ${Bun.version}`,
      arch: process.arch,
    },
    "Game server listening",
  );
});
