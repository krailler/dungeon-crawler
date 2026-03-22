import { describe, it, expect, beforeEach } from "bun:test";
import { CommandRegistry } from "../src/chat/CommandRegistry.js";
import type { CommandDefinition } from "../src/chat/CommandRegistry.js";

describe("CommandRegistry", () => {
  let registry: CommandRegistry;

  const healCmd: CommandDefinition = {
    name: "heal",
    description: "Heal a player",
    usage: "/heal [player]",
    adminOnly: false,
    handler: () => {},
  };

  const killCmd: CommandDefinition = {
    name: "kill",
    description: "Kill a creature",
    usage: "/kill",
    adminOnly: true,
    handler: () => {},
  };

  const helpCmd: CommandDefinition = {
    name: "help",
    description: "Show available commands",
    usage: "/help",
    adminOnly: false,
    handler: () => {},
  };

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  describe("register + get", () => {
    it("registers and retrieves a command by name", () => {
      registry.register(healCmd);
      const result = registry.get("heal");
      expect(result).toBeDefined();
      expect(result!.name).toBe("heal");
      expect(result!.description).toBe("Heal a player");
    });

    it("retrieves commands case-insensitively", () => {
      registry.register(healCmd);
      expect(registry.get("HEAL")).toBeDefined();
      expect(registry.get("Heal")).toBeDefined();
      expect(registry.get("heal")).toBeDefined();
    });

    it("returns undefined for unknown commands", () => {
      expect(registry.get("nonexistent")).toBeUndefined();
    });
  });

  describe("getAvailable", () => {
    beforeEach(() => {
      registry.register(healCmd);
      registry.register(killCmd);
      registry.register(helpCmd);
    });

    it("returns all commands for admin role", () => {
      const available = registry.getAvailable("admin");
      expect(available).toHaveLength(3);
      const names = available.map((c) => c.name);
      expect(names).toContain("heal");
      expect(names).toContain("kill");
      expect(names).toContain("help");
    });

    it("excludes admin-only commands for user role", () => {
      const available = registry.getAvailable("user");
      expect(available).toHaveLength(2);
      const names = available.map((c) => c.name);
      expect(names).toContain("heal");
      expect(names).toContain("help");
      expect(names).not.toContain("kill");
    });

    it("returns results sorted alphabetically by name", () => {
      const available = registry.getAvailable("admin");
      const names = available.map((c) => c.name);
      expect(names).toEqual(["heal", "help", "kill"]);
    });

    it("includes adminOnly flag in results", () => {
      const available = registry.getAvailable("admin");
      const kill = available.find((c) => c.name === "kill");
      expect(kill!.adminOnly).toBe(true);
      const heal = available.find((c) => c.name === "heal");
      expect(heal!.adminOnly).toBe(false);
    });
  });
});
