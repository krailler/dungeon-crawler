import { Server } from "colyseus";
import { Encoder } from "@colyseus/schema";
import { DungeonRoom } from "./rooms/DungeonRoom";
import { logger } from "./logger";

// Increase default buffer size for large dungeon state (wall + floor variant data)
Encoder.BUFFER_SIZE = 32 * 1024; // 32 KB

const port = parseInt(process.env.PORT ?? "3000", 10);

const server = new Server();
server.define("dungeon", DungeonRoom);

server.listen(port).then(() => {
  logger.info({ port }, "Game server listening");
});
