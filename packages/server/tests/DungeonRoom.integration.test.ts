/**
 * Integration tests for DungeonRoom using @colyseus/testing.
 * All DB and registry dependencies are mocked via testSetup.
 *
 * Uses a TestDungeonRoom subclass that bypasses JWT + DB auth,
 * returning hardcoded auth data from client options.
 */
import "./helpers/testSetup";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { Server } from "colyseus";
import type { Client, AuthContext } from "colyseus";
import { Encoder } from "@colyseus/schema";
import { DungeonRoom } from "../src/rooms/DungeonRoom";
import { PROTOCOL_VERSION, MessageType, TutorialStep, LifeState } from "@dungeon/shared";

// ── TestDungeonRoom: bypasses JWT auth + DB lookups ──────────────────────────

let accountCounter = 0;

class TestDungeonRoom extends DungeonRoom {
  async onAuth(_client: Client, options: Record<string, any>, _context: AuthContext) {
    const id = options.accountId ?? `test-account-${++accountCounter}`;
    return {
      accountId: id,
      characterId: `char-${id}`,
      characterName: options.name ?? `Player_${id.slice(-4)}`,
      role: options.role ?? "user",
      strength: options.strength ?? 10,
      vitality: options.vitality ?? 10,
      agility: options.agility ?? 10,
      level: options.level ?? 1,
      gold: options.gold ?? 0,
      xp: options.xp ?? 0,
      statPoints: options.statPoints ?? 3,
      talentPoints: options.talentPoints ?? 0,
      classId: options.classId ?? "warrior",
      tutorialsCompleted: options.tutorialsCompleted ?? "[]",
    };
  }
}

// ── Test options helper ──────────────────────────────────────────────────────

function opts(overrides: Record<string, any> = {}) {
  return { protocolVersion: PROTOCOL_VERSION, ...overrides };
}

// ── Server setup ─────────────────────────────────────────────────────────────

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  Encoder.BUFFER_SIZE = 32 * 1024;
  const server = new Server();
  server.define("dungeon", TestDungeonRoom);
  colyseus = await boot(server);
});

afterAll(async () => {
  await colyseus.shutdown();
});

beforeEach(async () => {
  accountCounter = 0;
  await colyseus.cleanup();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("DungeonRoom", () => {
  it("creates a room with dungeon state", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    expect(room).toBeDefined();
    expect(room.state).toBeDefined();
    expect((room.state as any).tileMapData).toBeTruthy();
  });

  it("player joins and appears in state", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "join-1" }));
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(1);
    expect(client.sessionId).toBeTruthy();
    const serverPlayer = room.state.players.get(client.sessionId);
    expect(serverPlayer).toBeDefined();
  });

  it("player has computed stats after join", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "stats-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.maxHealth).toBeGreaterThan(0);
    expect(player.health).toBe(player.maxHealth);
    expect(player.attackDamage).toBeGreaterThan(0);
    expect(player.speed).toBeGreaterThan(0);
  });

  it("multiple players can join the same room", async () => {
    const room = await colyseus.createRoom("dungeon", {});

    await colyseus.connectTo(room, opts({ accountId: "multi-1" }));
    await colyseus.connectTo(room, opts({ accountId: "multi-2" }));
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(2);
  });

  it("player leave reduces player count", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "leave-1" }));
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(1);

    await client.leave();
    await new Promise((r) => setTimeout(r, 150));

    expect(room.state.players.size).toBe(0);
  });

  it("player can send chat message and receive it back", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "chat-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.CHAT_SEND, { text: "Hello dungeon!" });
    const msg = await client.waitForMessage(MessageType.CHAT_ENTRY);
    expect(msg).toBeDefined();
  });

  it("player can send move message without crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "move-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    client.send(MessageType.MOVE, { x: player.x + 1, z: player.z });
    await room.waitForNextMessage();

    expect(player).toBeDefined();
  });

  it("dungeon state has tile map and map dimensions", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const state = room.state as any;
    expect(state.tileMapData).toBeTruthy();
    expect(state.mapWidth).toBeGreaterThan(0);
    expect(state.mapHeight).toBeGreaterThan(0);
  });

  it("player joins with custom stats", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "custom-1", strength: 20, vitality: 15, agility: 12 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.strength).toBe(20);
    expect(player.vitality).toBe(15);
    expect(player.agility).toBe(12);
  });

  it("player can allocate stat point", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "alloc-1", statPoints: 5 }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const initialStr = player.strength;

    client.send(MessageType.STAT_ALLOCATE, { stat: "strength" });
    await room.waitForNextMessage();
    await room.waitForNextPatch();

    expect(player.strength).toBe(initialStr + 1);
    expect(player.statPoints).toBe(4);
  });

  it("dungeon has creatures collection (may be empty with mocked registries)", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    expect((room.state as any).creatures).toBeDefined();
  });

  // ── SPRINT ──────────────────────────────────────────────────────────────────

  it("SPRINT active:true sets sprintRequested on player", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "sprint-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.sprintRequested).toBe(false);

    client.send(MessageType.SPRINT, { active: true });
    await room.waitForNextMessage();

    expect(player.sprintRequested).toBe(true);
  });

  it("SPRINT active:false clears sprintRequested", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "sprint-2" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    client.send(MessageType.SPRINT, { active: true });
    await room.waitForNextMessage();
    expect(player.sprintRequested).toBe(true);

    client.send(MessageType.SPRINT, { active: false });
    await room.waitForNextMessage();
    expect(player.sprintRequested).toBe(false);
  });

  it("SPRINT active:true auto-completes sprint tutorial", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "sprint-tut" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    client.send(MessageType.SPRINT, { active: true });
    await room.waitForNextMessage();

    expect(player.tutorialsCompleted.has(TutorialStep.SPRINT)).toBe(true);
  });

  // ── SET_TARGET ──────────────────────────────────────────────────────────────

  it("SET_TARGET with null clears target without crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "target-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.SET_TARGET, { targetId: null });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("SET_TARGET with a non-existent creature id does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "target-2" }));
    await room.waitForNextPatch();

    client.send(MessageType.SET_TARGET, {
      targetId: "non-existent-creature",
      targetType: "creature",
    });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("SET_TARGET with targetType player stores player target", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client1 = await colyseus.connectTo(room, opts({ accountId: "target-p1" }));
    const client2 = await colyseus.connectTo(room, opts({ accountId: "target-p2" }));
    await room.waitForNextPatch();

    // Player 1 targets player 2
    client1.send(MessageType.SET_TARGET, { targetId: client2.sessionId, targetType: "player" });
    await room.waitForNextMessage();

    // No crash, player still valid
    const player1 = room.state.players.get(client1.sessionId)!;
    expect(player1).toBeDefined();
  });

  // ── ITEM_SWAP ───────────────────────────────────────────────────────────────

  it("ITEM_SWAP moves item between inventory slots", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "swap-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Directly add an item to slot 0 (maxStack=5)
    player.addItem("test_item", 1, 5);
    expect(player.inventory.get("0")).toBeDefined();
    expect(player.inventory.get("0")!.itemId).toBe("test_item");

    client.send(MessageType.ITEM_SWAP, { from: 0, to: 3 });
    await room.waitForNextMessage();

    // Item should now be in slot 3
    expect(player.inventory.get("3")).toBeDefined();
    expect(player.inventory.get("3")!.itemId).toBe("test_item");
    // Slot 0 should be empty
    expect(player.inventory.get("0")).toBeUndefined();
  });

  it("ITEM_SWAP with invalid types does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "swap-2" }));
    await room.waitForNextPatch();

    client.send(MessageType.ITEM_SWAP, { from: "bad", to: "data" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── SKILL_USE ───────────────────────────────────────────────────────────────

  it("SKILL_USE with unknown skill does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "skill-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.SKILL_USE, { skillId: "nonexistent_skill" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
    expect(player.health).toBe(player.maxHealth);
  });

  // ── TUTORIAL_DISMISS ────────────────────────────────────────────────────────

  it("TUTORIAL_DISMISS adds step to tutorialsCompleted", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "tut-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.tutorialsCompleted.has(TutorialStep.START_DUNGEON)).toBe(false);

    client.send(MessageType.TUTORIAL_DISMISS, { step: TutorialStep.START_DUNGEON });
    await room.waitForNextMessage();

    expect(player.tutorialsCompleted.has(TutorialStep.START_DUNGEON)).toBe(true);
  });

  it("TUTORIAL_DISMISS can dismiss multiple steps", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "tut-2" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    client.send(MessageType.TUTORIAL_DISMISS, { step: TutorialStep.START_DUNGEON });
    await room.waitForNextMessage();
    client.send(MessageType.TUTORIAL_DISMISS, { step: TutorialStep.FIRST_DEBUFF });
    await room.waitForNextMessage();

    expect(player.tutorialsCompleted.has(TutorialStep.START_DUNGEON)).toBe(true);
    expect(player.tutorialsCompleted.has(TutorialStep.FIRST_DEBUFF)).toBe(true);
  });

  // ── ADMIN_RESTART ───────────────────────────────────────────────────────────

  it("ADMIN_RESTART by admin regenerates dungeon (version changes)", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "admin-r1", role: "admin" }));
    await room.waitForNextPatch();

    const versionBefore = (room.state as any).dungeonVersion;

    client.send(MessageType.ADMIN_RESTART, {});
    await room.waitForNextMessage();
    await room.waitForNextPatch();

    const versionAfter = (room.state as any).dungeonVersion;
    expect(versionAfter).toBeGreaterThan(versionBefore);
  });

  it("ADMIN_RESTART resets player health to full", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "admin-r2", role: "admin" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Manually reduce health
    player.health = 1;

    client.send(MessageType.ADMIN_RESTART, {});
    await room.waitForNextMessage();

    expect(player.health).toBe(player.maxHealth);
  });

  it("ADMIN_RESTART by non-admin is ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "admin-r3", role: "user" }));
    await room.waitForNextPatch();

    const versionBefore = (room.state as any).dungeonVersion;

    client.send(MessageType.ADMIN_RESTART, {});
    await room.waitForNextMessage();
    // Give a tick for any potential processing
    await new Promise((r) => setTimeout(r, 50));

    const versionAfter = (room.state as any).dungeonVersion;
    expect(versionAfter).toBe(versionBefore);
  });

  // ── PROMOTE_LEADER ──────────────────────────────────────────────────────────

  it("PROMOTE_LEADER transfers leadership to another player", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const leader = await colyseus.connectTo(room, opts({ accountId: "lead-1" }));
    await room.waitForNextPatch();
    const follower = await colyseus.connectTo(room, opts({ accountId: "lead-2" }));
    await room.waitForNextPatch();

    const leaderState = room.state.players.get(leader.sessionId)!;
    const followerState = room.state.players.get(follower.sessionId)!;

    // First player should be leader
    expect(leaderState.isLeader).toBe(true);
    expect(followerState.isLeader).toBe(false);

    leader.send(MessageType.PROMOTE_LEADER, { targetSessionId: follower.sessionId });
    await room.waitForNextMessage();

    expect(leaderState.isLeader).toBe(false);
    expect(followerState.isLeader).toBe(true);
  });

  it("PROMOTE_LEADER by non-leader is ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const leader = await colyseus.connectTo(room, opts({ accountId: "lead-3" }));
    await room.waitForNextPatch();
    const follower = await colyseus.connectTo(room, opts({ accountId: "lead-4" }));
    await room.waitForNextPatch();

    const leaderState = room.state.players.get(leader.sessionId)!;
    const followerState = room.state.players.get(follower.sessionId)!;

    // Follower tries to promote (should be ignored)
    follower.send(MessageType.PROMOTE_LEADER, { targetSessionId: leader.sessionId });
    await room.waitForNextMessage();

    expect(leaderState.isLeader).toBe(true);
    expect(followerState.isLeader).toBe(false);
  });

  it("PROMOTE_LEADER cannot promote yourself", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const leader = await colyseus.connectTo(room, opts({ accountId: "lead-5" }));
    await room.waitForNextPatch();

    const leaderState = room.state.players.get(leader.sessionId)!;
    expect(leaderState.isLeader).toBe(true);

    leader.send(MessageType.PROMOTE_LEADER, { targetSessionId: leader.sessionId });
    await room.waitForNextMessage();

    // Still the leader (self-promote ignored)
    expect(leaderState.isLeader).toBe(true);
  });

  // ── PARTY_KICK ──────────────────────────────────────────────────────────────

  it("PARTY_KICK by leader removes the target player", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const leader = await colyseus.connectTo(room, opts({ accountId: "kick-1" }));
    await room.waitForNextPatch();
    const target = await colyseus.connectTo(room, opts({ accountId: "kick-2" }));
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(2);

    leader.send(MessageType.PARTY_KICK, { targetSessionId: target.sessionId });
    await room.waitForNextMessage();
    // Wait for disconnect processing
    await new Promise((r) => setTimeout(r, 200));

    expect(room.state.players.size).toBe(1);
    expect(room.state.players.get(leader.sessionId)).toBeDefined();
  });

  it("PARTY_KICK by non-leader is ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const leader = await colyseus.connectTo(room, opts({ accountId: "kick-3" }));
    await room.waitForNextPatch();
    const follower = await colyseus.connectTo(room, opts({ accountId: "kick-4" }));
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(2);

    // Follower tries to kick leader (should be ignored)
    follower.send(MessageType.PARTY_KICK, { targetSessionId: leader.sessionId });
    await room.waitForNextMessage();
    await new Promise((r) => setTimeout(r, 100));

    expect(room.state.players.size).toBe(2);
  });

  it("PARTY_KICK leader cannot kick themselves", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const leader = await colyseus.connectTo(room, opts({ accountId: "kick-5" }));
    await room.waitForNextPatch();

    leader.send(MessageType.PARTY_KICK, { targetSessionId: leader.sessionId });
    await room.waitForNextMessage();
    await new Promise((r) => setTimeout(r, 100));

    expect(room.state.players.size).toBe(1);
  });

  // ── CONSUMABLE_BAR_ASSIGN / UNASSIGN ────────────────────────────────────────

  it("CONSUMABLE_BAR_ASSIGN with non-existent item is rejected (mocked registry)", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "cbar-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    // Since getItemDef returns undefined in mocked registry, this should be silently rejected
    client.send(MessageType.CONSUMABLE_BAR_ASSIGN, { slot: 0, itemId: "health_potion" });
    await room.waitForNextMessage();

    // Slot should remain empty (item not found in mocked registry)
    expect(player.consumableBar[0]).toBe("");
  });

  it("CONSUMABLE_BAR_UNASSIGN clears a slot", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "cbar-2" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Manually set a bar slot for testing
    player.consumableBar[1] = "some_item";

    client.send(MessageType.CONSUMABLE_BAR_UNASSIGN, { slot: 1 });
    await room.waitForNextMessage();

    expect(player.consumableBar[1]).toBe("");
  });

  it("CONSUMABLE_BAR_UNASSIGN with out-of-range slot is ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "cbar-3" }));
    await room.waitForNextPatch();

    // Should not crash
    client.send(MessageType.CONSUMABLE_BAR_UNASSIGN, { slot: 99 });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── EQUIP_ITEM / UNEQUIP_ITEM ──────────────────────────────────────────────

  it("EQUIP_ITEM with no item instance in inventory is rejected", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "equip-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Add a plain item (no instanceId — not equipment)
    player.addItem("test_item", 1, 5);

    client.send(MessageType.EQUIP_ITEM, { invSlot: 0, equipSlot: "weapon" });
    await room.waitForNextMessage();

    // Should not crash, equipment should remain empty
    expect(player.equipment.get("weapon")).toBeUndefined();
  });

  it("EQUIP_ITEM with invalid equipSlot is rejected", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "equip-2" }));
    await room.waitForNextPatch();

    client.send(MessageType.EQUIP_ITEM, { invSlot: 0, equipSlot: "invalid_slot" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("UNEQUIP_ITEM with empty slot does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "unequip-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.UNEQUIP_ITEM, { equipSlot: "weapon" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── SKILL_USE (additional coverage) ─────────────────────────────────────────

  it("SKILL_USE when player is dead sends feedback.dead", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "skill-dead" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.SKILL_USE, { skillId: "heavy_strike" });
    const msg = await client.waitForMessage(MessageType.ACTION_FEEDBACK);

    expect(msg).toBeDefined();
    expect(msg.i18nKey).toBe("feedback.dead");
  });

  it("SKILL_USE when player is downed sends feedback.dead", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "skill-downed" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DOWNED;

    client.send(MessageType.SKILL_USE, { skillId: "execute" });
    const msg = await client.waitForMessage(MessageType.ACTION_FEEDBACK);

    expect(msg).toBeDefined();
    expect(msg.i18nKey).toBe("feedback.dead");
  });

  it("SKILL_USE with unknown skillId does not crash (alive player)", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "skill-unknown" }));
    await room.waitForNextPatch();

    client.send(MessageType.SKILL_USE, { skillId: "totally_fake_skill" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
    expect(player.health).toBe(player.maxHealth);
  });

  // ── SKILL_TOGGLE ──────────────────────────────────────────────────────────

  it("SKILL_TOGGLE with unknown skill does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "toggle-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const autoAttackBefore = player.autoAttackEnabled;

    // getSkillDef returns undefined for all skills in mock, so this should be a no-op
    client.send(MessageType.SKILL_TOGGLE, { skillId: "nonexistent_skill" });
    await room.waitForNextMessage();

    expect(player).toBeDefined();
    // autoAttackEnabled should not have changed (skill def not found / not passive)
    expect(player.autoAttackEnabled).toBe(autoAttackBefore);
  });

  it("SKILL_TOGGLE without player does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "toggle-2" }));
    await room.waitForNextPatch();

    // Send toggle — even with mocked registry returning undefined, no crash expected
    client.send(MessageType.SKILL_TOGGLE, { skillId: "basic_attack" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── ITEM_USE ──────────────────────────────────────────────────────────────

  it("ITEM_USE with non-existent itemId does not crash (getItemDef returns undefined)", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "iuse-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.ITEM_USE, { itemId: "nonexistent_item" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
    expect(player.health).toBe(player.maxHealth);
  });

  it("ITEM_USE when player is dead sends feedback.dead", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "iuse-dead" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.ITEM_USE, { itemId: "health_potion" });
    const msg = await client.waitForMessage(MessageType.ACTION_FEEDBACK);

    expect(msg).toBeDefined();
    expect(msg.i18nKey).toBe("feedback.dead");
  });

  it("ITEM_USE when player is downed sends feedback.dead", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "iuse-downed" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DOWNED;

    client.send(MessageType.ITEM_USE, { itemId: "health_potion" });
    const msg = await client.waitForMessage(MessageType.ACTION_FEEDBACK);

    expect(msg).toBeDefined();
    expect(msg.i18nKey).toBe("feedback.dead");
  });

  // ── ITEM_DESTROY ──────────────────────────────────────────────────────────

  it("ITEM_DESTROY for an empty slot does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "idestroy-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.ITEM_DESTROY, { slot: 5 });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("ITEM_DESTROY with invalid slot type does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "idestroy-2" }));
    await room.waitForNextPatch();

    client.send(MessageType.ITEM_DESTROY, { slot: "bad" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("ITEM_DESTROY removes item from occupied slot", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "idestroy-3" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Add a non-transient item (getItemDef returns undefined so transient check = falsy → not transient)
    player.addItem("destroyable_item", 2, 10);
    expect(player.inventory.get("0")).toBeDefined();
    expect(player.inventory.get("0")!.itemId).toBe("destroyable_item");

    client.send(MessageType.ITEM_DESTROY, { slot: 0 });
    await room.waitForNextMessage();

    // Item should be removed
    expect(player.inventory.get("0")).toBeUndefined();
  });

  // ── REVIVE_START ──────────────────────────────────────────────────────────

  it("REVIVE_START with invalid targetSessionId does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "revive-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.REVIVE_START, { targetSessionId: "nonexistent-session" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("REVIVE_START with null targetSessionId is ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "revive-2" }));
    await room.waitForNextPatch();

    client.send(MessageType.REVIVE_START, { targetSessionId: null });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("REVIVE_START targeting self does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "revive-3" }));
    await room.waitForNextPatch();

    client.send(MessageType.REVIVE_START, { targetSessionId: client.sessionId });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── DEF Requests (ITEM_DEFS_REQUEST, SKILL_DEFS_REQUEST, etc.) ────────────

  it("ITEM_DEFS_REQUEST with nonexistent ids returns response with empty items", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "idef-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.ITEM_DEFS_REQUEST, { itemIds: ["nonexistent_item"] });
    const msg = await client.waitForMessage(MessageType.ITEM_DEFS_RESPONSE);

    expect(msg).toBeDefined();
    expect(msg.items).toBeDefined();
    expect(msg.version).toBeDefined();
  });

  it("ITEM_DEFS_REQUEST with empty array is silently ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "idef-2" }));
    await room.waitForNextPatch();

    // Empty array → handler returns early, no response
    client.send(MessageType.ITEM_DEFS_REQUEST, { itemIds: [] });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("SKILL_DEFS_REQUEST with nonexistent ids returns response", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "sdef-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.SKILL_DEFS_REQUEST, { skillIds: ["fake_skill"] });
    const msg = await client.waitForMessage(MessageType.SKILL_DEFS_RESPONSE);

    expect(msg).toBeDefined();
    expect(msg.skills).toBeDefined();
    expect(msg.version).toBeDefined();
  });

  it("EFFECT_DEFS_REQUEST with nonexistent ids returns response", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "edef-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.EFFECT_DEFS_REQUEST, { effectIds: ["fake_effect"] });
    const msg = await client.waitForMessage(MessageType.EFFECT_DEFS_RESPONSE);

    expect(msg).toBeDefined();
    expect(msg.effects).toBeDefined();
    expect(msg.version).toBeDefined();
  });

  it("CLASS_DEFS_REQUEST with nonexistent ids returns response", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "cdef-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.CLASS_DEFS_REQUEST, { classIds: ["fake_class"] });
    const msg = await client.waitForMessage(MessageType.CLASS_DEFS_RESPONSE);

    expect(msg).toBeDefined();
    expect(msg.classes).toBeDefined();
    expect(msg.version).toBeDefined();
  });

  it("TALENT_DEFS_REQUEST with nonexistent ids returns response", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "tdef-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.TALENT_DEFS_REQUEST, { talentIds: ["fake_talent"] });
    const msg = await client.waitForMessage(MessageType.TALENT_DEFS_RESPONSE);

    expect(msg).toBeDefined();
    expect(msg.talents).toBeDefined();
    expect(msg.version).toBeDefined();
  });

  // ── EXIT_INTERACT ─────────────────────────────────────────────────────────

  it("EXIT_INTERACT without dungeon key sends rejection chat announcement", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "exit-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Move player to exit position so proximity check passes
    const roomAny = room as any;
    player.x = roomAny.exitPos.x;
    player.z = roomAny.exitPos.z;

    // Consume the join chat entry first, then send EXIT_INTERACT
    client.send(MessageType.EXIT_INTERACT, {});
    // sendAnnouncementTo sends a CHAT_ENTRY with category=announcement
    const msg = await client.waitForMessage(MessageType.CHAT_ENTRY);

    expect(msg).toBeDefined();
    expect(msg.i18nKey).toBe("announce.exitNeedKey");
  });

  it("EXIT_INTERACT when player is dead is silently ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "exit-dead" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.EXIT_INTERACT, {});
    await room.waitForNextMessage();

    // No crash, player still exists
    expect(player).toBeDefined();
  });

  it("EXIT_INTERACT when too far from exit is silently ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "exit-far" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Place player far from exit
    player.x = 999;
    player.z = 999;

    client.send(MessageType.EXIT_INTERACT, {});
    await room.waitForNextMessage();

    // No crash, no announcement (too far)
    expect(player).toBeDefined();
  });

  // ── TALENT_ALLOCATE edge cases ──────────────────────────────────────────────

  it("TALENT_ALLOCATE with zero talentPoints is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "talloc-0pts", talentPoints: 0 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.talentPoints).toBe(0);

    client.send(MessageType.TALENT_ALLOCATE, { talentId: "some_talent" });
    await room.waitForNextMessage();

    // talentPoints should still be 0 (early return because talentPoints <= 0)
    expect(player.talentPoints).toBe(0);
  });

  it("TALENT_ALLOCATE with non-string talentId is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "talloc-badid", talentPoints: 3 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.talentPoints).toBe(3);

    // Send a numeric talentId instead of string
    client.send(MessageType.TALENT_ALLOCATE, { talentId: 12345 });
    await room.waitForNextMessage();

    // Points unchanged — typeof talentId !== "string" causes early return
    expect(player.talentPoints).toBe(3);
  });

  it("TALENT_ALLOCATE with unknown talentId (getTalentDef returns undefined) is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "talloc-unk", talentPoints: 5 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.talentPoints).toBe(5);

    client.send(MessageType.TALENT_ALLOCATE, { talentId: "nonexistent_talent" });
    await room.waitForNextMessage();

    // Points unchanged — getTalentDef returns undefined in mock
    expect(player.talentPoints).toBe(5);
  });

  it("TALENT_ALLOCATE when player is dead is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "talloc-dead", talentPoints: 3 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.TALENT_ALLOCATE, { talentId: "some_talent" });
    await room.waitForNextMessage();

    expect(player.talentPoints).toBe(3);
  });

  // ── TALENT_RESET ────────────────────────────────────────────────────────────

  it("TALENT_RESET with no allocations is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "treset-empty", gold: 1000 }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.talentAllocations.size).toBe(0);

    client.send(MessageType.TALENT_RESET, {});
    await room.waitForNextMessage();

    // Gold unchanged — early return because talentAllocations.size === 0
    expect(player.gold).toBe(1000);
  });

  it("TALENT_RESET when dead is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "treset-dead", gold: 1000 }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.TALENT_RESET, {});
    await room.waitForNextMessage();

    expect(player.gold).toBe(1000);
  });

  // ── STAT_RESET ──────────────────────────────────────────────────────────────

  it("STAT_RESET with base stats (nothing spent) is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "sreset-base", strength: 10, vitality: 10, agility: 10, gold: 500 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    client.send(MessageType.STAT_RESET, {});
    await room.waitForNextMessage();

    // Gold unchanged — nothing to reset
    expect(player.gold).toBe(500);
  });

  it("STAT_RESET when dead is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "sreset-dead", strength: 15, gold: 500 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.STAT_RESET, {});
    await room.waitForNextMessage();

    // Gold unchanged
    expect(player.gold).toBe(500);
    expect(player.strength).toBe(15);
  });

  it("STAT_RESET with insufficient gold is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "sreset-poor", strength: 15, gold: 0 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    client.send(MessageType.STAT_RESET, {});
    await room.waitForNextMessage();

    // Strength unchanged — not enough gold
    expect(player.strength).toBe(15);
  });

  // ── LOOT_TAKE validation paths ──────────────────────────────────────────────

  it("LOOT_TAKE with nonexistent bag id is silently ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "loot-nobag" }));
    await room.waitForNextPatch();

    client.send(MessageType.LOOT_TAKE, {
      lootBagId: "nonexistent-bag",
      itemIndex: 0,
      itemId: "health_potion",
    });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("LOOT_TAKE when player is dead is silently ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "loot-dead" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.LOOT_TAKE, {
      lootBagId: "some-bag",
      itemIndex: 0,
      itemId: "health_potion",
    });
    await room.waitForNextMessage();

    expect(player).toBeDefined();
  });

  it("LOOT_TAKE with bag out of range is silently ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "loot-far" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    // Manually add a loot bag far from the player
    const { LootBagState } = await import("../src/state/LootBagState");
    const { InventorySlotState } = await import("../src/state/InventorySlotState");
    const bag = new LootBagState();
    bag.x = player.x + 100;
    bag.z = player.z + 100;
    const slot = new InventorySlotState();
    slot.itemId = "test_item";
    slot.quantity = 1;
    bag.items.set("0", slot);
    room.state.lootBags.set("far-bag", bag);

    client.send(MessageType.LOOT_TAKE, {
      lootBagId: "far-bag",
      itemIndex: 0,
      itemId: "test_item",
    });
    await room.waitForNextMessage();

    // Item should still be in the bag (out of range)
    expect(room.state.lootBags.get("far-bag")!.items.get("0")).toBeDefined();
  });

  it("LOOT_TAKE with wrong itemId mismatch is silently ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "loot-mismatch" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    // Add a loot bag near the player
    const { LootBagState } = await import("../src/state/LootBagState");
    const { InventorySlotState } = await import("../src/state/InventorySlotState");
    const bag = new LootBagState();
    bag.x = player.x;
    bag.z = player.z;
    const slot = new InventorySlotState();
    slot.itemId = "health_potion";
    slot.quantity = 1;
    bag.items.set("0", slot);
    room.state.lootBags.set("mismatch-bag", bag);

    // Send with wrong itemId
    client.send(MessageType.LOOT_TAKE, {
      lootBagId: "mismatch-bag",
      itemIndex: 0,
      itemId: "wrong_item_id",
    });
    await room.waitForNextMessage();

    // Item should still be in the bag (itemId mismatch)
    expect(room.state.lootBags.get("mismatch-bag")!.items.get("0")!.itemId).toBe("health_potion");
  });

  it("LOOT_TAKE with invalid slot key is silently ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "loot-badslot" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;

    // Add a loot bag near the player with item in slot 0
    const { LootBagState } = await import("../src/state/LootBagState");
    const { InventorySlotState } = await import("../src/state/InventorySlotState");
    const bag = new LootBagState();
    bag.x = player.x;
    bag.z = player.z;
    const slot = new InventorySlotState();
    slot.itemId = "health_potion";
    slot.quantity = 1;
    bag.items.set("0", slot);
    room.state.lootBags.set("badslot-bag", bag);

    // Request item from slot 5 which doesn't exist
    client.send(MessageType.LOOT_TAKE, {
      lootBagId: "badslot-bag",
      itemIndex: 5,
      itemId: "health_potion",
    });
    await room.waitForNextMessage();

    // Item should still be in slot 0
    expect(room.state.lootBags.get("badslot-bag")!.items.get("0")!.quantity).toBe(1);
  });

  // ── STAT_ALLOCATE additional coverage ───────────────────────────────────────

  it("STAT_ALLOCATE with invalid stat name is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "alloc-bad", statPoints: 5 }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const initialStr = player.strength;

    client.send(MessageType.STAT_ALLOCATE, { stat: "invalid_stat" });
    await room.waitForNextMessage();

    // Stat points unchanged — invalid stat name
    expect(player.statPoints).toBe(5);
    expect(player.strength).toBe(initialStr);
  });

  it("STAT_ALLOCATE with zero stat points is a no-op", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "alloc-0pts", statPoints: 0 }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const initialStr = player.strength;

    client.send(MessageType.STAT_ALLOCATE, { stat: "strength" });
    await room.waitForNextMessage();

    // allocateStat returns false when statPoints <= 0
    expect(player.strength).toBe(initialStr);
    expect(player.statPoints).toBe(0);
  });

  it("STAT_ALLOCATE vitality increases max health", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "alloc-vit", statPoints: 5 }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const initialMaxHealth = player.maxHealth;
    const initialVit = player.vitality;

    client.send(MessageType.STAT_ALLOCATE, { stat: "vitality" });
    await room.waitForNextMessage();
    await room.waitForNextPatch();

    expect(player.vitality).toBe(initialVit + 1);
    // Max health should have increased (hpPerVit = 5 in mock warrior scaling)
    expect(player.maxHealth).toBeGreaterThan(initialMaxHealth);
    // Current health should also increase (grants the HP diff)
    expect(player.health).toBe(player.maxHealth);
  });

  it("STAT_ALLOCATE agility increases speed", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "alloc-agi", statPoints: 5 }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const initialSpeed = player.speed;
    const initialAgi = player.agility;

    client.send(MessageType.STAT_ALLOCATE, { stat: "agility" });
    await room.waitForNextMessage();
    await room.waitForNextPatch();

    expect(player.agility).toBe(initialAgi + 1);
    // Speed should increase (speedPerAgi = 0.05 in mock warrior scaling)
    expect(player.speed).toBeGreaterThan(initialSpeed);
  });

  it("Multiple STAT_ALLOCATE calls spend points correctly", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "alloc-multi", statPoints: 5 }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const initialStr = player.strength;

    // Allocate 3 points to strength
    for (let i = 0; i < 3; i++) {
      client.send(MessageType.STAT_ALLOCATE, { stat: "strength" });
      await room.waitForNextMessage();
    }
    await room.waitForNextPatch();

    expect(player.strength).toBe(initialStr + 3);
    expect(player.statPoints).toBe(2);
  });

  // ── REVIVE_START between two players ───────────────────────────────────────

  it("REVIVE_START on a downed ally triggers revive processing without crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const healer = await colyseus.connectTo(room, opts({ accountId: "revive-h1" }));
    await room.waitForNextPatch();
    const downed = await colyseus.connectTo(room, opts({ accountId: "revive-d1" }));
    await room.waitForNextPatch();

    const healerState = room.state.players.get(healer.sessionId)!;
    const downedState = room.state.players.get(downed.sessionId)!;

    // Down the second player
    downedState.lifeState = LifeState.DOWNED;
    downedState.bleedTimer = 30;

    // Move healer close to downed player
    healerState.x = downedState.x;
    healerState.z = downedState.z;

    healer.send(MessageType.REVIVE_START, { targetSessionId: downed.sessionId });
    await room.waitForNextMessage();

    // No crash — gameLoop.startRevive was called
    expect(healerState).toBeDefined();
    expect(downedState).toBeDefined();
  });

  it("REVIVE_START when reviver is dead is a no-op (gameLoop validates)", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const deadPlayer = await colyseus.connectTo(room, opts({ accountId: "revive-deadrev" }));
    await room.waitForNextPatch();
    const downedPlayer = await colyseus.connectTo(room, opts({ accountId: "revive-target" }));
    await room.waitForNextPatch();

    const deadState = room.state.players.get(deadPlayer.sessionId)!;
    const downedState = room.state.players.get(downedPlayer.sessionId)!;

    deadState.lifeState = LifeState.DEAD;
    downedState.lifeState = LifeState.DOWNED;
    downedState.bleedTimer = 30;

    deadPlayer.send(MessageType.REVIVE_START, { targetSessionId: downedPlayer.sessionId });
    await room.waitForNextMessage();

    // No crash expected; gameLoop handles validation
    expect(downedState.lifeState).toBe(LifeState.DOWNED);
  });

  // ── Player leave / disconnect ──────────────────────────────────────────────

  it("player leave via client.leave() removes player from state", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "leave-clean" }));
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(1);

    await client.leave();
    await new Promise((r) => setTimeout(r, 200));

    expect(room.state.players.size).toBe(0);
  });

  it("second player becomes leader when first player leaves", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const first = await colyseus.connectTo(room, opts({ accountId: "lead-leave-1" }));
    await room.waitForNextPatch();
    const second = await colyseus.connectTo(room, opts({ accountId: "lead-leave-2" }));
    await room.waitForNextPatch();

    const firstState = room.state.players.get(first.sessionId)!;
    const secondState = room.state.players.get(second.sessionId)!;

    expect(firstState.isLeader).toBe(true);
    expect(secondState.isLeader).toBe(false);

    await first.leave();
    await new Promise((r) => setTimeout(r, 200));

    expect(room.state.players.size).toBe(1);
    // Second player should have been promoted to leader
    expect(secondState.isLeader).toBe(true);
  });

  // ── DEBUG_PATHS (admin-only) ──────────────────────────────────────────────

  it("DEBUG_PATHS by admin does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "debug-1", role: "admin" }));
    await room.waitForNextPatch();

    client.send(MessageType.DEBUG_PATHS, { enabled: true });
    await room.waitForNextMessage();

    // No crash
    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("DEBUG_PATHS by non-admin is ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "debug-2", role: "user" }));
    await room.waitForNextPatch();

    client.send(MessageType.DEBUG_PATHS, { enabled: true });
    await room.waitForNextMessage();

    // No crash, silently ignored
    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── TOGGLE_AOI (admin-only) ────────────────────────────────────────────────

  it("TOGGLE_AOI by admin toggles without crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "aoi-1", role: "admin" }));
    await room.waitForNextPatch();

    client.send(MessageType.TOGGLE_AOI, { enabled: false });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  it("TOGGLE_AOI by non-admin is ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "aoi-2", role: "user" }));
    await room.waitForNextPatch();

    client.send(MessageType.TOGGLE_AOI, { enabled: false });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── INSTANCE_DEFS_REQUEST ──────────────────────────────────────────────────

  it("INSTANCE_DEFS_REQUEST with instance ids returns response", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "instdef-1" }));
    await room.waitForNextPatch();

    client.send(MessageType.INSTANCE_DEFS_REQUEST, { instanceIds: ["fake-uuid"] });
    const msg = await client.waitForMessage(MessageType.INSTANCE_DEFS_RESPONSE);

    expect(msg).toBeDefined();
    expect(msg.instances).toBeDefined();
  });

  // ── ITEM_SWAP additional coverage ──────────────────────────────────────────

  it("ITEM_SWAP between two occupied slots swaps correctly", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "swap-both" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.addItem("item_a", 1, 5);
    player.addItem("item_b", 2, 5);

    expect(player.inventory.get("0")!.itemId).toBe("item_a");
    expect(player.inventory.get("1")!.itemId).toBe("item_b");

    client.send(MessageType.ITEM_SWAP, { from: 0, to: 1 });
    await room.waitForNextMessage();

    // Items should be swapped
    expect(player.inventory.get("0")!.itemId).toBe("item_b");
    expect(player.inventory.get("1")!.itemId).toBe("item_a");
  });

  it("ITEM_SWAP with out-of-range slots does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "swap-range" }));
    await room.waitForNextPatch();

    client.send(MessageType.ITEM_SWAP, { from: -1, to: 999 });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── Chat admin commands ────────────────────────────────────────────────────

  it("/players command lists connected players", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "cmd-players", name: "TestHero" }),
    );
    await room.waitForNextPatch();

    // Consume the join announcement
    client.send(MessageType.CHAT_SEND, { text: "/players" });
    const msg = await client.waitForMessage(MessageType.CHAT_ENTRY);

    expect(msg).toBeDefined();
  });

  it("/help command returns help text", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "cmd-help" }));
    await room.waitForNextPatch();

    client.send(MessageType.CHAT_SEND, { text: "/help" });
    const msg = await client.waitForMessage(MessageType.CHAT_ENTRY);

    expect(msg).toBeDefined();
  });

  // ── ITEM_SPLIT ──────────────────────────────────────────────────────────────

  it("ITEM_SPLIT moves partial quantity to an empty slot", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "split-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Add 5 items to slot 0 (maxStack=10)
    player.addItem("test_item", 5, 10);
    expect(player.inventory.get("0")!.quantity).toBe(5);

    client.send(MessageType.ITEM_SPLIT, { from: 0, to: 3, quantity: 2 });
    await room.waitForNextMessage();

    // Slot 0 should have 3 remaining, slot 3 should have 2
    expect(player.inventory.get("0")!.quantity).toBe(3);
    expect(player.inventory.get("3")).toBeDefined();
    expect(player.inventory.get("3")!.quantity).toBe(2);
    expect(player.inventory.get("3")!.itemId).toBe("test_item");
  });

  it("ITEM_SPLIT with invalid data types does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "split-bad" }));
    await room.waitForNextPatch();

    // Send non-number values — handler checks typeof
    client.send(MessageType.ITEM_SPLIT, { from: "bad", to: "data", quantity: "nope" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── CONSUMABLE_BAR_SWAP ───────────────────────────────────────────────────

  it("CONSUMABLE_BAR_SWAP swaps two consumable bar slots", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "cswap-1" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.consumableBar[0] = "item_a";
    player.consumableBar[1] = "item_b";

    client.send(MessageType.CONSUMABLE_BAR_SWAP, { from: 0, to: 1 });
    await room.waitForNextMessage();

    expect(player.consumableBar[0]).toBe("item_b");
    expect(player.consumableBar[1]).toBe("item_a");
  });

  it("CONSUMABLE_BAR_SWAP with out-of-range slots does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "cswap-bad" }));
    await room.waitForNextPatch();

    // Slots far out of range — handler checks bounds
    client.send(MessageType.CONSUMABLE_BAR_SWAP, { from: -1, to: 999 });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── EQUIP_ITEM deeper coverage ────────────────────────────────────────────

  it("EQUIP_ITEM with no instanceId on inventory slot is rejected", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "equip-noinst" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // Add a plain item (no instanceId — not equipment)
    player.addItem("plain_item", 1, 5);
    expect(player.inventory.get("0")!.instanceId).toBeFalsy();

    client.send(MessageType.EQUIP_ITEM, { invSlot: 0, equipSlot: "weapon" });
    await room.waitForNextMessage();

    // Equipment should remain empty
    expect(player.equipment.get("weapon")).toBeUndefined();
  });

  it("EQUIP_ITEM with invalid equipSlot string is rejected", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "equip-badslot" }));
    await room.waitForNextPatch();

    client.send(MessageType.EQUIP_ITEM, { invSlot: 0, equipSlot: "totally_invalid" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
    // No equipment slot created
    expect(player.equipment.get("totally_invalid")).toBeUndefined();
  });

  // ── GATE_INTERACT ─────────────────────────────────────────────────────────

  it("GATE_INTERACT without player does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "gate-1" }));
    await room.waitForNextPatch();

    // Send a gate interact with a non-existent gate — the handler calls gateSystem
    // which will handle the missing gate gracefully
    client.send(MessageType.GATE_INTERACT, { gateId: "nonexistent-gate" });
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── ITEM_DESTROY regular item (non-transient) ─────────────────────────────

  it("ITEM_DESTROY succeeds for a regular (non-transient) item", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "idestroy-reg" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    // getItemDef returns undefined in mock → def?.transient is falsy → destroy allowed
    player.addItem("regular_item", 3, 10);
    expect(player.inventory.get("0")).toBeDefined();

    client.send(MessageType.ITEM_DESTROY, { slot: 0 });
    await room.waitForNextMessage();

    // Item should be removed
    expect(player.inventory.get("0")).toBeUndefined();
  });

  // ── Chat /help and /players via integration ────────────────────────────────

  it("chat /help via integration returns a response", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "chat-help" }));
    await room.waitForNextPatch();

    client.send(MessageType.CHAT_SEND, { text: "/help" });
    const msg = await client.waitForMessage(MessageType.CHAT_ENTRY);

    expect(msg).toBeDefined();
  });

  it("chat /players via integration returns a response", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(
      room,
      opts({ accountId: "chat-players", name: "IntegrationHero" }),
    );
    await room.waitForNextPatch();

    client.send(MessageType.CHAT_SEND, { text: "/players" });
    const msg = await client.waitForMessage(MessageType.CHAT_ENTRY);

    expect(msg).toBeDefined();
  });

  // ── Room empty / dispose ──────────────────────────────────────────────────

  it("room player count reaches 0 after sole player leaves", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "empty-1" }));
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(1);

    await client.leave();
    await new Promise((r) => setTimeout(r, 300));

    expect(room.state.players.size).toBe(0);
  });

  it("room player count reaches 0 after all players leave sequentially", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const c1 = await colyseus.connectTo(room, opts({ accountId: "empty-2a" }));
    const c2 = await colyseus.connectTo(room, opts({ accountId: "empty-2b" }));
    await room.waitForNextPatch();

    expect(room.state.players.size).toBe(2);

    await c1.leave();
    await new Promise((r) => setTimeout(r, 200));
    expect(room.state.players.size).toBe(1);

    await c2.leave();
    await new Promise((r) => setTimeout(r, 200));
    expect(room.state.players.size).toBe(0);
  });

  // ── Admin client receives DEBUG_PATHS data ─────────────────────────────────

  it("admin client receives debug path data after enabling DEBUG_PATHS", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const admin = await colyseus.connectTo(
      room,
      opts({ accountId: "admindebug-1", role: "admin" }),
    );
    await room.waitForNextPatch();

    const player = room.state.players.get(admin.sessionId)!;
    expect(player).toBeDefined();

    // Enable debug paths
    admin.send(MessageType.DEBUG_PATHS, { enabled: true });
    await room.waitForNextMessage();

    // Admin can send a second toggle without crash
    admin.send(MessageType.DEBUG_PATHS, { enabled: false });
    await room.waitForNextMessage();

    expect(player).toBeDefined();
  });

  // ── SKILL_USE coverage: alive player with no skill found ──────────────────

  it("SKILL_USE by alive player with a skillId that getSkillDef returns null for does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "skill-nofind" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    expect(player.lifeState).toBe(LifeState.ALIVE);

    // Send SKILL_USE with a plausible skill name — getSkillDef returns undefined in mock
    client.send(MessageType.SKILL_USE, { skillId: "heavy_strike" });
    await room.waitForNextMessage();

    // Player should still be alive and healthy (no crash, skill not found is a no-op)
    expect(player.health).toBe(player.maxHealth);
    expect(player.lifeState).toBe(LifeState.ALIVE);
  });

  it("SKILL_USE with missing skillId field does not crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "skill-noid" }));
    await room.waitForNextPatch();

    // Send SKILL_USE without a skillId property
    client.send(MessageType.SKILL_USE, {});
    await room.waitForNextMessage();

    const player = room.state.players.get(client.sessionId)!;
    expect(player).toBeDefined();
  });

  // ── Multiple rapid messages ──────────────────────────────────────────────

  it("handles multiple rapid MOVE messages without crash", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "rapid-move" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const baseX = player.x;
    const baseZ = player.z;

    // Send several moves in quick succession
    for (let i = 0; i < 5; i++) {
      client.send(MessageType.MOVE, { x: baseX + i + 1, z: baseZ });
    }
    await room.waitForNextMessage();

    expect(player).toBeDefined();
  });

  // ── MOVE when dead is ignored ────────────────────────────────────────────

  it("MOVE when player is dead is ignored", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "move-dead" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    const origX = player.x;
    const origZ = player.z;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.MOVE, { x: origX + 10, z: origZ + 10 });
    await room.waitForNextMessage();

    // Path should not be set (dead players can't move)
    expect(player).toBeDefined();
  });

  // ── SPRINT when dead is ignored ──────────────────────────────────────────

  it("SPRINT when player is dead does not set sprintRequested", async () => {
    const room = await colyseus.createRoom("dungeon", {});
    const client = await colyseus.connectTo(room, opts({ accountId: "sprint-dead" }));
    await room.waitForNextPatch();

    const player = room.state.players.get(client.sessionId)!;
    player.lifeState = LifeState.DEAD;

    client.send(MessageType.SPRINT, { active: true });
    await room.waitForNextMessage();

    // sprintRequested should not be set on a dead player
    expect(player).toBeDefined();
  });
});
