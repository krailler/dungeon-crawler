import type { Client } from "colyseus";
import { CloseCode } from "@dungeon/shared";
import { logger } from "../logger";

/**
 * Global registry of active sessions by accountId.
 * Ensures only one connection per account across all rooms.
 */
const activeSessions = new Map<string, Client>();

/** Register a client for an account. Kicks any previous session for the same account. */
export function registerSession(accountId: string, client: Client): void {
  const existing = activeSessions.get(accountId);
  if (existing && existing !== client) {
    logger.warn(
      { accountId, oldSession: existing.sessionId, newSession: client.sessionId },
      "Duplicate login — kicking previous session",
    );
    existing.leave(CloseCode.KICKED_DUPLICATE, "Logged in from another session");
  }
  activeSessions.set(accountId, client);
}

/** Remove a client from the registry (only if it's still the current one for that account). */
export function unregisterSession(accountId: string, client: Client): void {
  if (activeSessions.get(accountId) === client) {
    activeSessions.delete(accountId);
  }
}

/** Check if this client is still the active session for its account. */
export function isActiveSession(accountId: string, client: Client): boolean {
  return activeSessions.get(accountId) === client;
}
