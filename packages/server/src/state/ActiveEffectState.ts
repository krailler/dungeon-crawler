import { Schema, type } from "@colyseus/schema";
import type { EffectScaling } from "@dungeon/shared";

/**
 * Schema state for a single active effect on a player.
 *
 * Synced fields → client (Colyseus binary sync):
 *   effectId   ─ which effect (lookup EffectDefClient for name/icon)
 *   remaining  ─ seconds left (timer sweep overlay)
 *   duration   ─ total duration (for % calculation)
 *   stacks     ─ current stack count (badge on icon)
 *   modValue   ─ pre-computed display value (e.g. 25 = "-25%", used in tooltip)
 *
 * Server-only fields → NOT synced:
 *   scalingFactor   ─ stored so re-application can compare and upgrade
 *   scalingOverride ─ creature-specific override, kept for recomputeStats()
 */
export class ActiveEffectState extends Schema {
  @type("string") effectId: string = "";
  @type("float32") remaining: number = 0;
  @type("float32") duration: number = 0;
  @type("int8") stacks: number = 1;
  /** Pre-computed display value for client tooltip (abs %, clamped to 0–127) */
  @type("int8") modValue: number = 0;

  // ── Server-only fields (no @type — NOT synced to clients) ──────────────
  /** Scaling factor 0–1 based on dungeon level — kept for upgrade comparison */
  scalingFactor: number = 0;
  /** Scaling override from creature_effects, or null to use effect's default */
  scalingOverride: EffectScaling | null = null;
}
