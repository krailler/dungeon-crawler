import { matchMaker } from "colyseus";
import { MATCHMAKING_SECRET } from "./rooms/MatchmakingRoom";
import { logger } from "./logger";
import { PROTOCOL_VERSION, MIN_PROTOCOL_VERSION } from "@dungeon/shared";
import { createServer } from "./serverFactory";

const port = parseInt(process.env.PORT ?? "3000", 10);

const server = await createServer();

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
