import { Server } from "colyseus";
import { DungeonRoom } from "./rooms/DungeonRoom";

const port = parseInt(process.env.PORT ?? "3000", 10);

const server = new Server();
server.define("dungeon", DungeonRoom);

server.listen(port).then(() => {
  console.log(`[GameServer] Listening on port ${port}`);
});
