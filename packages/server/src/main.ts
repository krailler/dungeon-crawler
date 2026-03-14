import { Server, auth } from "colyseus";
import { Encoder } from "@colyseus/schema";
import { DungeonRoom } from "./rooms/DungeonRoom";
import { initDatabase } from "./db/database";
import { logger } from "./logger";

// Side-effect: configure auth callbacks before server starts
import "./auth/authConfig";

// Increase default buffer size for large dungeon state (wall + floor variant data)
Encoder.BUFFER_SIZE = 32 * 1024; // 32 KB

const port = parseInt(process.env.PORT ?? "3000", 10);

const server = new Server({
  beforeListen: () => {
    initDatabase();
  },
  express: (app) => {
    app.use("/auth", auth.routes());
  },
});

server.define("dungeon", DungeonRoom);

server.listen(port).then(() => {
  logger.info({ port }, "Game server listening");
});

// Graceful shutdown — release the port before tsx watch restarts
function shutdown() {
  logger.info("Shutting down…");
  server.gracefullyShutdown(false).finally(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
