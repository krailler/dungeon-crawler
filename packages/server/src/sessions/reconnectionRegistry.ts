/**
 * Global registry tracking which room each account is currently in.
 * Used to let clients auto-rejoin their room even if localStorage is cleared.
 *
 * Lifecycle:
 * - Register on onJoin (player enters room)
 * - Unregister on full removal (expire, leave, kick) — NOT on disconnect/drop
 *   because the player is still "in" the room waiting for reconnect.
 */
const accountRooms = new Map<string, string>(); // accountId → roomId

export function registerAccountRoom(accountId: string, roomId: string): void {
  accountRooms.set(accountId, roomId);
}

export function unregisterAccountRoom(accountId: string): void {
  accountRooms.delete(accountId);
}

export function getAccountRoom(accountId: string): string | undefined {
  return accountRooms.get(accountId);
}
