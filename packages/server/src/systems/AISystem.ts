/**
 * Creature AI — Finite state machine with threat-based targeting.
 *
 * State machine:
 *
 *   ┌──────┐    player in detection    ┌───────┐    in attack   ┌────────┐
 *   │ IDLE │ ──── range + LOS ────▶    │ CHASE │ ──── range ──▶ │ ATTACK │
 *   └──┬───┘                           └───┬───┘               └───┬────┘
 *      │                                   │                       │
 *      │  roam timer expires               │    all threat lost    │
 *      ▼                                   ▼                      │
 *   ┌──────┐                           ┌──────┐                   │
 *   │ ROAM │ ◄──── arrived/stuck ──────│ IDLE │ ◄─────────────────┘
 *   └──────┘                           └──────┘
 *                                         ▲
 *   ┌───────┐   too far from spawn        │  arrived at spawn
 *   │ LEASH │ ◄─── (any state) ──────    │
 *   └───┬───┘   clears threat, heals     │
 *       └────────────────────────────────┘
 *
 * Threat system:
 *   - Each creature has a per-player threat table
 *   - Damage dealt → +threat (THREAT_PER_DAMAGE)
 *   - Proximity (detection range + LOS) → passive tick (THREAT_PROXIMITY_TICK/s)
 *   - First detection → initial burst (THREAT_PROXIMITY_INITIAL)
 *   - Out of range → decay (THREAT_DECAY_RATE/s), removed at epsilon
 *   - Highest-threat alive player becomes the chase/attack target
 *
 * Damage timing:
 *   Attack animation starts → damage scheduled at DAMAGE_DELAY (mid-animation)
 *   This creates the "wind-up → impact" feel for creature punches.
 */
import type { CreatureState } from "../state/CreatureState";
import type { PlayerState } from "../state/PlayerState";
import type { Pathfinder, WorldPos } from "../navigation/Pathfinder";
import {
  ATTACK_ANIM_DURATION,
  CREATURE_REPATH_INTERVAL,
  TILE_SIZE,
  computeDamage,
  LifeState,
} from "@dungeon/shared";

const AIState = {
  IDLE: 0,
  CHASE: 1,
  ATTACK: 2,
  LEASH: 3,
  ROAM: 4,
} as const;

type AIStateType = (typeof AIState)[keyof typeof AIState];

const DAMAGE_DELAY = ATTACK_ANIM_DURATION / 2;

// ── Aggro tuning ────────────────────────────────────────────────────────────

/** Threat generated per point of damage dealt */
const THREAT_PER_DAMAGE = 1.0;
/** One-time threat burst when a player first enters detection range */
const THREAT_PROXIMITY_INITIAL = 5;
/** Passive threat per second for players inside detection range */
const THREAT_PROXIMITY_TICK = 1;
/** Threat decay per second for players outside detection range */
const THREAT_DECAY_RATE = 10;
/** Threshold below which threat is removed entirely */
const THREAT_EPSILON = 0.1;

// ── Roaming tuning ──────────────────────────────────────────────────────────

/** Max roam distance from spawn in tiles */
const ROAM_RADIUS = 3;
/** Min seconds between roam attempts */
const ROAM_MIN_WAIT = 2.0;
/** Max seconds between roam attempts */
const ROAM_MAX_WAIT = 6.0;
/** Max attempts to find a walkable roam target */
const ROAM_MAX_ATTEMPTS = 3;
/** Seconds without progress before a roaming creature is considered stuck */
const ROAM_STUCK_TIMEOUT = 1.5;
/** Minimum distance² a creature must travel per stuck-check window to not be stuck */
const ROAM_STUCK_DIST_SQ = 0.1 * 0.1;

function randomRoamWait(): number {
  return ROAM_MIN_WAIT + Math.random() * (ROAM_MAX_WAIT - ROAM_MIN_WAIT);
}

export interface AIHitEvent {
  creatureId: string;
  sessionId: string;
  attackDamage: number;
  targetDefense: number;
  finalDamage: number;
}

interface CreatureAI {
  creature: CreatureState;
  creatureId: string;
  state: AIStateType;
  repathTimer: number;
  attackTimer: number;
  animTimer: number;
  /** Pending damage: timer counts down, fires onPlayerHit at 0 */
  damageTimer: number;
  damageSessionId: string | null;
  damageAmount: number;
  damageAttack: number;
  damageDefense: number;
  /** Spawn position — used for leash */
  spawnX: number;
  spawnZ: number;
  leashRange: number;
  /** Per-player threat table */
  threatTable: Map<string, number>;
  /** Countdown until next roam attempt */
  roamTimer: number;
  /** Stuck detection: timer counts up while roaming */
  roamStuckTimer: number;
  /** Stuck detection: last known position */
  roamLastX: number;
  roamLastZ: number;
}

export class AISystem {
  private entries: CreatureAI[] = [];
  private entryById: Map<string, CreatureAI> = new Map();
  private pathfinder: Pathfinder;

  constructor(pathfinder: Pathfinder) {
    this.pathfinder = pathfinder;
  }

  register(creature: CreatureState, creatureId: string, leashRange: number): void {
    const entry: CreatureAI = {
      creature,
      creatureId,
      state: AIState.IDLE,
      repathTimer: 0,
      attackTimer: 0,
      animTimer: 0,
      damageTimer: 0,
      damageSessionId: null,
      damageAmount: 0,
      damageAttack: 0,
      damageDefense: 0,
      spawnX: creature.x,
      spawnZ: creature.z,
      leashRange,
      threatTable: new Map(),
      roamTimer: randomRoamWait(),
      roamStuckTimer: 0,
      roamLastX: creature.x,
      roamLastZ: creature.z,
    };
    this.entries.push(entry);
    this.entryById.set(creatureId, entry);
  }

  /** Remove a creature from the AI system (e.g. after death cleanup). */
  unregister(creatureId: string): void {
    const idx = this.entries.findIndex((e) => e.creatureId === creatureId);
    if (idx !== -1) this.entries.splice(idx, 1);
    this.entryById.delete(creatureId);
  }

  /** Add threat from an external source (e.g. player dealing damage). */
  addThreat(creatureId: string, sessionId: string, amount: number): void {
    const entry = this.entryById.get(creatureId);
    if (!entry || entry.creature.isDead) return;
    // Don't accept threat while leashing
    if (entry.state === AIState.LEASH) return;
    const current = entry.threatTable.get(sessionId) ?? 0;
    entry.threatTable.set(sessionId, current + amount);
  }

  /** Check if any alive creature is actively in combat (has threat on any player). */
  hasActiveCombat(): boolean {
    for (const entry of this.entries) {
      if (entry.creature.isDead) continue;
      if (entry.threatTable.size > 0) return true;
    }
    return false;
  }

  /** Remove a player from all threat tables (disconnect / death). */
  removePlayer(sessionId: string): void {
    for (const entry of this.entries) {
      entry.threatTable.delete(sessionId);
    }
  }

  update(
    dt: number,
    players: Map<string, PlayerState>,
    onPlayerHit: (sessionId: string, damage: number) => void,
    onHit?: (event: AIHitEvent) => void,
  ): void {
    for (const entry of this.entries) {
      if (entry.creature.isDead) continue;

      // Tick down anim timer and clear animState when done
      if (entry.animTimer > 0) {
        entry.animTimer -= dt;
        if (entry.animTimer <= 0) {
          entry.creature.animState = "";
        }
      }

      // Tick down damage timer — apply damage at punch peak
      if (entry.damageTimer > 0) {
        entry.damageTimer -= dt;
        if (entry.damageTimer <= 0 && entry.damageSessionId) {
          onPlayerHit(entry.damageSessionId, entry.damageAmount);
          if (onHit) {
            onHit({
              creatureId: entry.creatureId,
              sessionId: entry.damageSessionId,
              attackDamage: entry.damageAttack,
              targetDefense: entry.damageDefense,
              finalDamage: entry.damageAmount,
            });
          }
          entry.damageSessionId = null;
        }
      }

      // ── Leash check ──────────────────────────────────────────────────────
      if (entry.state !== AIState.LEASH) {
        const distSqToSpawn = this.distanceSq(entry.creature, {
          x: entry.spawnX,
          z: entry.spawnZ,
        });
        if (distSqToSpawn > entry.leashRange * entry.leashRange) {
          this.startLeash(entry);
          continue;
        }
      }

      // ── Leash state: walk back to spawn, ignore players ──────────────
      if (entry.state === AIState.LEASH) {
        this.updateLeash(entry, dt);
        continue;
      }

      // ── Threat management ────────────────────────────────────────────────
      this.updateThreatTable(entry, dt, players);

      // Find highest-threat alive player
      const target = this.getHighestThreatTarget(entry, players);

      // Sync aggro flag for clients (minimap visibility, etc.)
      entry.creature.isAggro = target !== null;

      if (!target) {
        // No threat — idle or roam
        if (entry.state === AIState.ROAM) {
          this.moveCreature(entry.creature, dt);
          if (!entry.creature.isMoving) {
            // Arrived at roam destination
            entry.state = AIState.IDLE;
            entry.roamTimer = randomRoamWait();
          } else {
            // Stuck detection: if creature hasn't moved enough, abort roam
            entry.roamStuckTimer += dt;
            if (entry.roamStuckTimer >= ROAM_STUCK_TIMEOUT) {
              const movedSq =
                (entry.creature.x - entry.roamLastX) ** 2 +
                (entry.creature.z - entry.roamLastZ) ** 2;
              if (movedSq < ROAM_STUCK_DIST_SQ) {
                // Stuck — abort and return to idle
                entry.creature.isMoving = false;
                entry.creature.path = [];
                entry.state = AIState.IDLE;
                entry.roamTimer = randomRoamWait();
              }
              // Reset check window
              entry.roamStuckTimer = 0;
              entry.roamLastX = entry.creature.x;
              entry.roamLastZ = entry.creature.z;
            }
          }
        } else {
          // IDLE — tick roam timer
          entry.creature.isMoving = false;
          entry.roamTimer -= dt;
          if (entry.roamTimer <= 0) {
            this.tryStartRoam(entry);
          }
        }
        continue;
      }

      const { sessionId: targetSessionId, player: targetPlayer } = target;
      const distSqToTarget = this.distanceSq(entry.creature, targetPlayer);
      const attackRangeSq = entry.creature.attackRange * entry.creature.attackRange;

      entry.repathTimer -= dt;
      entry.attackTimer -= dt;

      if (distSqToTarget <= attackRangeSq) {
        // ── Attack ─────────────────────────────────────────────────────
        entry.state = AIState.ATTACK;
        entry.creature.isMoving = false;
        entry.creature.path = [];

        // Face the player
        const angle = Math.atan2(
          targetPlayer.x - entry.creature.x,
          targetPlayer.z - entry.creature.z,
        );
        entry.creature.rotY = angle;

        if (entry.attackTimer <= 0) {
          entry.attackTimer = entry.creature.attackCooldown;
          entry.creature.animState = "punch";
          entry.animTimer = ATTACK_ANIM_DURATION;
          entry.damageTimer = DAMAGE_DELAY;
          entry.damageSessionId = targetSessionId;
          entry.damageAmount = computeDamage(entry.creature.attackDamage, targetPlayer.defense);
          entry.damageAttack = entry.creature.attackDamage;
          entry.damageDefense = targetPlayer.defense;

          // Attacking generates threat too (keeps aggro sticky)
          this.addThreat(
            entry.creatureId,
            targetSessionId,
            entry.damageAmount * THREAT_PER_DAMAGE * 0.5,
          );
        }
      } else {
        // ── Chase ──────────────────────────────────────────────────────
        entry.state = AIState.CHASE;

        if (entry.repathTimer <= 0) {
          entry.repathTimer = CREATURE_REPATH_INTERVAL;
          const creaturePos: WorldPos = { x: entry.creature.x, z: entry.creature.z };
          const playerPos: WorldPos = {
            x: targetPlayer.x,
            z: targetPlayer.z,
          };
          const path = this.pathfinder.findPath(creaturePos, playerPos);
          if (path.length > 0) {
            entry.creature.path = path;
            entry.creature.currentPathIndex = 0;
            entry.creature.isMoving = true;
          }
        }

        this.moveCreature(entry.creature, dt);
      }
    }
  }

  // ── Threat helpers ──────────────────────────────────────────────────────────

  /**
   * Update threat values each tick:
   * - Players in detection range get passive threat (proximity aggro)
   * - Players outside detection range have their threat decayed
   * - Dead players are purged
   */
  private updateThreatTable(
    entry: CreatureAI,
    dt: number,
    players: Map<string, PlayerState>,
  ): void {
    // Passive proximity threat for players in range
    for (const [sessionId, player] of players) {
      if (player.lifeState !== LifeState.ALIVE) {
        entry.threatTable.delete(sessionId);
        continue;
      }

      const distSq = this.distanceSq(entry.creature, player);
      const detectionRangeSq = entry.creature.detectionRange * entry.creature.detectionRange;

      if (
        distSq <= detectionRangeSq &&
        this.pathfinder.hasLineOfSight(
          { x: entry.creature.x, z: entry.creature.z },
          { x: player.x, z: player.z },
        )
      ) {
        const current = entry.threatTable.get(sessionId);
        if (current === undefined) {
          // First time in range — initial aggro burst
          entry.threatTable.set(sessionId, THREAT_PROXIMITY_INITIAL);
        } else {
          // Passive tick
          entry.threatTable.set(sessionId, current + THREAT_PROXIMITY_TICK * dt);
        }
      } else {
        // Out of detection range — decay threat
        const current = entry.threatTable.get(sessionId);
        if (current !== undefined) {
          const decayed = current - THREAT_DECAY_RATE * dt;
          if (decayed <= THREAT_EPSILON) {
            entry.threatTable.delete(sessionId);
          } else {
            entry.threatTable.set(sessionId, decayed);
          }
        }
      }
    }

    // Purge entries for disconnected players
    for (const sessionId of entry.threatTable.keys()) {
      if (!players.has(sessionId)) {
        entry.threatTable.delete(sessionId);
      }
    }
  }

  /** Find the alive player with the highest threat value. */
  private getHighestThreatTarget(
    entry: CreatureAI,
    players: Map<string, PlayerState>,
  ): { sessionId: string; player: PlayerState } | null {
    let bestSessionId: string | null = null;
    let bestPlayer: PlayerState | null = null;
    let bestThreat = 0;

    for (const [sessionId, threat] of entry.threatTable) {
      if (threat <= 0) continue;
      const player = players.get(sessionId);
      if (!player || player.lifeState !== LifeState.ALIVE) continue;
      if (threat > bestThreat) {
        bestThreat = threat;
        bestSessionId = sessionId;
        bestPlayer = player;
      }
    }

    if (!bestSessionId || !bestPlayer) return null;
    return { sessionId: bestSessionId, player: bestPlayer };
  }

  // ── Leash ───────────────────────────────────────────────────────────────────

  private startLeash(entry: CreatureAI): void {
    entry.state = AIState.LEASH;
    entry.threatTable.clear();
    entry.creature.animState = "";
    entry.creature.isAggro = false;
    entry.damageTimer = 0;
    entry.damageSessionId = null;

    // Path back to spawn
    const creaturePos: WorldPos = { x: entry.creature.x, z: entry.creature.z };
    const spawnPos: WorldPos = { x: entry.spawnX, z: entry.spawnZ };
    const path = this.pathfinder.findPath(creaturePos, spawnPos);
    if (path.length > 0) {
      entry.creature.path = path;
      entry.creature.currentPathIndex = 0;
      entry.creature.isMoving = true;
    }

    // Heal to full on leash
    entry.creature.health = entry.creature.maxHealth;
  }

  private updateLeash(entry: CreatureAI, dt: number): void {
    this.moveCreature(entry.creature, dt);

    const distSqToSpawn = this.distanceSq(entry.creature, {
      x: entry.spawnX,
      z: entry.spawnZ,
    });

    // Arrived back at spawn — return to idle (0.5^2 = 0.25)
    if (distSqToSpawn < 0.25 || !entry.creature.isMoving) {
      entry.state = AIState.IDLE;
      entry.creature.isMoving = false;
      entry.creature.path = [];
      entry.repathTimer = 0;
      entry.attackTimer = 0;
      entry.roamTimer = randomRoamWait();
    }
  }

  // ── Roaming ─────────────────────────────────────────────────────────────────

  /** Try to pick a random walkable point near spawn and start roaming toward it. */
  private tryStartRoam(entry: CreatureAI): void {
    for (let attempt = 0; attempt < ROAM_MAX_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = (1 + Math.random() * (ROAM_RADIUS - 1)) * TILE_SIZE;
      const targetX = entry.spawnX + Math.cos(angle) * dist;
      const targetZ = entry.spawnZ + Math.sin(angle) * dist;

      const from: WorldPos = { x: entry.creature.x, z: entry.creature.z };
      const to: WorldPos = { x: targetX, z: targetZ };
      const path = this.pathfinder.findPath(from, to);

      if (path.length > 0) {
        entry.creature.path = path;
        entry.creature.currentPathIndex = 0;
        entry.creature.isMoving = true;
        entry.state = AIState.ROAM;
        entry.roamStuckTimer = 0;
        entry.roamLastX = entry.creature.x;
        entry.roamLastZ = entry.creature.z;
        return;
      }
    }

    // All attempts failed — retry later
    entry.roamTimer = randomRoamWait();
  }

  // ── Movement ────────────────────────────────────────────────────────────────

  private moveCreature(creature: CreatureState, dt: number): void {
    if (!creature.isMoving || creature.currentPathIndex >= creature.path.length) {
      creature.isMoving = false;
      return;
    }

    const target = creature.path[creature.currentPathIndex];
    const dx = target.x - creature.x;
    const dz = target.z - creature.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.15) {
      creature.currentPathIndex++;
      if (creature.currentPathIndex >= creature.path.length) {
        creature.isMoving = false;
      }
      return;
    }

    const ndx = dx / dist;
    const ndz = dz / dist;
    const step = Math.min(creature.speed * dt, dist);

    creature.x += ndx * step;
    creature.z += ndz * step;

    creature.rotY = Math.atan2(ndx, ndz);
  }

  /** Squared distance — use for range comparisons to avoid sqrt */
  private distanceSq(a: { x: number; z: number }, b: { x: number; z: number }): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
  }
}
