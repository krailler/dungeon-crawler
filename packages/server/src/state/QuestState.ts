import { Schema, type } from "@colyseus/schema";
import { QuestType, QuestStatus } from "@dungeon/shared";
import type { QuestTypeValue, QuestStatusValue } from "@dungeon/shared";

export class QuestState extends Schema {
  @type("string") id: string = "";
  @type("string") questType: QuestTypeValue = QuestType.KILL_ALL;
  @type("string") i18nKey: string = "";
  @type("uint16") target: number = 0;
  @type("uint16") progress: number = 0;
  @type("string") status: QuestStatusValue = QuestStatus.ACTIVE;

  /** Server-only: whether the boss timer has started */
  timerStarted: boolean = false;
  /** Server-only: accumulated time in seconds since timer started */
  timerElapsed: number = 0;
}
