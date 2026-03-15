import { Schema, type, view } from "@colyseus/schema";
import { computeDerivedStats, xpToNextLevel, MAX_LEVEL } from "@dungeon/shared";
import { PlayerSecretState } from "./PlayerSecretState";

export class PlayerState extends Schema {
  // ── Public fields (visible to all clients) ─────────────────────────────────
  @type("float32") x: number = 0;
  @type("float32") z: number = 0;
  @type("float32") rotY: number = 0;
  @type("int16") health: number = 0;
  @type("int16") maxHealth: number = 0;
  @type("boolean") isMoving: boolean = false;
  @type("string") animState: string = "";
  @type("string") characterName: string = "";
  @type("boolean") online: boolean = true;
  @type("boolean") isLeader: boolean = false;
  @type("int16") level: number = 1;

  // ── Private fields (only visible to the owning client via StateView) ───────
  @view() @type(PlayerSecretState) secret = new PlayerSecretState();

  // ── Server-only (not synced at all) ────────────────────────────────────────
  characterId: string = "";
  path: { x: number; z: number }[] = [];
  currentPathIndex: number = 0;
  speed: number = 0;
  attackCooldown: number = 1.0;
  attackRange: number = 2.5;

  // ── Convenience getters (delegate to secret for server-side code) ──────────

  get strength(): number {
    return this.secret.strength;
  }
  set strength(v: number) {
    this.secret.strength = v;
  }

  get vitality(): number {
    return this.secret.vitality;
  }
  set vitality(v: number) {
    this.secret.vitality = v;
  }

  get agility(): number {
    return this.secret.agility;
  }
  set agility(v: number) {
    this.secret.agility = v;
  }

  get attackDamage(): number {
    return this.secret.attackDamage;
  }
  set attackDamage(v: number) {
    this.secret.attackDamage = v;
  }

  get defense(): number {
    return this.secret.defense;
  }
  set defense(v: number) {
    this.secret.defense = v;
  }

  get gold(): number {
    return this.secret.gold;
  }
  set gold(v: number) {
    this.secret.gold = v;
  }

  get xp(): number {
    return this.secret.xp;
  }
  set xp(v: number) {
    this.secret.xp = v;
  }

  get xpToNext(): number {
    return this.secret.xpToNext;
  }
  set xpToNext(v: number) {
    this.secret.xpToNext = v;
  }

  get role(): string {
    return this.secret.role;
  }
  set role(v: string) {
    this.secret.role = v;
  }

  get skills() {
    return this.secret.skills;
  }

  get autoAttackEnabled(): boolean {
    return this.secret.autoAttackEnabled;
  }
  set autoAttackEnabled(v: boolean) {
    this.secret.autoAttackEnabled = v;
  }

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
