import {
  pgSchema,
  text,
  integer,
  real,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import {
  Role,
  StackBehavior,
  ItemEffectType,
  CreatureEffectTrigger,
  TalentEffectType,
  StatModType,
} from "@dungeon/shared";

// ── Schemas ─────────────────────────────────────────────────────────────────

export const charactersSchema = pgSchema("characters");
export const worldSchema = pgSchema("world");

// ── Enums ────────────────────────────────────────────────────────────────────

export const roleEnum = charactersSchema.enum("role", Role);
export const stackBehaviorEnum = worldSchema.enum("stack_behavior", StackBehavior);
export const itemEffectTypeEnum = worldSchema.enum("item_effect_type", ItemEffectType);
export const creatureEffectTriggerEnum = worldSchema.enum(
  "creature_effect_trigger",
  CreatureEffectTrigger,
);
export const talentEffectTypeEnum = worldSchema.enum("talent_effect_type", TalentEffectType);
export const statModTypeEnum = worldSchema.enum("stat_mod_type", StatModType);

// ── Characters schema (player data — backups) ───────────────────────────────

export const accounts = charactersSchema.table("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: roleEnum("role").notNull().default(Role.USER),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const characters = charactersSchema.table(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    strength: integer("strength").notNull().default(10),
    vitality: integer("vitality").notNull().default(10),
    agility: integer("agility").notNull().default(10),
    level: integer("level").notNull().default(1),
    gold: integer("gold").notNull().default(0),
    xp: integer("xp").notNull().default(0),
    statPoints: integer("stat_points").notNull().default(0),
    talentPoints: integer("talent_points").notNull().default(0),
    classId: text("class_id").notNull().default("warrior"),
    tutorialsCompleted: text("tutorials_completed").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_characters_account_name").on(table.accountId, table.name)],
);

export const characterInventory = charactersSchema.table(
  "character_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    slotIndex: integer("slot_index").notNull(),
    itemId: text("item_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (table) => [
    uniqueIndex("idx_char_inventory_slot").on(table.characterId, table.slotIndex),
    index("idx_char_inventory_char").on(table.characterId),
  ],
);

export const characterTalents = charactersSchema.table(
  "character_talents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    talentId: text("talent_id").notNull(),
    rank: integer("rank").notNull().default(1),
  },
  (table) => [
    uniqueIndex("idx_char_talents_talent").on(table.characterId, table.talentId),
    index("idx_char_talents_char").on(table.characterId),
  ],
);

export const characterSkills = charactersSchema.table(
  "character_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
  },
  (table) => [
    uniqueIndex("idx_char_skills_skill").on(table.characterId, table.skillId),
    index("idx_char_skills_char").on(table.characterId),
  ],
);

// ── World schema (game definitions — regenerable) ───────────────────────────

export const items = worldSchema.table("items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull(),
  maxStack: integer("max_stack").notNull().default(1),
  consumable: boolean("consumable").notNull().default(false),
  cooldown: real("cooldown").notNull().default(0),
  effectType: itemEffectTypeEnum("effect_type").notNull().default(ItemEffectType.NONE),
  effectParams: jsonb("effect_params").notNull().default({}),
  useSound: text("use_sound").notNull().default(""),
  transient: boolean("transient").notNull().default(false),
  rarity: text("rarity").notNull().default("common"),
});

export const skills = worldSchema.table("skills", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull(),
  passive: boolean("passive").notNull().default(false),
  cooldown: real("cooldown").notNull().default(0),
  damageMultiplier: real("damage_multiplier").notNull().default(1),
  animState: text("anim_state").notNull().default("punch"),
});

export const creatures = worldSchema.table("creatures", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  strength: integer("strength").notNull().default(10),
  vitality: integer("vitality").notNull().default(10),
  agility: integer("agility").notNull().default(10),
  overrideMaxHealth: integer("override_max_health"),
  overrideMoveSpeed: real("override_move_speed"),
  overrideAttackCooldown: real("override_attack_cooldown"),
  overrideAttackDamage: integer("override_attack_damage"),
  overrideDefense: integer("override_defense"),
  detectionRange: real("detection_range").notNull().default(12),
  attackRange: real("attack_range").notNull().default(2.5),
  leashRange: real("leash_range").notNull().default(20),
  skin: text("skin").notNull(),
  minLevel: integer("min_level").notNull().default(1),
  maxLevel: integer("max_level").notNull().default(0),
  isBoss: boolean("is_boss").notNull().default(false),
});

export const creatureSkills = worldSchema.table("creature_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatureId: text("creature_id")
    .notNull()
    .references(() => creatures.id, { onDelete: "cascade" }),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  isDefault: boolean("is_default").notNull().default(false),
});

export const creatureLoot = worldSchema.table("creature_loot", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatureId: text("creature_id")
    .notNull()
    .references(() => creatures.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  dropChance: real("drop_chance").notNull().default(0.25),
  minQuantity: integer("min_quantity").notNull().default(1),
  maxQuantity: integer("max_quantity").notNull().default(1),
});

export const effects = worldSchema.table("effects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull(),
  duration: real("duration").notNull().default(5),
  maxStacks: integer("max_stacks").notNull().default(1),
  stackBehavior: stackBehaviorEnum("stack_behavior").notNull().default(StackBehavior.REFRESH),
  isDebuff: boolean("is_debuff").notNull().default(true),
  statModifiers: jsonb("stat_modifiers").notNull().default({}),
  tickEffect: jsonb("tick_effect"),
  scaling: jsonb("scaling"),
});

export const classes = worldSchema.table("classes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default(""),
  hpBase: real("hp_base").notNull().default(50),
  hpPerVit: real("hp_per_vit").notNull().default(5),
  attackBase: real("attack_base").notNull().default(5),
  attackPerStr: real("attack_per_str").notNull().default(0.5),
  defenseBase: real("defense_base").notNull().default(0),
  defensePerVit: real("defense_per_vit").notNull().default(0.3),
  speedBase: real("speed_base").notNull().default(4),
  speedPerAgi: real("speed_per_agi").notNull().default(0.1),
  cooldownBase: real("cooldown_base").notNull().default(1.2),
  cooldownPerAgi: real("cooldown_per_agi").notNull().default(0.02),
  attackRange: real("attack_range").notNull().default(2.5),
});

export const classSkills = worldSchema.table("class_skills", {
  classId: text("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id, { onDelete: "cascade" }),
  isDefault: boolean("is_default").notNull().default(false),
});

export const talents = worldSchema.table("talents", {
  id: text("id").primaryKey(),
  classId: text("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default(""),
  maxRank: integer("max_rank").notNull().default(1),
  requiredTalentId: text("required_talent_id"),
  requiredTalentRank: integer("required_talent_rank").notNull().default(1),
  requiredLevel: integer("required_level").notNull().default(1),
  row: integer("row").notNull().default(0),
  col: integer("col").notNull().default(0),
});

export const talentEffects = worldSchema.table("talent_effects", {
  id: uuid("id").primaryKey().defaultRandom(),
  talentId: text("talent_id")
    .notNull()
    .references(() => talents.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull().default(1),
  effectType: talentEffectTypeEnum("effect_type").notNull(),
  statName: text("stat_name"),
  statModType: statModTypeEnum("stat_mod_type"),
  statModValue: real("stat_mod_value"),
  skillId: text("skill_id"),
  cooldownMul: real("cooldown_mul"),
  damageMul: real("damage_mul"),
});

export const creatureEffects = worldSchema.table("creature_effects", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatureId: text("creature_id")
    .notNull()
    .references(() => creatures.id, { onDelete: "cascade" }),
  trigger: creatureEffectTriggerEnum("trigger").notNull(),
  effectId: text("effect_id")
    .notNull()
    .references(() => effects.id, { onDelete: "cascade" }),
  chance: real("chance").notNull().default(0.3),
  stacks: integer("stacks").notNull().default(1),
  minLevel: integer("min_level").notNull().default(0),
  maxLevel: integer("max_level").notNull().default(0),
  maxChance: real("max_chance"),
  scalingOverride: jsonb("scaling_override"),
});
