import { describe, it, expect, beforeEach } from "bun:test";
import { RateLimiter } from "../src/rooms/RateLimiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(1000, 3);
  });

  describe("check()", () => {
    it("allows the first operation", () => {
      expect(limiter.check("user1")).toBe(true);
    });

    it("allows operations up to the burst limit", () => {
      expect(limiter.check("user1")).toBe(true);
      expect(limiter.check("user1")).toBe(true);
      expect(limiter.check("user1")).toBe(true);
    });

    it("rejects operations exceeding the burst limit", () => {
      limiter.check("user1");
      limiter.check("user1");
      limiter.check("user1");
      expect(limiter.check("user1")).toBe(false);
    });

    it("tracks keys independently", () => {
      limiter.check("user1");
      limiter.check("user1");
      limiter.check("user1");
      expect(limiter.check("user1")).toBe(false);
      expect(limiter.check("user2")).toBe(true);
    });

    it("allows operations again after the window expires", async () => {
      const fast = new RateLimiter(50, 2);
      fast.check("k");
      fast.check("k");
      expect(fast.check("k")).toBe(false);

      await new Promise((r) => setTimeout(r, 60));
      expect(fast.check("k")).toBe(true);
    });
  });

  describe("remove()", () => {
    it("allows operations again after removing a key", () => {
      limiter.check("user1");
      limiter.check("user1");
      limiter.check("user1");
      expect(limiter.check("user1")).toBe(false);

      limiter.remove("user1");
      expect(limiter.check("user1")).toBe(true);
    });

    it("does not crash when removing a non-existent key", () => {
      expect(() => limiter.remove("nobody")).not.toThrow();
    });
  });

  describe("clear()", () => {
    it("resets all tracked keys", () => {
      limiter.check("a");
      limiter.check("a");
      limiter.check("a");
      limiter.check("b");
      limiter.check("b");
      limiter.check("b");

      limiter.clear();

      expect(limiter.check("a")).toBe(true);
      expect(limiter.check("b")).toBe(true);
    });
  });
});
