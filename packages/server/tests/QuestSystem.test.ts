import { describe, it, expect, beforeEach, mock } from "bun:test";
import { QuestSystem } from "../src/systems/QuestSystem.js";
import { DungeonState } from "../src/state/DungeonState.js";
import {
  QuestType,
  QuestStatus,
  BOSS_TIMER_BASE,
  BOSS_TIMER_PER_LEVEL,
  QUEST_BONUS_GOLD_PER_LEVEL,
  QUEST_BONUS_XP_PER_LEVEL,
} from "@dungeon/shared";

// Mock getCreatureTypeDef so we control isBoss
const mockGetCreatureTypeDef = mock(() => null as { isBoss: boolean } | null);
mock.module("../src/creatures/CreatureTypeRegistry.js", () => ({
  getCreatureTypeDef: mockGetCreatureTypeDef,
}));

function makeChatSystem() {
  return {
    broadcastSystemI18n: mock(() => {}),
  } as any;
}

describe("QuestSystem", () => {
  let state: DungeonState;
  let chatSystem: ReturnType<typeof makeChatSystem>;
  let qs: QuestSystem;

  beforeEach(() => {
    state = new DungeonState();
    chatSystem = makeChatSystem();
    qs = new QuestSystem(state, chatSystem);
    mockGetCreatureTypeDef.mockReset();
    mockGetCreatureTypeDef.mockReturnValue(null);
  });

  // ── generateQuests ──────────────────────────────────────────────────────────

  describe("generateQuests()", () => {
    it("creates KILL_ALL and NO_DEATHS quests without boss", () => {
      qs.generateQuests(10, false, 5);

      expect(state.quests.size).toBe(2);

      const killAll = state.quests.get(QuestType.KILL_ALL)!;
      expect(killAll).toBeDefined();
      expect(killAll.target).toBe(10);
      expect(killAll.progress).toBe(0);
      expect(killAll.status).toBe(QuestStatus.ACTIVE);

      const noDeaths = state.quests.get(QuestType.NO_DEATHS)!;
      expect(noDeaths).toBeDefined();
      expect(noDeaths.target).toBe(0);
      expect(noDeaths.progress).toBe(0);
      expect(noDeaths.status).toBe(QuestStatus.ACTIVE);
    });

    it("creates BOSS_TIMED quest when hasBoss is true", () => {
      const dungeonLevel = 5;
      qs.generateQuests(10, true, dungeonLevel);

      expect(state.quests.size).toBe(3);

      const bossTimed = state.quests.get(QuestType.BOSS_TIMED)!;
      expect(bossTimed).toBeDefined();
      const expectedTarget = BOSS_TIMER_BASE + dungeonLevel * BOSS_TIMER_PER_LEVEL;
      expect(bossTimed.target).toBe(expectedTarget);
      // countdown starts at target
      expect(bossTimed.progress).toBe(expectedTarget);
      expect(bossTimed.status).toBe(QuestStatus.ACTIVE);
    });

    it("clears existing quests before generating new ones", () => {
      qs.generateQuests(5, false, 1);
      expect(state.quests.size).toBe(2);

      qs.generateQuests(8, true, 3);
      expect(state.quests.size).toBe(3);
      expect(state.quests.get(QuestType.KILL_ALL)!.target).toBe(8);
    });
  });

  // ── onCreatureKilled ────────────────────────────────────────────────────────

  describe("onCreatureKilled()", () => {
    beforeEach(() => {
      qs.generateQuests(3, true, 5);
    });

    it("increments KILL_ALL progress", () => {
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: false });
      qs.onCreatureKilled("zombie");
      expect(state.quests.get(QuestType.KILL_ALL)!.progress).toBe(1);
    });

    it("completes KILL_ALL when progress reaches target", () => {
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: false });
      qs.onCreatureKilled("zombie");
      qs.onCreatureKilled("zombie");
      qs.onCreatureKilled("zombie");

      const killAll = state.quests.get(QuestType.KILL_ALL)!;
      expect(killAll.status).toBe(QuestStatus.COMPLETED);
      expect(chatSystem.broadcastSystemI18n).toHaveBeenCalled();
    });

    it("completes BOSS_TIMED when a boss is killed", () => {
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: true });
      qs.onCreatureKilled("golem");

      const bossTimed = state.quests.get(QuestType.BOSS_TIMED)!;
      expect(bossTimed.status).toBe(QuestStatus.COMPLETED);
      expect(bossTimed.timerStarted).toBe(false);
    });

    it("does not complete BOSS_TIMED for non-boss creature", () => {
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: false });
      qs.onCreatureKilled("zombie");

      expect(state.quests.get(QuestType.BOSS_TIMED)!.status).toBe(QuestStatus.ACTIVE);
    });
  });

  // ── onCreatureHit ──────────────────────────────────────────────────────────

  describe("onCreatureHit()", () => {
    it("starts boss timer when hitting a boss creature for the first time", () => {
      qs.generateQuests(5, true, 5);
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: true });

      qs.onCreatureHit("golem");

      const bossTimed = state.quests.get(QuestType.BOSS_TIMED)!;
      expect(bossTimed.timerStarted).toBe(true);
      expect(chatSystem.broadcastSystemI18n).toHaveBeenCalled();
    });

    it("does nothing for non-boss creatures", () => {
      qs.generateQuests(5, true, 5);
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: false });

      qs.onCreatureHit("zombie");

      const bossTimed = state.quests.get(QuestType.BOSS_TIMED)!;
      expect(bossTimed.timerStarted).toBe(false);
    });

    it("does nothing if timer already started", () => {
      qs.generateQuests(5, true, 5);
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: true });

      // Start the timer
      qs.onCreatureHit("golem");
      const callCount = chatSystem.broadcastSystemI18n.mock.calls.length;

      // Hit again — should not broadcast again
      qs.onCreatureHit("golem");
      expect(chatSystem.broadcastSystemI18n.mock.calls.length).toBe(callCount);
    });

    it("does nothing if no BOSS_TIMED quest exists", () => {
      // Generate quests without boss
      qs.generateQuests(5, false, 5);
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: true });

      // Should not throw
      qs.onCreatureHit("golem");
      expect(chatSystem.broadcastSystemI18n).not.toHaveBeenCalled();
    });

    it("does nothing if creature type is not found in registry", () => {
      qs.generateQuests(5, true, 5);
      mockGetCreatureTypeDef.mockReturnValue(null);

      qs.onCreatureHit("unknown");

      const bossTimed = state.quests.get(QuestType.BOSS_TIMED)!;
      expect(bossTimed.timerStarted).toBe(false);
    });
  });

  // ── tick ─────────────────────────────────────────────────────────────────────

  describe("tick()", () => {
    beforeEach(() => {
      qs.generateQuests(5, true, 5);
    });

    it("does nothing when boss timer has not started", () => {
      const bossTimed = state.quests.get(QuestType.BOSS_TIMED)!;
      const progressBefore = bossTimed.progress;
      qs.tick(1);
      expect(bossTimed.progress).toBe(progressBefore);
    });

    it("counts down boss timer when started", () => {
      const bossTimed = state.quests.get(QuestType.BOSS_TIMED)!;
      bossTimed.timerStarted = true;
      const target = bossTimed.target;

      qs.tick(5);
      expect(bossTimed.progress).toBe(target - 5);
    });

    it("fails boss timed quest when timer expires", () => {
      const bossTimed = state.quests.get(QuestType.BOSS_TIMED)!;
      bossTimed.timerStarted = true;
      const target = bossTimed.target;

      qs.tick(target + 1);
      expect(bossTimed.status).toBe(QuestStatus.FAILED);
      expect(bossTimed.progress).toBe(0);
    });
  });

  // ── onPlayerDied ────────────────────────────────────────────────────────────

  describe("onPlayerDied()", () => {
    it("fails NO_DEATHS quest", () => {
      qs.generateQuests(5, false, 1);
      qs.onPlayerDied();
      expect(state.quests.get(QuestType.NO_DEATHS)!.status).toBe(QuestStatus.FAILED);
    });

    it("does nothing if NO_DEATHS already failed", () => {
      qs.generateQuests(5, false, 1);
      qs.onPlayerDied();
      // calling again should not throw
      qs.onPlayerDied();
      expect(state.quests.get(QuestType.NO_DEATHS)!.status).toBe(QuestStatus.FAILED);
    });
  });

  // ── getCompletionRewards ────────────────────────────────────────────────────

  describe("getCompletionRewards()", () => {
    it("returns zero rewards when no quests completed", () => {
      qs.generateQuests(5, false, 5);
      const rewards = qs.getCompletionRewards(5);
      expect(rewards.bonusGold).toBe(0);
      expect(rewards.bonusXp).toBe(0);
    });

    it("sums rewards for completed quests", () => {
      const dungeonLevel = 5;
      qs.generateQuests(1, false, dungeonLevel);

      // Complete KILL_ALL
      mockGetCreatureTypeDef.mockReturnValue({ isBoss: false });
      qs.onCreatureKilled("zombie");

      const rewards = qs.getCompletionRewards(dungeonLevel);
      // 1 completed quest
      expect(rewards.bonusGold).toBe(dungeonLevel * QUEST_BONUS_GOLD_PER_LEVEL * 1);
      expect(rewards.bonusXp).toBe(dungeonLevel * QUEST_BONUS_XP_PER_LEVEL * 1);
    });
  });

  // ── reset ───────────────────────────────────────────────────────────────────

  describe("reset()", () => {
    it("replaces internal state and chatSystem references", () => {
      qs.generateQuests(5, false, 1);
      expect(state.quests.size).toBe(2);

      const newState = new DungeonState();
      const newChat = makeChatSystem();
      qs.reset(newState, newChat);

      // Generate quests on new state
      qs.generateQuests(3, false, 1);
      // Old state untouched
      expect(state.quests.size).toBe(2);
      // New state has new quests
      expect(newState.quests.size).toBe(2);
      expect(newState.quests.get(QuestType.KILL_ALL)!.target).toBe(3);
    });
  });
});
