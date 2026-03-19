# Warrior Class Design

## Fantasy & Identity

The Warrior is a melee frontliner who runs INTO danger, not away from it. The class fantasy is built on three pillars:

1. **Impact** — Big hits that feel crunchy. Heavy Strike, Ground Slam, Execute.
2. **Resilience** — Survives through toughness, not avoidance. High HP and defense.
3. **Leadership** — Buffs the party with War Cry. The warrior makes the group stronger.

The Warrior is a tank/DPS hybrid: not a pure damage dealer, not a pure tank, but a durable frontliner who can do both depending on talent choices.

---

## Base Stats & Scaling

Starting stats at level 1 (10/10/10 str/vit/agi):

| Stat            | Formula                      | Base Value |
| --------------- | ---------------------------- | ---------- |
| Max Health      | `50 + vit × 5`               | 100        |
| Attack Damage   | `5 + str × 0.5`              | 10         |
| Defense         | `0 + vit × 0.3`              | 3          |
| Move Speed      | `4.0 + agi × 0.1`            | 5.0        |
| Attack Cooldown | `max(0.3, 1.2 - agi × 0.02)` | 1.0s       |
| Attack Range    | fixed                        | 2.5        |

**Stat point allocation:** 2 points per level-up (distributed manually among str/vit/agi).

**Stat identity:** Warriors benefit from ALL three stats, but the primary stats are:

- **Strength** → damage (DPS builds)
- **Vitality** → health + defense (tank builds)
- **Agility** → attack speed + movement (balanced builds)

No stat is useless. This is intentional: the warrior should feel rewarding regardless of how you distribute points.

---

## Skills (5 total)

### Design philosophy

After investigating Diablo (4-6 active skills), Hades (5 action types), Last Epoch (5 specialization slots), and LoL/simpler games (4 skills + passive), **5 total skills (1 passive + 4 active) is the sweet spot** for this game:

- Fills the 5-slot skill bar perfectly
- Each skill has a distinct purpose (no overlap)
- Simple enough to learn in 30 minutes, deep enough with talent modifications
- More than a LoL-style "4 abilities", less than a WoW-style "20+ spells"

### Unlock progression

Skills unlock automatically by level. No choice involved — all warriors get the same 5 skills. The differentiation comes from talents, which MODIFY how these skills behave.

This approach (from Diablo 4 / WoW) gives clear progression milestones while keeping talent choices focused on build identity rather than skill access.

| Slot | Skill        | Level | Type                  |
| ---- | ------------ | ----- | --------------------- |
| 1    | Basic Attack | 1     | Passive (auto-attack) |
| 2    | Heavy Strike | 1     | Active                |
| 3    | War Cry      | 8     | Active                |
| 4    | Ground Slam  | 15    | Active                |
| 5    | Execute      | 22    | Active                |

### Skill details

#### 1. Basic Attack (passive)

> _Automatically attacks the nearest enemy in range._

- **Type:** Passive (toggle on/off)
- **Cooldown:** Uses attack cooldown stat (~1.0s base)
- **Damage:** 1.0× attack damage
- **Animation:** `punch`
- **Notes:** Always equipped in slot 1. The backbone of warrior DPS. Feels faster and smoother as agility increases.

#### 2. Heavy Strike (active)

> _A powerful melee strike that deals massive damage to a single target._

- **Type:** Active
- **Cooldown:** 5s
- **Damage:** 2.5× attack damage
- **Animation:** `heavy_punch`
- **Unlock:** Level 1 (starter skill)
- **Notes:** The warrior's bread-and-butter burst skill. Simple but satisfying. Talents can reduce cooldown, increase damage, or add effects.

#### 3. War Cry (active) — NEW

> _Let out a battle cry that empowers nearby allies, increasing their attack damage._

- **Type:** Active (buff)
- **Cooldown:** 20s
- **Duration:** 8s
- **Effect:** +20% attack damage to all party members within range 8.0
- **Animation:** `war_cry` (arms raised, shout particle + sound)
- **Unlock:** Level 8
- **Notes:** The warrior's party utility skill. Inspired by Diablo 2's Battle Orders and WoW's Battle Shout. Makes the warrior valuable in groups beyond just dealing damage. The buff applies to the warrior too. Talents can extend duration, add defense buff, or reduce cooldown.

#### 4. Ground Slam (active) — NEW

> _Slam the ground with tremendous force, damaging all enemies nearby and slowing them._

- **Type:** Active (AoE)
- **Cooldown:** 12s
- **Damage:** 1.8× attack damage (to all enemies in radius 3.0)
- **Effect:** Applies "Dazed" debuff — -30% move speed for 3s
- **Animation:** `ground_slam` (overhead slam, ground crack particle)
- **Unlock:** Level 15
- **Notes:** The warrior's AoE solution. Without this, melee characters struggle against groups. The slow gives tactical utility (kiting, peeling for allies). Inspired by Diablo's Ground Stomp and PoE's Ground Slam. Talents can increase AoE radius, damage, or add a stun.

#### 5. Execute (active) — NEW

> _A vicious finishing blow that can only be used against wounded targets. Cooldown resets on kill._

- **Type:** Active (execute)
- **Cooldown:** 10s
- **Damage:** 4.0× attack damage
- **Condition:** Target must be below 30% health
- **Special:** Cooldown resets if the target dies from this hit
- **Animation:** `execute` (lunging overhead strike, blood particle)
- **Unlock:** Level 22
- **Notes:** The "finish them" moment. Universally the most satisfying warrior mechanic across all researched games (WoW Execute, Diablo 4 Death Blow, LoL's Darius ult). The cooldown reset on kill creates exciting chain-execute moments in multi-creature fights. Talents can increase the HP threshold or add bonus damage.

---

## Talent Tree

### Design philosophy

After studying WoW Classic (7 tiers, 3 trees), Diablo 4 (6 tiers, linear), Last Epoch (per-skill trees), and Torchlight 2 (3 trees with rank tiers):

- **6 rows** unlocking at levels 5, 10, 15, 20, 25, 30
- **3 columns** representing three build directions
- **26 total talent points** (one per level from 5 to 30)
- **~38 total rankable slots** → can only fill ~68%, forcing meaningful choices
- Mix of stat modifiers, skill modifications, and build-defining keystones
- Each row should have a genuine choice, not just "pick all three"

### Three paths

| Column | Path          | Theme                     | Fantasy                   |
| ------ | ------------- | ------------------------- | ------------------------- |
| Left   | **Fortitude** | Defense, health, sustain  | "I am the wall"           |
| Center | **Arms**      | Damage, skill power       | "I hit like a truck"      |
| Right  | **Tactics**   | Speed, cooldowns, utility | "I am everywhere at once" |

Players can mix paths freely. You don't "commit" to one — but going deep in a path unlocks better nodes. Prerequisite requirements (parent node at rank 2) create natural funneling without hard-locking paths.

### Full talent tree

```
                    FORTITUDE              ARMS               TACTICS
                   (defense)            (damage)             (speed)
                 ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  Row 0 (Lv 5)  │  Toughness  │   │    Might    │   │  Swiftness  │
                 │  ⬡⬡⬡ (3r)  │   │  ⬡⬡⬡ (3r)  │   │   ⬡⬡ (2r)  │
                 └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                        │                 │                  │
                        │ req @2          │ req @2           │ req @2
                        ▼                 ▼                  ▼
                 ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  Row 1 (Lv 10) │ Thick Skin  │   │Brutal Strike│   │Agile Fighter│
                 │  ⬡⬡⬡ (3r)  │   │   ⬡⬡ (2r)  │   │   ⬡⬡ (2r)  │
                 └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                        │                 │                  │
                        │ req @2          │ req @1           │ req @1
                        ▼                 ▼                  ▼
                 ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  Row 2 (Lv 15) │ Resilience  │   │ Rending Blow│   │ Battle Tempo│
                 │   ⬡⬡ (2r)  │   │   ⬡⬡ (2r)  │   │   ⬡⬡ (2r)  │
                 └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                        │                 │                  │
                        │ req @1          │ req @1           │ req @1
                        ▼                 ▼                  ▼
                 ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  Row 3 (Lv 20) │ Unbreakable │   │ Executioner │   │  War Rhythm │
                 │   ⬡⬡ (2r)  │   │   ⬡⬡ (2r)  │   │   ⬡⬡ (2r)  │
                 └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                        │                 │                  │
                        │ req @1          │ req @1           │ req @1
                        ▼                 ▼                  ▼
                 ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  Row 4 (Lv 25) │  Fortify    │   │  Rampage    │   │ Quick Hands │
                 │   ⬡⬡ (2r)  │   │   ⬡⬡ (2r)  │   │   ⬡⬡ (2r)  │
                 └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
                        │                 │                  │
                        │ req @1          │ req @1           │ req @1
                        ▼                 ▼                  ▼
                 ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
  Row 5 (Lv 30) │ ★Last Stand │   │ ★Berserker  │   │★Battle Maste│
                 │   ⬡ (1r)   │   │   ⬡ (1r)   │   │   ⬡ (1r)   │
                 └─────────────┘   └─────────────┘   └─────────────┘
```

### Talent details

---

#### Row 0 — Foundation (Level 5)

**Toughness** (3 ranks) — Fortitude

> _Your body hardens through battle._

- Rank 1: +5% max health
- Rank 2: +10% max health
- Rank 3: +15% max health
- Effect type: `stat_mod` (maxHealth, percent)

**Might** (3 ranks) — Arms

> _Raw strength flows through your strikes._

- Rank 1: +2 attack damage
- Rank 2: +4 attack damage
- Rank 3: +6 attack damage
- Effect type: `stat_mod` (attackDamage, flat)

**Swiftness** (2 ranks) — Tactics

> _Light on your feet, fast on the draw._

- Rank 1: +3% move speed
- Rank 2: +6% move speed
- Effect type: `stat_mod` (moveSpeed, percent)

---

#### Row 1 — Specialization (Level 10, requires parent at rank 2)

**Thick Skin** (3 ranks) — Fortitude ← req: Toughness @2

> _Your skin becomes as tough as leather armor._

- Rank 1: +1 defense
- Rank 2: +2 defense
- Rank 3: +3 defense
- Effect type: `stat_mod` (defense, flat)

**Brutal Strikes** (2 ranks) — Arms ← req: Might @2

> _Your Heavy Strike becomes faster and more devastating._

- Rank 1: Heavy Strike cooldown ×0.85 (4.25s)
- Rank 2: Heavy Strike cooldown ×0.70 (3.5s), damage ×1.15
- Effect type: `modify_skill` (heavy_strike)

**Agile Fighter** (2 ranks) — Tactics ← req: Swiftness @2

> _You attack with increasing tempo._

- Rank 1: -5% attack cooldown
- Rank 2: -10% attack cooldown
- Effect type: `stat_mod` (attackCooldown, percent, negative = faster)

---

#### Row 2 — Identity (Level 15, requires parent at rank 1-2)

**Resilience** (2 ranks) — Fortitude ← req: Thick Skin @2

> _What doesn't kill you makes you stronger._

- Rank 1: +8% max health
- Rank 2: +16% max health
- Effect type: `stat_mod` (maxHealth, percent)

**Rending Blow** (2 ranks) — Arms ← req: Brutal Strikes @1

> _Your Ground Slam tears through groups of enemies._

- Rank 1: Ground Slam damage ×1.20
- Rank 2: Ground Slam damage ×1.40, cooldown ×0.85
- Effect type: `modify_skill` (ground_slam)

**Battle Tempo** (2 ranks) — Tactics ← req: Agile Fighter @1

> _War Cry invigorates you, shortening its downtime._

- Rank 1: War Cry cooldown ×0.85 (17s)
- Rank 2: War Cry cooldown ×0.70 (14s)
- Effect type: `modify_skill` (war_cry)

---

#### Row 3 — Power (Level 20, requires parent at rank 1)

**Unbreakable** (2 ranks) — Fortitude ← req: Resilience @1

> _Your determination to survive is absolute._

- Rank 1: +2 defense, +5% max health
- Rank 2: +4 defense, +10% max health
- Effect type: `stat_mod` (defense flat + maxHealth percent, two effects per rank)

**Executioner** (2 ranks) — Arms ← req: Rending Blow @1

> _You sense weakness and strike without mercy._

- Rank 1: Execute damage ×1.20
- Rank 2: Execute damage ×1.40, cooldown ×0.80
- Effect type: `modify_skill` (execute)

**War Rhythm** (2 ranks) — Tactics ← req: Battle Tempo @1

> _The cadence of battle quickens around you._

- Rank 1: -5% attack cooldown
- Rank 2: -10% attack cooldown, +3% move speed
- Effect type: `stat_mod` (attackCooldown percent + moveSpeed percent)

---

#### Row 4 — Mastery (Level 25, requires parent at rank 1)

**Fortify** (2 ranks) — Fortitude ← req: Unbreakable @1

> _You become an immovable object._

- Rank 1: +3 defense, +10% max health
- Rank 2: +5 defense, +15% max health
- Effect type: `stat_mod` (defense flat + maxHealth percent)

**Rampage** (2 ranks) — Arms ← req: Executioner @1

> _Every kill fuels your bloodlust._

- Rank 1: Heavy Strike damage ×1.20
- Rank 2: Heavy Strike damage ×1.35, Execute damage ×1.15
- Effect type: `modify_skill` (heavy_strike + execute)

**Quick Hands** (2 ranks) — Tactics ← req: War Rhythm @1

> _Your reflexes become supernaturally fast._

- Rank 1: -5% attack cooldown, Ground Slam cooldown ×0.85
- Rank 2: -10% attack cooldown, Ground Slam cooldown ×0.70
- Effect type: `stat_mod` (attackCooldown) + `modify_skill` (ground_slam)

---

#### Row 5 — Capstone (Level 30, requires parent at rank 1)

These are build-defining keystones. A player can only realistically reach 1, maybe 2 of these (requires 13+ points in a single path). Each one provides a powerful, identity-defining bonus.

**Last Stand** (1 rank) — Fortitude ← req: Fortify @1

> _When all seems lost, you refuse to fall._

- Effect: +25% max health, +5 defense
- Effect type: `stat_mod` (maxHealth percent + defense flat)
- **Total Fortitude path investment to reach:** 14 points minimum (Toughness 3 + Thick Skin 3 + Resilience 2 + Unbreakable 2 + Fortify 2 + Last Stand 1 = 13, with req gates needing some at rank 2)
- **Fantasy:** The unkillable wall. A warrior who has gone full Fortitude can have ~300+ HP at level 30 with good vitality investment.

**Berserker** (1 rank) — Arms ← req: Rampage @1

> _You abandon restraint and fight with reckless fury._

- Effect: +20% attack damage, -10% max health
- Effect type: `stat_mod` (attackDamage percent + maxHealth percent negative)
- **Fantasy:** Glass cannon warrior. More damage at the cost of survivability. The negative health tradeoff is the signature of this capstone — it's not free power, it's a commitment.

**Battle Master** (1 rank) — Tactics ← req: Quick Hands @1

> _You have mastered the art of war._

- Effect: -15% attack cooldown, +8% move speed
- Effect type: `stat_mod` (attackCooldown percent + moveSpeed percent)
- **Fantasy:** The fastest warrior. Attacks feel frantic, movement is fluid. Combined with agility stat investment, this warrior attacks every ~0.5s and moves at ~7+ speed.

---

### Point budget analysis

| Row       | Fortitude | Arms   | Tactics | Row Total |
| --------- | --------- | ------ | ------- | --------- |
| 0         | 3         | 3      | 2       | 8         |
| 1         | 3         | 2      | 2       | 7         |
| 2         | 2         | 2      | 2       | 6         |
| 3         | 2         | 2      | 2       | 6         |
| 4         | 2         | 2      | 2       | 6         |
| 5         | 1         | 1      | 1       | 3         |
| **Total** | **13**    | **12** | **11**  | **36**    |

- **Available points:** 26 (levels 5–30)
- **Total rankable:** 36
- **Can fill:** ~72% → must leave ~10 ranks empty
- **Can reach 1 capstone:** yes (13 points in Fortitude, 12 in Arms, 11 in Tactics)
- **Can reach 2 capstones:** barely possible if you sacrifice all depth in the third path (e.g., 13 + 12 = 25, leaving 1 point for Tactics row 0)
- **Can reach 3 capstones:** impossible (36 > 26)

This forces a meaningful choice: go deep in one path for the capstone, or spread across two paths for versatility.

---

## Example Builds

### "The Wall" (Fortitude focus)

> Max survivability, group tank.

**Talents (26 points):**

- Toughness 3, Thick Skin 3, Resilience 2, Unbreakable 2, Fortify 2, Last Stand 1 = 13 (Fortitude)
- Might 3, Brutal Strikes 2 = 5 (Arms)
- Swiftness 2, Agile Fighter 2, Battle Tempo 2, War Rhythm 1 = 7 (Tactics)
- Total: 25 + 1 spare

**Stats:** Prioritize vitality > strength > agility
**At level 30 (25 vit, 20 str, 13 agi):**

- HP: ~280 (base 175, +25% Last Stand, +15% Toughness, +16% Resilience, +10% Unbreakable, +15% Fortify)
- Defense: ~17 (base 7.5, +3 Thick Skin, +4 Unbreakable, +5 Fortify, +5 Last Stand)
- Attack: ~21 (base 15, +6 Might)

### "The Berserker" (Arms focus)

> Maximum damage, glass cannon.

**Talents (26 points):**

- Might 3, Brutal Strikes 2, Rending Blow 2, Executioner 2, Rampage 2, Berserker 1 = 12 (Arms)
- Toughness 3, Thick Skin 2 = 5 (Fortitude)
- Swiftness 2, Agile Fighter 2, Battle Tempo 2, War Rhythm 2, Quick Hands 1 = 9 (Tactics)
- Total: 26

**Stats:** Prioritize strength > agility > vitality
**At level 30 (25 str, 18 agi, 15 vit):**

- Attack: ~30 (base 17.5, +6 Might, +20% Berserker) → Heavy Strike hits for ~75 base before defense
- HP: ~115 (base 125, -10% Berserker, +15% Toughness) → risky but rewarding
- Attack CD: ~0.7s (very fast auto-attacks)

### "The Battle Master" (Tactics focus)

> Fast, mobile, cooldown-focused.

**Talents (26 points):**

- Swiftness 2, Agile Fighter 2, Battle Tempo 2, War Rhythm 2, Quick Hands 2, Battle Master 1 = 11 (Tactics)
- Might 3, Brutal Strikes 2, Rending Blow 1 = 6 (Arms)
- Toughness 3, Thick Skin 3, Resilience 2, Unbreakable 1 = 9 (Fortitude)
- Total: 26

**Stats:** Prioritize agility > vitality > strength
**At level 30 (15 str, 20 vit, 23 agi):**

- Attack CD: ~0.5s (near minimum)
- Move Speed: ~7.5 (base 6.3, +6% Swiftness, +8% Battle Master, +3% War Rhythm)
- Heavy Strike CD: ~3.5s (base 5, ×0.70 Brutal Strikes)
- Ground Slam CD: ~8.4s (base 12, ×0.70 Quick Hands)
- War Cry CD: ~14s (base 20, ×0.70 Battle Tempo)

---

## Progression Timeline

| Level | Event                                 | Notes                                                |
| ----- | ------------------------------------- | ---------------------------------------------------- |
| 1     | Start                                 | Basic Attack + Heavy Strike                          |
| 2–4   | Stat points only                      | Learn the basics, feel auto-attack rhythm            |
| 5     | First talent point                    | Row 0 opens: Toughness / Might / Swiftness           |
| 6–7   | +2 talent points                      | Fill out row 0 foundation                            |
| 8     | **War Cry unlocked**                  | First party utility skill, warrior "identity moment" |
| 9–10  | Row 1 opens                           | Thick Skin / Brutal Strikes / Agile Fighter          |
| 11–14 | Build identity forms                  | Deep investment in chosen path                       |
| 15    | **Ground Slam unlocked**, Row 2 opens | First AoE, big power spike                           |
| 16–19 | Path deepening                        | Resilience / Rending Blow / Battle Tempo             |
| 20    | Row 3 opens                           | Unbreakable / Executioner / War Rhythm               |
| 21    | Build crystallizes                    | Clear build direction visible                        |
| 22    | **Execute unlocked**                  | Final skill, finishing power                         |
| 23–24 | Late-game talents                     | Power refinement                                     |
| 25    | Row 4 opens                           | Fortify / Rampage / Quick Hands                      |
| 26–29 | Final investment                      | Approaching capstone                                 |
| 30    | **Capstone row**                      | Last Stand / Berserker / Battle Master               |

The skill unlocks (8, 15, 22) are spaced to avoid "dead zones" where nothing happens. Every ~7 levels, the warrior gets a new toy to play with.

---

## Implementation Notes

### What exists today

- basic_attack, heavy_strike: fully implemented
- 7 talents in rows 0–2: implemented in DB + code
- Class system, skill system, talent system: all functional

### What needs to be built

1. **New skills:** war_cry (buff mechanic), ground_slam (AoE mechanic), execute (conditional + CD reset)
2. **Buff skill type:** war_cry is the first skill that applies a BUFF rather than dealing damage — needs new skill behavior type
3. **AoE skill type:** ground_slam hits multiple targets — needs AoE damage logic in CombatSystem
4. **Conditional skill:** execute has an HP threshold check — needs validation in useSkill()
5. **CD reset mechanic:** execute resets on kill — needs hook in kill resolution
6. **Level-gated skill unlock:** skills auto-added to character at specific levels
7. **Expanded talent tree:** rows 3–5 with new talents (DB inserts only, no code changes needed for stat_mod/modify_skill types)
8. **New animations:** war_cry, ground_slam, execute (3 new character animations)
9. **New effects:** "Dazed" debuff (ground slam slow), War Cry attack buff
10. **New particles:** ground slam impact, war cry shout wave, execute blood

### What needs NO code changes

- Adding stat_mod talents (rows 3–5) → DB inserts only
- Adding modify_skill talents → DB inserts only
- Adjusting numbers (damage, cooldowns, durations) → DB updates only
- i18n translations → locale JSON updates only
