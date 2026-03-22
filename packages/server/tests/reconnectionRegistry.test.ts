import { describe, it, expect, beforeEach } from "bun:test";
import {
  registerAccountRoom,
  unregisterAccountRoom,
  getAccountRoom,
} from "../src/sessions/reconnectionRegistry.js";

describe("reconnectionRegistry", () => {
  const accountId = "acct-1";

  beforeEach(() => {
    // Clean up global state
    unregisterAccountRoom(accountId);
  });

  it("register then get returns the roomId", () => {
    registerAccountRoom(accountId, "room-abc");
    expect(getAccountRoom(accountId)).toBe("room-abc");
  });

  it("unregister then get returns undefined", () => {
    registerAccountRoom(accountId, "room-abc");
    unregisterAccountRoom(accountId);
    expect(getAccountRoom(accountId)).toBeUndefined();
  });

  it("get returns undefined for unregistered account", () => {
    expect(getAccountRoom("unknown-acct")).toBeUndefined();
  });

  it("overwriting with a new roomId replaces the old one", () => {
    registerAccountRoom(accountId, "room-old");
    registerAccountRoom(accountId, "room-new");
    expect(getAccountRoom(accountId)).toBe("room-new");
  });

  it("unregistering one account does not affect another", () => {
    const otherAccount = "acct-2";
    registerAccountRoom(accountId, "room-1");
    registerAccountRoom(otherAccount, "room-2");

    unregisterAccountRoom(accountId);
    expect(getAccountRoom(accountId)).toBeUndefined();
    expect(getAccountRoom(otherAccount)).toBe("room-2");

    // Clean up other account
    unregisterAccountRoom(otherAccount);
  });
});
