import { describe, it, expect, beforeEach } from "bun:test";
import {
  registerSession,
  unregisterSession,
  isActiveSession,
} from "../src/sessions/activeSessionRegistry.js";

/** Minimal mock that satisfies the Client interface used by the registry. */
function mockClient(sessionId: string) {
  return {
    sessionId,
    leave: () => {},
  } as any; // cast to Client — registry only uses sessionId and leave()
}

describe("activeSessionRegistry", () => {
  const accountId = "test-account-1";
  let client1: ReturnType<typeof mockClient>;
  let client2: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client1 = mockClient("session-a");
    client2 = mockClient("session-b");
    // Clean up: unregister both possible clients to reset global state
    unregisterSession(accountId, client1);
    unregisterSession(accountId, client2);
  });

  it("registerSession then isActiveSession returns true", () => {
    registerSession(accountId, client1);
    expect(isActiveSession(accountId, client1)).toBe(true);
  });

  it("unregisterSession then isActiveSession returns false", () => {
    registerSession(accountId, client1);
    unregisterSession(accountId, client1);
    expect(isActiveSession(accountId, client1)).toBe(false);
  });

  it("isActiveSession returns false for unregistered account", () => {
    expect(isActiveSession("unknown-account", client1)).toBe(false);
  });

  it("registering a new client for the same account kicks the old one", () => {
    let kicked = false;
    client1.leave = () => {
      kicked = true;
    };

    registerSession(accountId, client1);
    registerSession(accountId, client2);

    expect(kicked).toBe(true);
    expect(isActiveSession(accountId, client2)).toBe(true);
    expect(isActiveSession(accountId, client1)).toBe(false);
  });

  it("does not kick if same sessionId re-registers", () => {
    let kicked = false;
    client1.leave = () => {
      kicked = true;
    };

    registerSession(accountId, client1);
    // Re-register same client (same sessionId) — should not kick
    registerSession(accountId, client1);

    expect(kicked).toBe(false);
    expect(isActiveSession(accountId, client1)).toBe(true);
  });

  it("unregisterSession ignores if a different client is now active", () => {
    registerSession(accountId, client1);
    registerSession(accountId, client2); // replaces client1

    // Try to unregister client1 — should be a no-op since client2 is current
    unregisterSession(accountId, client1);
    expect(isActiveSession(accountId, client2)).toBe(true);
  });

  it("does not crash when old client.leave() throws during duplicate kick", () => {
    client1.leave = () => {
      throw new Error("Transport already closed");
    };

    registerSession(accountId, client1);

    // Should not throw — the catch block swallows the error
    expect(() => registerSession(accountId, client2)).not.toThrow();

    // New client should still be registered successfully
    expect(isActiveSession(accountId, client2)).toBe(true);
    expect(isActiveSession(accountId, client1)).toBe(false);
  });
});
