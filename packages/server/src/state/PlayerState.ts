import { ArraySchema, Schema, type } from "@colyseus/schema";
import { computeDerivedStats, xpToNextLevel, MAX_LEVEL, DEFAULT_SKILLS } from "@dungeon/shared";

export class PlayerState extends Schema {
  @type("float32") x: number = 0;
  @type("float32") z: number = 0;
  @type("float32") rotY: number = 0;
  @type("int16") health: number = 0;
  @type("int16") maxHealth: number = 0;
  @type("boolean") isMoving: boolean = false;
  @type("string") animState: string = "";
  @type("string") characterName: string = "";
  @type("string") role: string = "user";
  @type("boolean") online: boolean = true;
  @type("boolean") isLeader: boolean = false;

  // Base stats (synced for future character sheet UI)
  @type("int16") strength: number = 10;
  @type("int16") vitality: number = 10;
  @type("int16") agility: number = 10;
  @type("int16") level: number = 1;

  // Derived stats (synced for client display)
  @type("int16") attackDamage: number = 0;
  @type("int16") defense: number = 0;

  // Economy & progression (synced)
  @type("int32") gold: number = 0;
  @type("int32") xp: number = 0;
  @type("int32") xpToNext: number = 0;

  // Skills (synced — ordered list of skill IDs for the action bar)
  @type(["string"]) skills = new ArraySchema<string>(...DEFAULT_SKILLS);

  // Skill toggles (synced — client needs to show active/inactive state)
  @type("boolean") autoAttackEnabled: boolean = true;

  // Server-only (not synced)
  characterId: string = "";
  path: { x: number; z: number }[] = [];
  currentPathIndex: number = 0;
  speed: number = 0;
  attackCooldown: number = 1.0;
  attackRange: number = 2.5;

  /** Recompute all derived stats from current base stats and apply them. */
  applyDerivedStats(): void {
    const derived = computeDerivedStats({
      strength: this.strength,
      vitality: this.vitality,
      agility: this.agility,
    });
    this.maxHealth = derived.maxHealth;
    this.attackDamage = derived.attackDamage;
    this.defense = derived.defense;
    this.speed = derived.moveSpeed;
    this.attackCooldown = derived.attackCooldown;
    this.attackRange = derived.attackRange;
  }

  /**
   * Advance one level: +1 to each base stat, recompute derived, full heal.
   * Returns stat deltas for UI feedback.
   */
  levelUp(): { dhp: number; datk: number; ddef: number } {
    const prevHp = this.maxHealth;
    const prevAtk = this.attackDamage;
    const prevDef = this.defense;

    this.level++;
    this.strength++;
    this.vitality++;
    this.agility++;

    this.applyDerivedStats();
    this.health = this.maxHealth;
    this.xpToNext = xpToNextLevel(this.level);

    return {
      dhp: this.maxHealth - prevHp,
      datk: this.attackDamage - prevAtk,
      ddef: this.defense - prevDef,
    };
  }

  /**
   * Add XP and process any resulting level-ups.
   * Returns an array of level-up events with stat deltas (empty if no level-up).
   */
  addXp(amount: number): { level: number; dhp: number; datk: number; ddef: number }[] {
    if (this.level >= MAX_LEVEL) return [];
    this.xp += amount;

    const levelUps: { level: number; dhp: number; datk: number; ddef: number }[] = [];
    while (this.level < MAX_LEVEL && this.xp >= xpToNextLevel(this.level)) {
      this.xp -= xpToNextLevel(this.level);
      const deltas = this.levelUp();
      levelUps.push({ level: this.level, ...deltas });
    }
    return levelUps;
  }

  /**
   * Set player to a specific level: recompute base stats (+1 per level gained
   * from the base 10/10/10), recompute derived stats, full heal, reset XP.
   */
  setLevel(targetLevel: number): void {
    const levelsGained = targetLevel - 1;
    this.level = targetLevel;
    this.strength = 10 + levelsGained;
    this.vitality = 10 + levelsGained;
    this.agility = 10 + levelsGained;
    this.xp = 0;
    this.xpToNext = xpToNextLevel(targetLevel);

    this.applyDerivedStats();
    this.health = this.maxHealth;
  }
}
