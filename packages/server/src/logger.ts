import pino from "pino";
import type { Logger } from "pino";

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          messageFormat: "{if roomId}[{roomId}] {end}{msg}",
          ignore: "roomId",
        },
      }
    : undefined,
});

/** Create a child logger scoped to a specific room. */
export function createRoomLogger(roomId: string): Logger {
  return logger.child({ roomId });
}

/** Short player identifier for logs (first 6 chars uppercase). */
export function pid(sessionId: string): string {
  return sessionId.slice(0, 6).toUpperCase();
}
