/**
 * GameLoop — Server tick orchestrator (runs at TICK_RATE Hz via Colyseus clock).
 *
 * Tick order (each call to update()):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ 1. Tick rate metrics                                       │
 *   │ 2. updateStamina()           drain/regen sprint stamina    │
 *   │ 3. tickItemCooldowns()       count down item use cooldowns │
 *   │ 4. effectSystem.update()     tick buff/debuff timers       │
 *   │ 5. updateLifeStates()        downed→dead→respawn, revive  │
 *   │ 6. moveEntity()              advance players along paths   │
 *   │ 7. aiSystem.update()         creature AI + creature→player │
 *   │ 8. combatSystem.update()     player auto-attack→creature   │
 *   │ 9. resolveEntityCollisions() push overlapping entities     │
 *   │ 10. enforceWallMargin()      slide entities off walls      │
 *   │ 11. sendDebugPaths()         admin path visualization      │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * Bridge pattern:
 *   GameLoop does NOT hold direct references to DungeonRoom or subsystems.
 *   Instead, it receives a GameLoopBridge interface with getters + methods.
 *   This allows the room to swap implementations (e.g. on dungeon restart)
 *   without reconstructing the game loop.
 *
 * Life state machine (updateLifeStates):
 *
 *   ALIVE ──(health≤0)──▶ DOWNED ──(bleedout 30s)──▶ DEAD ──(respawn timer)──▶ ALIVE
 *                           │                                                     ▲
 *                           └──(revive channel 3.5s, pauses bleedout)─────────────┘
 */
import type { ClockTimer } from "@colyseus/timer";
import type { DungeonState } from "../state/DungeonState";
import type { PlayerState } from "../state/PlayerState";
import type { CreatureState } from "../state/CreatureState";
import type { AISystem, AIHitEvent } from "./AISystem";
import type { CombatSystem, CombatHitEvent } from "./CombatSystem";
import type { EffectSystem } from "./EffectSystem";
import type { ChatSystem } from "../chat/ChatSystem";
import {
  MessageType,
  CreatureEffectTrigger,
  computeGoldDrop,
  computeXpDrop,
  MAX_LEVEL,
  TILE_SIZE,
  ENTITY_COLLISION_RADIUS,
  WALL_MARGIN,
  STAMINA_MAX,
  SPRINT_SPEED_MULTIPLIER,
  PLAYER_WAYPOINT_THRESHOLD,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_REGEN_PER_SEC,
  STAMINA_REGEN_DELAY,
  LifeState,
  BLEEDOUT_DURATION,
  RESPAWN_BASE_TIME,
  RESPAWN_TIME_INCREMENT,
  RESPAWN_MAX_TIME,
  REVIVE_CHANNEL_DURATION,
  REVIVE_RANGE,
  REVIVE_HP_PERCENT,
  TutorialStep,
  lerpEffectValue,
  computeScalingFactor,
  isFromBehind,
  StatModType,
} from "@dungeon/shared";
import type {
  TileMap,
  CombatLogMessage,
  DebugPathEntry,
  AdminDebugInfoMessage,
  DamageDealtMessage,
  TutorialHintMessage,
} from "@dungeon/shared";
import type { Pathfinder } from "../navigation/Pathfinder";
import { notifyLevelProgress } from "../chat/notifyLevelProgress";
import { getCreatureLoot, getCreatureEffects } from "../creatures/CreatureTypeRegistry";
import { getEffectDef } from "../effects/EffectRegistry";
import { getSkillDef } from "../skills/SkillRegistry";
import { syncAndNotifySkills } from "../classes/ClassRegistry";
import { logger } from "../logger";
import { ActiveEffectState } from "../state/ActiveEffectState";
import { LootBagState } from "../state/LootBagState";
import { InventorySlotState } from "../state/InventorySlotState";

const REVIVE_RANGE_SQ = REVIVE_RANGE * REVIVE_RANGE;

export interface GameLoopBridge {
  readonly state: DungeonState;
  readonly aiSystem: AISystem;
  readonly combatSystem: CombatSystem;
  readonly effectSystem: EffectSystem;
  readonly chatSystem: ChatSystem;
  readonly tileMap: TileMap;
  readonly pathfinder: Pathfinder;
  readonly tickRateTarget: number;
  broadcastToAdmins(type: string, message: unknown): void;
  sendToClient(sessionId: string, type: string, message: unknown): void;
  readonly clock: ClockTimer;
  /** Called when a creature is permanently removed (death cleanup). */
  onCreatureRemoved?: (creatureId: string) => void;
  /** Get the dungeon entrance position for respawning. */
  getSpawnPoint(): { x: number; z: number } | null;
}

export class GameLoop {
  private bridge: GameLoopBridge;
  private lastTickTime: number = 0;
  private tickAccum: number = 0;
  private tickCount: number = 0;
  // Pre-allocated maps reused each tick to avoid GC pressure
  private tickPlayersMap: Map<string, PlayerState> = new Map();
  private tickCreaturesMap: Map<string, CreatureState> = new Map();
  /** Clients subscribed to debug path visualization */
  private debugPathClients: Set<string> = new Set();

  constructor(bridge: GameLoopBridge) {
    this.bridge = bridge;
  }

  update(dt: number): void {
    const now = performance.now();
    if (this.lastTickTime > 0) {
      this.tickAccum += now - this.lastTickTime;
      this.tickCount++;
      if (this.tickAccum >= 1000) {
        const rate = Math.round((this.tickCount / this.tickAccum) * 1000);
        this.bridge.state.tickRate = rate;
        this.bridge.broadcastToAdmins(MessageType.ADMIN_DEBUG_INFO, {
          seed: this.bridge.state.dungeonSeed,
          tickRate: rate,
          tickRateTarget: this.bridge.tickRateTarget,
          runtime: this.bridge.state.serverRuntime,
        } satisfies AdminDebugInfoMessage);
        this.tickAccum = 0;
        this.tickCount = 0;
      }
    }
    this.lastTickTime = now;

    const dtSec = dt / 1000;

    // Build player map once per tick (reused by effects, AI, and combat)
    this.tickPlayersMap.clear();
    this.bridge.state.players.forEach((player: PlayerState, sessionId: string) => {
      this.tickPlayersMap.set(sessionId, player);
    });

    // Update sprint stamina before movement so speed is correct this tick
    this.updateStamina(dtSec);

    // Tick item cooldowns
    this.tickItemCooldowns(dtSec);

    // Tick active effects (debuffs/buffs) — players
    this.bridge.effectSystem.update(dtSec, this.tickPlayersMap);

    // Tick active effects — creatures
    this.tickCreatureEffects(dtSec);

    // Update life states (downed, dead, respawn, revive channels)
    this.updateLifeStates(dtSec);

    // Move players along their paths (with chase re-pathing)
    for (const [, player] of this.bridge.state.players) {
      if (player.lifeState !== LifeState.ALIVE) {
        player.isMoving = false;
        continue;
      }
      // Chase mode: re-path toward the target creature every few ticks
      if (player.chaseCreatureId) {
        const creature = this.bridge.state.creatures.get(player.chaseCreatureId);
        if (!creature || creature.isDead) {
          player.chaseCreatureId = null;
        } else {
          const dx = creature.x - player.x;
          const dz = creature.z - player.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist <= player.attackRange) {
            // In range — stop chasing and face the target
            player.chaseCreatureId = null;
            player.path = [];
            player.currentPathIndex = 0;
            player.isMoving = false;
            player.rotY = Math.atan2(dx, dz);
          } else if (this.tickCount % 4 === 0) {
            // Re-path every 4 ticks (~8 times/s) to avoid A* spam
            const path = this.bridge.pathfinder.findPath(
              { x: player.x, z: player.z },
              { x: creature.x, z: creature.z },
            );
            if (path.length > 0) {
              player.path = path;
              player.currentPathIndex = 0;
              player.isMoving = true;
            }
          }
        }
      }
      this.moveEntity(player, dtSec);
    }

    // ── Combat: creature → player ─────────────────────────────────────
    //
    //   AISystem.update()
    //     │
    //     ├─ onPlayerDamage ──▶ handlePlayerDamage()  (HP reduction + downed)
    //     └─ onHit            ──▶ handleCreatureHit()  (combat log + effects)
    //                                │
    //                                └─▶ applyCreatureEffects()
    //                                      ├─ level gating
    //                                      ├─ scaling factor + chance roll
    //                                      └─▶ EffectSystem.applyEffect()
    //
    this.bridge.aiSystem.update(
      dtSec,
      this.tickPlayersMap,
      (sessionId, damage) => this.handlePlayerDamage(sessionId, damage),
      (event) => this.handleCreatureHit(event),
    );

    // ── Combat: player → creature ─────────────────────────────────────
    //
    //   CombatSystem.update()
    //     └─ onHit ──▶ handleCombatHit()
    //                    ├─ threat + combat log + floating text
    //                    └─ if killed: processCreatureKill()
    //                          ├─ gold distribution
    //                          ├─ XP distribution + level-ups
    //                          └─ loot bag spawn
    //
    this.tickCreaturesMap.clear();
    this.bridge.state.creatures.forEach((creature: CreatureState, id: string) => {
      this.tickCreaturesMap.set(id, creature);
    });

    this.bridge.combatSystem.update(
      dtSec,
      this.tickPlayersMap,
      this.tickCreaturesMap,
      (event) => this.handleCombatHit(event),
      (sessionId) => {
        this.bridge.sendToClient(sessionId, MessageType.ACTION_FEEDBACK, {
          i18nKey: "feedback.notFacing",
        });
      },
    );

    // Resolve entity-to-entity collisions (push overlapping entities apart)
    this.resolveEntityCollisions();

    // Enforce wall margin for all entities (after AI movement + collision pushback)
    this.bridge.state.players.forEach((player: PlayerState) => {
      if (player.lifeState === LifeState.ALIVE) this.enforceWallMargin(player);
    });
    this.bridge.state.creatures.forEach((creature: CreatureState) => {
      if (!creature.isDead) this.enforceWallMargin(creature);
    });

    // Debug: send path data to subscribed admin clients
    if (this.debugPathClients.size > 0) {
      this.sendDebugPaths();
    }
  }

  /**
   * Tick creature effect timers and recompute speed when effects expire.
   * Simplified version of EffectSystem.update() — creatures only need speed recalculation.
   */
  private tickCreatureEffects(dt: number): void {
    this.bridge.state.creatures.forEach((creature: CreatureState) => {
      if (creature.isDead || creature.effects.size === 0) return;

      let dirty = false;
      const toRemove: string[] = [];

      creature.effects.forEach((effect: { remaining: number }, effectId: string) => {
        effect.remaining -= dt;
        if (effect.remaining <= 0) {
          toRemove.push(effectId);
          dirty = true;
        }
      });

      for (const id of toRemove) {
        creature.effects.delete(id);
      }

      if (dirty) {
        this.recomputeCreatureSpeed(creature);
      }
    });
  }

  /**
   * Apply an effect to a creature (simplified — no stacking/scaling, just refresh timer).
   * Creates or refreshes an ActiveEffectState on the creature's effects MapSchema.
   */
  applyCreatureEffect(creature: CreatureState, effectId: string): void {
    const def = getEffectDef(effectId);
    if (!def) {
      logger.error({ effectId }, "Effect not found in EffectRegistry");
      return;
    }

    const existing = creature.effects.get(effectId);
    if (existing) {
      // Refresh timer
      existing.remaining = def.duration;
    } else {
      const state = new ActiveEffectState();
      state.effectId = effectId;
      state.duration = def.duration;
      state.remaining = def.duration;
      state.stacks = 1;
      // Compute display value from first stat modifier
      const firstMod = Object.values(def.statModifiers)[0];
      state.modValue = firstMod ? Math.min(127, Math.round(Math.abs(firstMod.value * 100))) : 0;
      creature.effects.set(effectId, state);
    }

    this.recomputeCreatureSpeed(creature);
  }

  /** Recompute creature speed from baseSpeed + active effect modifiers. */
  private recomputeCreatureSpeed(creature: CreatureState): void {
    let percentMod = 0;

    creature.effects.forEach((effect: { effectId: string }) => {
      const def = getEffectDef(effect.effectId);
      if (!def) return;
      for (const [stat, mod] of Object.entries(def.statModifiers)) {
        if (stat === "moveSpeed" && mod.type === StatModType.PERCENT) {
          percentMod += mod.value;
        }
      }
    });

    creature.speed = Math.max(0.5, creature.baseSpeed * (1 + percentMod));
  }

  /** Apply damage from a creature attack to a player and trigger downed state if dead. */
  private handlePlayerDamage(sessionId: string, damage: number): void {
    const player = this.bridge.state.players.get(sessionId);
    if (!player || player.lifeState !== LifeState.ALIVE) return;
    player.health -= damage;
    if (player.health < 0) player.health = 0;
    if (player.health <= 0) {
      this.transitionToDowned(player, sessionId);
    }
  }

  /** Process a creature→player hit: combat log + creature on-hit effects. */
  private handleCreatureHit(event: AIHitEvent): void {
    const creature = this.bridge.state.creatures.get(event.creatureId);
    const player = this.bridge.state.players.get(event.sessionId);
    if (!player) return;

    // Combat log for admins
    const msg: CombatLogMessage = {
      dir: "e2p",
      src: `${creature?.creatureType ?? "creature"}[${event.creatureId}]`,
      tgt: player.characterName || event.sessionId.slice(0, 6),
      atk: event.attackDamage,
      def: event.targetDefense,
      dmg: event.finalDamage,
      hp: player.health,
      maxHp: player.maxHealth,
      kill: player.lifeState !== LifeState.ALIVE,
    };
    this.bridge.broadcastToAdmins(MessageType.COMBAT_LOG, msg);

    // Auto-target: if player has no target, auto-select the creature that hit them
    if (player.lifeState === LifeState.ALIVE) {
      const currentTarget = this.bridge.combatSystem.getTarget(event.sessionId);
      if (!currentTarget) {
        this.bridge.combatSystem.setTarget(event.sessionId, event.creatureId);
        // Notify client to update its targetStore
        this.bridge.sendToClient(event.sessionId, MessageType.AUTO_TARGET, {
          creatureId: event.creatureId,
        });
      }
    }

    // Detect back-hit: creature attacked from behind the player (>100° from facing)
    const isBackHit = creature
      ? isFromBehind(player.rotY, player.x, player.z, creature.x, creature.z, 100)
      : false;

    // Apply creature on-hit effects (e.g. zombie applies Weakness, Hamstring on back-hit)
    if (creature && player.lifeState === LifeState.ALIVE) {
      this.applyCreatureEffects(creature, player, event.sessionId, isBackHit);
    }
  }

  /**
   * Roll and apply creature on-hit effects to a player.
   *
   * For each creature_effect entry with trigger ON_HIT:
   *   1. Check level gating (minLevel/maxLevel vs dungeon level)
   *   2. Compute scaling factor t = (dungeonLevel - min) / (max - min)
   *   3. Interpolate chance:  effectiveChance = lerp(base, maxChance, t)
   *   4. Roll chance → if success, apply effect with scaled values
   *   5. Send tutorial hint on first debuff received
   */
  private applyCreatureEffects(
    creature: CreatureState,
    player: PlayerState,
    sessionId: string,
    isBackHit: boolean = false,
  ): void {
    const dungeonLevel = this.bridge.state.dungeonLevel;
    const creatureEffects = getCreatureEffects(creature.creatureType);

    for (const entry of creatureEffects) {
      // Match trigger type: ON_HIT always fires, ON_HIT_BEHIND only on back-hits
      if (entry.trigger === CreatureEffectTrigger.ON_HIT_BEHIND && !isBackHit) continue;
      if (
        entry.trigger !== CreatureEffectTrigger.ON_HIT &&
        entry.trigger !== CreatureEffectTrigger.ON_HIT_BEHIND
      )
        continue;

      // Level gating
      if (entry.minLevel > 0 && dungeonLevel < entry.minLevel) continue;
      if (entry.maxLevel > 0 && dungeonLevel > entry.maxLevel) continue;

      const t = computeScalingFactor(dungeonLevel, entry.minLevel, entry.maxLevel, MAX_LEVEL);

      // Scaled chance
      const effectiveChance =
        entry.maxChance !== null ? lerpEffectValue(entry.chance, entry.maxChance, t) : entry.chance;

      const effectDef = getEffectDef(entry.effectId);
      if (!effectDef) continue;

      if (Math.random() < effectiveChance) {
        const isNew = !player.effects.has(entry.effectId);
        this.bridge.effectSystem.applyEffect(
          player,
          entry.effectId,
          entry.stacks,
          t,
          entry.scalingOverride,
        );

        // Tutorial: first time receiving a debuff
        if (
          isNew &&
          effectDef.isDebuff &&
          !player.tutorialsCompleted.has(TutorialStep.FIRST_DEBUFF)
        ) {
          this.bridge.sendToClient(sessionId, MessageType.TUTORIAL_HINT, {
            step: TutorialStep.FIRST_DEBUFF,
            i18nKey: "tutorial.firstDebuff",
          } satisfies TutorialHintMessage);
        }
      }
    }
  }

  /** Handle a player→creature hit — shared between auto-attack and active skills. */
  handleCombatHit(event: CombatHitEvent): void {
    // Player hit generates threat on the enemy
    this.bridge.aiSystem.addThreat(event.creatureId, event.sessionId, event.finalDamage);

    const player = this.bridge.state.players.get(event.sessionId);
    const msg: CombatLogMessage = {
      dir: "p2e",
      src: player?.characterName || event.sessionId.slice(0, 6),
      tgt: `${this.bridge.state.creatures.get(event.creatureId)?.creatureType ?? "creature"}[${event.creatureId}]`,
      atk: event.attackDamage,
      def: event.targetDefense,
      dmg: event.finalDamage,
      hp: event.targetHealth,
      maxHp: event.targetMaxHealth,
      kill: event.killed,
    };
    this.bridge.broadcastToAdmins(MessageType.COMBAT_LOG, msg);

    // Notify the attacking player of damage dealt (for floating combat text)
    const dmgMsg: DamageDealtMessage = {
      creatureId: event.creatureId,
      dmg: event.finalDamage,
      kill: event.killed,
    };
    this.bridge.sendToClient(event.sessionId, MessageType.DAMAGE_DEALT, dmgMsg);

    // Clear target for all players that had this creature selected
    if (event.killed) {
      this.bridge.combatSystem.clearTargetFor(event.creatureId);

      // If skill has resetOnKill, notify client that cooldown was cleared
      if (event.skillId) {
        const skillDef = getSkillDef(event.skillId);
        if (skillDef?.resetOnKill) {
          this.bridge.sendToClient(event.sessionId, MessageType.SKILL_COOLDOWN, {
            skillId: event.skillId,
            duration: 0,
            remaining: 0,
          });
        }
      }

      this.processCreatureKill(event);
    }
  }

  /** Distribute gold, XP, loot and schedule creature removal after a kill. */
  private processCreatureKill(event: CombatHitEvent): void {
    const killedCreature = this.bridge.state.creatures.get(event.creatureId);
    if (killedCreature) {
      // Clear effects on death (so TargetFrame doesn't show stale debuffs on corpse)
      killedCreature.effects.clear();

      // Distribute gold to alive party members
      let aliveCount = 0;
      let levelSum = 0;
      this.bridge.state.players.forEach((p: PlayerState) => {
        if (p.lifeState === LifeState.ALIVE) {
          aliveCount++;
          levelSum += p.level;
        }
      });
      const avgPartyLevel = aliveCount > 0 ? levelSum / aliveCount : 1;
      const goldPerPlayer = computeGoldDrop(killedCreature.level, avgPartyLevel, aliveCount);

      this.bridge.state.players.forEach((p: PlayerState) => {
        if (p.lifeState === LifeState.ALIVE) {
          p.gold += goldPerPlayer;
        }
      });

      this.bridge.chatSystem.broadcastSystemI18n(
        "chat.goldGained",
        { amount: goldPerPlayer, enemy: killedCreature.creatureType },
        `+${goldPerPlayer} gold from ${killedCreature.creatureType}!`,
      );

      // Distribute XP to alive players (not split — each player gets full XP)
      this.bridge.state.players.forEach((p: PlayerState, sessionId: string) => {
        if (p.lifeState !== LifeState.ALIVE || p.level >= MAX_LEVEL) return;

        const xpGain = computeXpDrop(killedCreature.level, p.level);
        const levelUps = p.addXp(xpGain);

        if (levelUps.length > 0) {
          notifyLevelProgress(
            sessionId,
            p,
            levelUps,
            this.bridge.chatSystem,
            this.bridge.sendToClient.bind(this.bridge),
          );

          // Grant skills that unlock at the new level(s)
          syncAndNotifySkills(p.classId, p.level, p.skills, sessionId, this.bridge.chatSystem);
        }
      });

      // Drop loot bag on the ground (per-creature loot table)
      const lootEntries = getCreatureLoot(killedCreature.creatureType);
      if (lootEntries.length > 0) {
        const bag = new LootBagState();
        let slotIndex = 0;
        for (const entry of lootEntries) {
          if (Math.random() < entry.dropChance) {
            const qty =
              entry.minQuantity +
              Math.floor(Math.random() * (entry.maxQuantity - entry.minQuantity + 1));
            const slot = new InventorySlotState();
            slot.itemId = entry.itemId;
            slot.quantity = qty;
            bag.items.set(String(slotIndex++), slot);
          }
        }
        if (bag.items.size > 0) {
          bag.x = killedCreature.x;
          bag.z = killedCreature.z;
          this.bridge.state.lootBags.set(`loot_${event.creatureId}_${Date.now()}`, bag);
        }
      }
    }

    // Keep corpse visible for a few seconds so players see the death animation
    this.bridge.clock.setTimeout(() => {
      this.bridge.state.creatures.delete(event.creatureId);
      this.bridge.aiSystem.unregister(event.creatureId);
      this.bridge.onCreatureRemoved?.(event.creatureId);
    }, 5000);
  }

  /** Admin-kill a creature: triggers the full kill flow (gold, XP, loot, removal). */
  handleAdminCreatureKill(creatureId: string): void {
    // Find any alive player as the "killer" for loot distribution
    let killerSessionId = "";
    this.bridge.state.players.forEach((p: PlayerState, sid: string) => {
      if (!killerSessionId && p.lifeState === LifeState.ALIVE) killerSessionId = sid;
    });
    this.processCreatureKill({
      creatureId,
      sessionId: killerSessionId,
      attackDamage: 0,
      targetDefense: 0,
      finalDamage: 0,
      targetHealth: 0,
      targetMaxHealth: 0,
      killed: true,
      skillId: "",
    });
  }

  /** Drain / regenerate stamina for all players each tick. */
  private updateStamina(dt: number): void {
    for (const [, player] of this.bridge.state.players) {
      if (player.lifeState !== LifeState.ALIVE) {
        player.isSprinting = false;
        player.sprintRequested = false;
        continue;
      }

      const shouldSprint = player.sprintRequested && player.isMoving && player.stamina > 0;
      player.isSprinting = shouldSprint;

      if (shouldSprint) {
        player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN_PER_SEC * dt);
        player.staminaRegenDelay = STAMINA_REGEN_DELAY;
        if (player.stamina <= 0) {
          player.isSprinting = false;
        }
      } else {
        if (player.staminaRegenDelay > 0) {
          player.staminaRegenDelay -= dt;
        } else if (player.stamina < STAMINA_MAX) {
          player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN_PER_SEC * dt);
        }
      }
    }
  }

  /** Tick down item cooldowns for all players. */
  private tickItemCooldowns(dt: number): void {
    for (const [, player] of this.bridge.state.players) {
      if (player.itemCooldowns.size === 0) continue;
      const expired: string[] = [];
      for (const [itemId, remaining] of player.itemCooldowns) {
        const next = remaining - dt;
        if (next <= 0) {
          expired.push(itemId);
        } else {
          player.itemCooldowns.set(itemId, next);
        }
      }
      for (const id of expired) {
        player.itemCooldowns.delete(id);
      }
    }
  }

  moveEntity(entity: PlayerState, dt: number): void {
    if (!entity.isMoving || entity.currentPathIndex >= entity.path.length) {
      entity.isMoving = false;
      return;
    }

    let effectiveSpeed = entity.speed;
    if (entity.isSprinting) effectiveSpeed *= SPRINT_SPEED_MULTIPLIER;
    let remaining = effectiveSpeed * dt;

    while (remaining > 0 && entity.currentPathIndex < entity.path.length) {
      const target = entity.path[entity.currentPathIndex];
      const dx = target.x - entity.x;
      const dz = target.z - entity.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < PLAYER_WAYPOINT_THRESHOLD) {
        entity.currentPathIndex++;
        continue;
      }

      const ndx = dx / dist;
      const ndz = dz / dist;
      entity.rotY = Math.atan2(ndx, ndz);

      if (remaining >= dist) {
        // Snap to waypoint and consume distance, continue to next
        entity.x = target.x;
        entity.z = target.z;
        remaining -= dist;
        entity.currentPathIndex++;
      } else {
        // Partial move toward waypoint
        entity.x += ndx * remaining;
        entity.z += ndz * remaining;
        remaining = 0;
      }
    }

    if (entity.currentPathIndex >= entity.path.length) {
      entity.isMoving = false;
    }

    // Push entity away from nearby walls so it doesn't clip against them
    this.enforceWallMargin(entity);
  }

  /**
   * Slide the entity away from adjacent non-walkable tiles (walls + blocked tiles like closed gates).
   * For each of the 4 cardinal directions, if the neighbouring tile is not walkable,
   * enforce a minimum distance from that tile's edge.
   */
  private enforceWallMargin(entity: { x: number; z: number }): void {
    const pf = this.bridge.pathfinder;
    const half = TILE_SIZE / 2;

    // Current tile (grid coords)
    const tx = Math.round(entity.x / TILE_SIZE);
    const tz = Math.round(entity.z / TILE_SIZE);

    // Tile center in world coords
    const cx = tx * TILE_SIZE;
    const cz = tz * TILE_SIZE;

    // Check +X neighbour
    if (!pf.isWalkable(tx + 1, tz)) {
      const edge = cx + half;
      if (entity.x > edge - WALL_MARGIN) {
        entity.x = edge - WALL_MARGIN;
      }
    }
    // Check -X neighbour
    if (!pf.isWalkable(tx - 1, tz)) {
      const edge = cx - half;
      if (entity.x < edge + WALL_MARGIN) {
        entity.x = edge + WALL_MARGIN;
      }
    }
    // Check +Z neighbour
    if (!pf.isWalkable(tx, tz + 1)) {
      const edge = cz + half;
      if (entity.z > edge - WALL_MARGIN) {
        entity.z = edge - WALL_MARGIN;
      }
    }
    // Check -Z neighbour
    if (!pf.isWalkable(tx, tz - 1)) {
      const edge = cz - half;
      if (entity.z < edge + WALL_MARGIN) {
        entity.z = edge + WALL_MARGIN;
      }
    }
  }

  // ── Entity collision resolution ──────────────────────────────────────

  private collisionEntities: { x: number; z: number; setPos: (x: number, z: number) => void }[] =
    [];

  private resolveEntityCollisions(): void {
    const DIAMETER = ENTITY_COLLISION_RADIUS * 2;
    const DIAMETER_SQ = DIAMETER * DIAMETER;

    // Build flat array of alive entities (reuse array to reduce GC)
    const entities = this.collisionEntities;
    entities.length = 0;

    this.bridge.state.players.forEach((player: PlayerState) => {
      if (player.lifeState !== LifeState.ALIVE) return;
      entities.push({
        get x() {
          return player.x;
        },
        get z() {
          return player.z;
        },
        setPos(x, z) {
          player.x = x;
          player.z = z;
        },
      });
    });

    this.bridge.state.creatures.forEach((creature: CreatureState) => {
      if (creature.isDead) return;
      entities.push({
        get x() {
          return creature.x;
        },
        get z() {
          return creature.z;
        },
        setPos(x, z) {
          creature.x = x;
          creature.z = z;
        },
      });
    });

    // O(n^2) pair check — fine for <50 entities in a dungeon
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;

        if (distSq >= DIAMETER_SQ) continue;

        const dist = Math.sqrt(distSq);
        const overlap = DIAMETER - dist;

        // Normalized push direction (b away from a)
        let nx: number, nz: number;
        if (dist < 0.001) {
          nx = 1;
          nz = 0;
        } else {
          nx = dx / dist;
          nz = dz / dist;
        }

        const half = overlap / 2;

        // Candidate positions
        const ax = a.x - nx * half;
        const az = a.z - nz * half;
        const bx = b.x + nx * half;
        const bz = b.z + nz * half;

        const aValid = this.isWalkable(ax, az);
        const bValid = this.isWalkable(bx, bz);

        if (aValid && bValid) {
          a.setPos(ax, az);
          b.setPos(bx, bz);
        } else if (aValid && !bValid) {
          a.setPos(a.x - nx * overlap, a.z - nz * overlap);
        } else if (!aValid && bValid) {
          b.setPos(b.x + nx * overlap, b.z + nz * overlap);
        }
        // Both in walls → do nothing, pathfinder will resolve next repath
      }
    }
  }

  private isWalkable(worldX: number, worldZ: number): boolean {
    const tx = Math.round(worldX / TILE_SIZE);
    const tz = Math.round(worldZ / TILE_SIZE);
    return this.bridge.pathfinder.isWalkable(tx, tz);
  }

  /** Kill a player (admin /kill, etc.) — enters the normal death flow. */
  killPlayer(sessionId: string): void {
    const player = this.bridge.state.players.get(sessionId);
    if (!player || player.lifeState !== LifeState.ALIVE) return;
    player.health = 0;
    this.transitionToDowned(player, sessionId);
  }

  /** Revive a downed or dead player instantly at full HP (no channel). */
  revivePlayer(sessionId: string): boolean {
    const player = this.bridge.state.players.get(sessionId);
    if (!player) return false;
    if (player.lifeState === LifeState.ALIVE) return false;

    player.lifeState = LifeState.ALIVE;
    player.health = player.maxHealth;
    player.bleedTimer = 0;
    player.respawnTimer = 0;
    player.reviveProgress = 0;
    player.reviverSessionId = "";

    // Clear cooldowns and effects
    player.itemCooldowns.clear();
    this.bridge.combatSystem.clearCooldowns(sessionId);
    this.bridge.effectSystem.clearEffects(player);

    return true;
  }

  // ── Life state management ──────────────────────────────────────────

  /** Transition a player from ALIVE to DOWNED. */
  private transitionToDowned(player: PlayerState, sessionId: string): void {
    player.lifeState = LifeState.DOWNED;
    player.bleedTimer = BLEEDOUT_DURATION;
    player.isMoving = false;
    player.isSprinting = false;
    player.sprintRequested = false;
    player.chaseCreatureId = null;
    player.animState = "";
    player.path = [];
    this.bridge.effectSystem.clearEffects(player);

    const name = player.characterName || sessionId.slice(0, 6);
    this.bridge.chatSystem.broadcastSystemI18n("chat.downed", { name }, `${name} has been downed!`);

    // Tutorial: tell the downed player what happened
    if (!player.tutorialsCompleted.has(TutorialStep.YOU_DOWNED)) {
      this.bridge.sendToClient(sessionId, MessageType.TUTORIAL_HINT, {
        step: TutorialStep.YOU_DOWNED,
        i18nKey: "tutorial.youDowned",
      });
    }

    // Tutorial: tell alive teammates they can revive
    this.bridge.state.players.forEach((other: PlayerState, otherSid: string) => {
      if (otherSid === sessionId) return;
      if (other.lifeState !== LifeState.ALIVE) return;
      if (other.tutorialsCompleted.has(TutorialStep.TEAMMATE_DOWNED)) return;
      this.bridge.sendToClient(otherSid, MessageType.TUTORIAL_HINT, {
        step: TutorialStep.TEAMMATE_DOWNED,
        i18nKey: "tutorial.teammateDowned",
      });
    });
  }

  /** Transition a player from DOWNED to DEAD (bleed-out expired). */
  private transitionToDead(player: PlayerState, sessionId: string): void {
    player.lifeState = LifeState.DEAD;
    player.bleedTimer = 0;
    player.reviveProgress = 0;
    player.reviverSessionId = "";

    const rawTimer = RESPAWN_BASE_TIME + player.deathCount * RESPAWN_TIME_INCREMENT;
    player.respawnTimer = Math.min(rawTimer, RESPAWN_MAX_TIME);
    player.deathCount++;

    // Auto-complete the "you downed" tutorial (player is now dead, hint no longer relevant)
    player.tutorialsCompleted.add(TutorialStep.YOU_DOWNED);
    this.bridge.sendToClient(sessionId, MessageType.TUTORIAL_DISMISS, {
      step: TutorialStep.YOU_DOWNED,
    });

    const name = player.characterName || sessionId.slice(0, 6);
    this.bridge.chatSystem.broadcastSystemI18n("chat.died", { name }, `${name} has died!`);
  }

  /** Respawn a dead player at the dungeon entrance. */
  private respawnPlayer(player: PlayerState, sessionId: string): void {
    player.lifeState = LifeState.ALIVE;
    player.health = player.maxHealth;
    player.respawnTimer = 0;
    player.bleedTimer = 0;
    player.reviveProgress = 0;
    player.reviverSessionId = "";

    // Clear cooldowns and effects so the player starts fresh
    player.itemCooldowns.clear();
    this.bridge.combatSystem.clearCooldowns(sessionId);
    this.bridge.effectSystem.clearEffects(player);

    const spawn = this.bridge.getSpawnPoint();
    if (spawn) {
      player.x = spawn.x;
      player.z = spawn.z;
    }

    const name = player.characterName || "???";
    this.bridge.chatSystem.broadcastSystemI18n(
      "chat.respawned",
      { name },
      `${name} has respawned.`,
    );
  }

  /** Called each tick to update downed/dead timers and revive channels. */
  private updateLifeStates(dt: number): void {
    for (const [sessionId, player] of this.bridge.state.players) {
      if (player.lifeState === LifeState.DOWNED) {
        // Tick revive channel if active — bleedout is paused while being revived
        if (player.reviverSessionId) {
          const reviver = this.bridge.state.players.get(player.reviverSessionId);
          if (
            !reviver ||
            reviver.lifeState !== LifeState.ALIVE ||
            reviver.isMoving ||
            reviver.animState !== "" ||
            !this.isInReviveRange(reviver, player)
          ) {
            // Reviver died, disconnected, moved, attacked, or out of range — cancel
            this.cancelReviveOn(player);
          } else {
            player.reviveProgress += dt / REVIVE_CHANNEL_DURATION;
            if (player.reviveProgress >= 1.0) {
              // Revive successful!
              player.lifeState = LifeState.ALIVE;
              player.health = Math.max(1, Math.floor(player.maxHealth * REVIVE_HP_PERCENT));
              player.bleedTimer = 0;
              player.reviveProgress = 0;
              const reviverSid = player.reviverSessionId;
              const reviverName = reviver.characterName || reviverSid.slice(0, 6);
              player.reviverSessionId = "";
              const name = player.characterName || sessionId.slice(0, 6);
              this.bridge.chatSystem.broadcastSystemI18n(
                "chat.revived",
                { name, reviver: reviverName },
                `${name} has been revived by ${reviverName}!`,
              );

              // Auto-complete death tutorials for both parties
              player.tutorialsCompleted.add(TutorialStep.YOU_DOWNED);
              this.bridge.sendToClient(sessionId, MessageType.TUTORIAL_DISMISS, {
                step: TutorialStep.YOU_DOWNED,
              });
              reviver.tutorialsCompleted.add(TutorialStep.TEAMMATE_DOWNED);
              this.bridge.sendToClient(reviverSid, MessageType.TUTORIAL_DISMISS, {
                step: TutorialStep.TEAMMATE_DOWNED,
              });
              continue;
            }
            // Bleedout paused while revive is channeling — skip timer decrement
            continue;
          }
        }

        // Tick bleed-out timer (only when no active revive)
        player.bleedTimer -= dt;
        if (player.bleedTimer <= 0) {
          this.transitionToDead(player, sessionId);
        }
      } else if (player.lifeState === LifeState.DEAD) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) {
          this.respawnPlayer(player, sessionId);
        }
      }
    }
  }

  private isInReviveRange(reviver: PlayerState, target: PlayerState): boolean {
    const dx = reviver.x - target.x;
    const dz = reviver.z - target.z;
    return dx * dx + dz * dz <= REVIVE_RANGE_SQ;
  }

  private cancelReviveOn(player: PlayerState): void {
    player.reviveProgress = 0;
    player.reviverSessionId = "";
  }

  /** Start a revive channel on a downed player. Returns true on success. */
  startRevive(reviverSessionId: string, targetSessionId: string): boolean {
    const reviver = this.bridge.state.players.get(reviverSessionId);
    const target = this.bridge.state.players.get(targetSessionId);
    if (!reviver || !target) return false;
    if (reviver.lifeState !== LifeState.ALIVE) return false;
    if (reviver.isMoving || reviver.animState !== "") return false;
    if (target.lifeState !== LifeState.DOWNED) return false;
    if (!this.isInReviveRange(reviver, target)) return false;
    // Only one reviver at a time
    if (target.reviverSessionId && target.reviverSessionId !== reviverSessionId) return false;

    target.reviverSessionId = reviverSessionId;
    target.reviveProgress = 0;
    return true;
  }

  setDebugPaths(sessionId: string, enabled: boolean): void {
    if (enabled) {
      this.debugPathClients.add(sessionId);
    } else {
      this.debugPathClients.delete(sessionId);
    }
  }

  removeDebugClient(sessionId: string): void {
    this.debugPathClients.delete(sessionId);
  }

  private sendDebugPaths(): void {
    const paths: DebugPathEntry[] = [];

    this.bridge.state.players.forEach((player: PlayerState, sessionId: string) => {
      if (player.path.length > 0 && player.currentPathIndex < player.path.length) {
        paths.push({
          id: sessionId,
          kind: "player",
          x: player.x,
          z: player.z,
          path: player.path.slice(player.currentPathIndex),
        });
      }
    });

    this.bridge.state.creatures.forEach((creature: CreatureState, creatureId: string) => {
      if (creature.path.length > 0 && creature.currentPathIndex < creature.path.length) {
        paths.push({
          id: creatureId,
          kind: "creature",
          x: creature.x,
          z: creature.z,
          path: creature.path.slice(creature.currentPathIndex),
        });
      }
    });

    const msg = { paths };
    for (const sessionId of this.debugPathClients) {
      this.bridge.sendToClient(sessionId, MessageType.DEBUG_PATHS, msg);
    }
  }
}
