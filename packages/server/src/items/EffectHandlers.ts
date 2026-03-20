import { ItemEffectType } from "@dungeon/shared";
import type { ItemEffectTypeValue } from "@dungeon/shared";
import type { PlayerState } from "../state/PlayerState";
import type { EffectSystem } from "../systems/EffectSystem";

type EffectContext = {
  player: PlayerState;
  params: Record<string, unknown>;
  effectSystem?: EffectSystem;
};

type EffectHandler = (ctx: EffectContext) => boolean;

const handlers = new Map<string, EffectHandler>();

// ── Built-in effects ─────────────────────────────────────────────────────────

handlers.set(ItemEffectType.HEAL, ({ player, params }) => {
  const amount = (params.amount as number) ?? 0;
  if (amount <= 0) return false;
  if (player.health >= player.maxHealth) return false;

  player.health = Math.min(player.health + amount, player.maxHealth);
  return true;
});

handlers.set(ItemEffectType.APPLY_EFFECT, ({ player, params, effectSystem }) => {
  const effectId = params.effectId as string;
  if (!effectId || !effectSystem) return false;

  effectSystem.applyEffect(player, effectId);
  return true;
});

// ── Public API ───────────────────────────────────────────────────────────────

export function executeEffect(
  effectType: ItemEffectTypeValue,
  player: PlayerState,
  params: Record<string, unknown>,
  effectSystem?: EffectSystem,
): boolean {
  const handler = handlers.get(effectType);
  if (!handler) return false;
  return handler({ player, params, effectSystem });
}
