import type { DungeonState } from "../state/DungeonState";
import type { ChatSystem } from "../chat/ChatSystem";
import { QuestState } from "../state/QuestState";
import { getCreatureTypeDef } from "../creatures/CreatureTypeRegistry";
import {
  QuestType,
  QuestStatus,
  BOSS_TIMER_BASE,
  BOSS_TIMER_PER_LEVEL,
  QUEST_BONUS_GOLD_PER_LEVEL,
  QUEST_BONUS_XP_PER_LEVEL,
} from "@dungeon/shared";

export class QuestSystem {
  private state: DungeonState;
  private chatSystem: ChatSystem;

  constructor(state: DungeonState, chatSystem: ChatSystem) {
    this.state = state;
    this.chatSystem = chatSystem;
  }

  /** Generate quests for the current dungeon run. */
  generateQuests(totalCreatures: number, hasBoss: boolean, dungeonLevel: number): void {
    // Kill all creatures
    const killAll = new QuestState();
    killAll.id = QuestType.KILL_ALL;
    killAll.questType = QuestType.KILL_ALL;
    killAll.i18nKey = "quest.killAll";
    killAll.target = totalCreatures;
    killAll.progress = 0;
    killAll.status = QuestStatus.ACTIVE;
    this.state.quests.set(killAll.id, killAll);

    // Boss timed kill (only if dungeon has a boss)
    if (hasBoss) {
      const bossTimed = new QuestState();
      bossTimed.id = QuestType.BOSS_TIMED;
      bossTimed.questType = QuestType.BOSS_TIMED;
      bossTimed.i18nKey = "quest.bossTimed";
      bossTimed.target = BOSS_TIMER_BASE + dungeonLevel * BOSS_TIMER_PER_LEVEL;
      bossTimed.progress = bossTimed.target; // countdown: starts at target, decreases
      bossTimed.status = QuestStatus.ACTIVE;
      this.state.quests.set(bossTimed.id, bossTimed);
    }

    // No deaths
    const noDeaths = new QuestState();
    noDeaths.id = QuestType.NO_DEATHS;
    noDeaths.questType = QuestType.NO_DEATHS;
    noDeaths.i18nKey = "quest.noDeaths";
    noDeaths.target = 0;
    noDeaths.progress = 0;
    noDeaths.status = QuestStatus.ACTIVE;
    this.state.quests.set(noDeaths.id, noDeaths);
  }

  /** Called when any creature is killed. */
  onCreatureKilled(creatureType: string): void {
    const typeDef = getCreatureTypeDef(creatureType);

    // Update kill_all progress
    const killAll = this.state.quests.get(QuestType.KILL_ALL);
    if (killAll && killAll.status === QuestStatus.ACTIVE) {
      killAll.progress++;
      if (killAll.progress >= killAll.target) {
        killAll.status = QuestStatus.COMPLETED;
        this.chatSystem.broadcastSystemI18n(
          "quest.objectiveCompleted",
          { quest: "quest.killAll" },
          "Quest completed: Kill all creatures!",
        );
      }
    }

    // Check boss kill for timed quest
    if (typeDef?.isBoss) {
      const bossTimed = this.state.quests.get(QuestType.BOSS_TIMED);
      if (bossTimed && bossTimed.status === QuestStatus.ACTIVE) {
        bossTimed.status = QuestStatus.COMPLETED;
        this.chatSystem.broadcastSystemI18n(
          "quest.objectiveCompleted",
          { quest: "quest.bossTimed" },
          "Quest completed: Defeat the boss in time!",
        );
      }
    }
  }

  /** Called when any creature takes damage (for boss timer start). */
  onCreatureHit(creatureType: string): void {
    const typeDef = getCreatureTypeDef(creatureType);
    if (!typeDef?.isBoss) return;

    const bossTimed = this.state.quests.get(QuestType.BOSS_TIMED);
    if (!bossTimed || bossTimed.timerStarted || bossTimed.status !== QuestStatus.ACTIVE) return;

    bossTimed.timerStarted = true;
    this.chatSystem.broadcastSystemI18n(
      "quest.bossTimerStarted",
      { seconds: bossTimed.target },
      `Boss timer started! ${bossTimed.target} seconds remaining.`,
    );
  }

  /** Tick the boss timer countdown. Called each game loop tick. */
  tick(dt: number): void {
    const bossTimed = this.state.quests.get(QuestType.BOSS_TIMED);
    if (!bossTimed || !bossTimed.timerStarted || bossTimed.status !== QuestStatus.ACTIVE) return;

    bossTimed.timerElapsed += dt;
    const remaining = Math.max(0, bossTimed.target - Math.floor(bossTimed.timerElapsed));
    bossTimed.progress = remaining;

    if (remaining <= 0) {
      bossTimed.status = QuestStatus.FAILED;
      this.chatSystem.broadcastSystemI18n(
        "quest.objectiveFailed",
        { quest: "quest.bossTimed" },
        "Quest failed: Boss timer expired!",
      );
    }
  }

  /** Called when a player dies (transitions to DOWNED). */
  onPlayerDied(): void {
    const noDeaths = this.state.quests.get(QuestType.NO_DEATHS);
    if (!noDeaths || noDeaths.status !== QuestStatus.ACTIVE) return;

    noDeaths.status = QuestStatus.FAILED;
    this.chatSystem.broadcastSystemI18n(
      "quest.objectiveFailed",
      { quest: "quest.noDeaths" },
      "Quest failed: A party member went down!",
    );
  }

  /** Calculate completion bonus rewards. */
  getCompletionRewards(dungeonLevel: number): { bonusGold: number; bonusXp: number } {
    let completedCount = 0;
    this.state.quests.forEach((quest) => {
      if (quest.status === QuestStatus.COMPLETED) completedCount++;
    });

    return {
      bonusGold: dungeonLevel * QUEST_BONUS_GOLD_PER_LEVEL * completedCount,
      bonusXp: dungeonLevel * QUEST_BONUS_XP_PER_LEVEL * completedCount,
    };
  }

  /** Reset quests (called on dungeon regeneration). */
  reset(newState: DungeonState, chatSystem: ChatSystem): void {
    this.state = newState;
    this.chatSystem = chatSystem;
  }
}
