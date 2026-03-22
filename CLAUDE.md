# KrawlHero - Project Guide

> For detailed architecture, design decisions, and full file inventory, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Git

- Always use `--no-gpg-sign` when committing (GPG agent not available)

## Tech Stack

- **3D Engine**: Babylon.js 8.x (client)
- **Multiplayer**: Colyseus 0.17.x (server) + @colyseus/sdk 0.17.x (client)
- **Language**: TypeScript 5.9 (strict mode)
- **Bundler**: Vite 8.x (client)
- **Server runtime**: Bun (native TypeScript, watch mode)
- **Database**: PostgreSQL + Drizzle ORM (server)
- **Pathfinding**: Grid-based A\* on TileMap (server-side)
- **UI**: React + Tailwind CSS overlay for HUD, Babylon.js GUI only for in-world UI (floating bars)
- **i18n**: i18next + react-i18next + browser language detector

## Commands

```bash
npm run dev          # Client dev server with HMR (Vite)
npm run build        # Client production build
npm run server       # Start game server
npm run server:dev   # Start game server with watch (auto-restart)
./scripts/reset-db.sh  # Drop DB + re-run migrations + seed
npm test             # Run all tests (bun test)
npm run test:coverage # Run tests with coverage report
npm run test:shared  # Run shared package tests only
npm run test:server  # Run server package tests only
```

## Pre-commit Checklist

Before committing ANY code change, you MUST:

1. **Run tests**: `NODE_ENV=test bun test --recursive` — all tests must pass
2. **Type-check server**: `npx tsc --noEmit -p packages/server/tsconfig.json` — no new errors
3. **Type-check client**: `npx tsc --noEmit -p packages/client/tsconfig.json` — no new errors (ignore pre-existing express/LobbyInventoryTab errors)
4. **If you modified game logic**: add or update tests covering the change
5. **If you added a new system/module**: add a test file in the corresponding `tests/` directory

## Project Structure (monorepo with npm workspaces)

```
scripts/
  reset-db.sh         # Drop schemas, run migrations + seed
packages/
  shared/           # Code shared between client and server
    src/
      constants/      # Game balance constants (economy, items, death, stamina, camera, lighting, talents, matchmaking)
      TileMap.ts      # 2D grid data + TileType + serialization
      protocol.ts     # MessageType + CloseCode + all message interfaces
      Stats.ts        # BaseStats, DerivedStats, computeDerivedStats(), computeDamage()
      CreatureTypes.ts # Creature type definitions + computeCreatureDerivedStats() + scaleCreatureDerivedStats()
      Economy.ts      # computeGoldDrop(), computeLevelModifier() — gold distribution formula
      Leveling.ts     # xpToNextLevel(), computeXpDrop() — XP formulas
      Items.ts        # ItemDef, ItemRarity, ItemEffectType, ItemInstance, BonusPoolEntry, StatRange types
      Skills.ts       # SkillDef type (hpThreshold, resetOnKill, effectId, aoeRange)
      Effects.ts      # EffectDef, StatModifier, StackBehavior, StatModType, CreatureEffectTrigger
      Classes.ts      # ClassDef, ClassDefClient types
      Talents.ts      # TalentDef type
      Roles.ts        # Role type (admin, user)
      GateTypes.ts    # GateType (lobby)
      Tutorial.ts     # TutorialStep type
      math.ts         # angleBetween(), isFromBehind(), distSq() — shared math utilities
      RoomNames.ts    # generateRoomName() — procedural dungeon names
      FloorVariants.ts, WallVariants.ts, TileSets.ts, random.ts
      index.ts        # Barrel export
  server/           # Authoritative game server (Colyseus)
    src/
      state/          # Schema state classes (PlayerState, PlayerSecretState, CreatureState, DungeonState, GateState, LootBagState, InventorySlotState, ActiveEffectState, EquipmentSlotState)
      rooms/          # DungeonRoom + PlayerSessionManager (lifecycle, persistence)
      systems/        # AISystem, CombatSystem, EffectSystem, GameLoop, GateSystem
      chat/           # ChatSystem, CommandRegistry, commands, notifyLevelProgress
      items/          # ItemRegistry (DB-loaded item defs), EffectHandlers (heal, apply_effect), ItemInstanceRegistry (unique item instances), LootRoller (Diablo-style stat rolling)
      effects/        # EffectRegistry (DB-loaded effect defs)
      creatures/      # CreatureTypeRegistry (DB-loaded creature types + loot tables + effect triggers + skills)
      classes/        # ClassRegistry (DB-loaded class defs + default skills)
      talents/        # TalentRegistry (DB-loaded talent defs + effects)
      skills/         # SkillRegistry (DB-loaded skill defs)
      dungeon/        # DungeonGenerator (procedural, no Babylon deps)
      navigation/     # Pathfinder (A* on TileMap)
      sessions/       # activeSessionRegistry (duplicate login detection)
      tutorials/      # resetTutorials (admin command helper)
      auth/           # authConfig (JWT authentication)
      db/             # Drizzle ORM schema + migrations (PostgreSQL, characters/world schemas)
      logger.ts       # Pino-based structured logging
      main.ts         # Server entry point
  client/           # Babylon.js renderer + Colyseus client
    src/
      core/           # ClientGame, StateSync, InputManager, ClientUpdateLoop
      camera/         # IsometricCamera (locked + free camera with WASD)
      entities/       # ClientPlayer, ClientCreature, ClientLootBag, SelectionRing, CharacterAssetLoader, AnimationController, CharacterLoaderRegistry, PropRegistry
      dungeon/        # DungeonRenderer, FloorAssetLoader, WallAssetLoader
      systems/        # WallOcclusionSystem, WallFadePlugin, FogOfWarSystem
      audio/          # SoundManager (ambient + spatial audio), uiSfx
      i18n/           # i18next config + locales (en.json, es.json)
      ui/
        stores/       # Pub-sub stores (auth, hud, chat, debug, admin, loading, minimap, gate, prompt, announcement, itemDef, effectDef, skillDef, classDefStore, talentDefStore, talentStore, creature, target, death, lootBag, settings, tutorial, feedback, levelUp, welcome, itemInstance, assetPreload, matchmaking, lobby)
        hud/          # HUD components (HudRoot, CharacterPanel, CharacterSheet, EquipmentTab, ChatPanel, DebugPanel, MinimapOverlay, SkillBar, ConsumableBar, InventoryPanel, XpBar, StaminaBar, TargetFrame, DeathOverlay, LootBagPanel, ActionFeedback, TutorialHint, SettingsPanel, PauseMenu, GatePrompt, PromptOverlay, AnnouncementOverlay, BuffBar, TalentPanel, LowHealthVignette, LevelUpOverlay, WelcomeOverlay)
        components/   # Reusable UI (HudButton, HudPill, ActionSlot, ItemActionSlot, EquipmentTooltip, EffectIcon, ItemIcon, HudPanel, MenuButton, ConfirmDialog, GoldPanel, GoldButton)
        utils/        # UI utilities (healthColor, lifeState, rarityColors, itemLinkUtils, dragGhost, statLabels)
        hooks/        # useDraggable
        icons/        # SVG icon components (CharacterIcon, MapIcon, BackpackIcon, WeaknessIcon, HamstringIcon, WarCryIcon, DazedIcon, LockIcon, etc.)
        screens/      # LoginScreen, LoadingScreen, LobbyScreen
      main.ts         # Client entry point
    public/
      models/
        characters/   # warrior/, zombie/, golem/ (multi-file GLBs per animation)
        props/        # chest.glb, portal.glb
      textures/
        icons/        # PNG item/skill/talent icons (potion_red, potion_regen, key, sword, fist, shield, etc.)
        logo.png      # KrawlHero logo
        login-bg.png  # Login screen background
      audio/          # SFX, ambient, UI sounds
```

## Code Conventions

- TypeScript strict mode
- ES modules, specific Babylon.js imports for tree-shaking:
  ```typescript
  // YES: specific import
  import { Engine } from "@babylonjs/core/Engines/engine";
  // NO: barrel import
  import { Engine } from "@babylonjs/core";
  ```
- Classes in PascalCase, files in PascalCase.ts
- Constants in UPPER_SNAKE_CASE in shared constants/
- One file per class/component
- No `enum` keyword — use `as const` objects + type union (tsconfig `erasableSyntaxOnly`)
- No constructor parameter properties (`private x: T`) — declare fields explicitly

### Colyseus Schema conventions

- Use `@type()` decorators for synced fields (server tsconfig has `experimentalDecorators: true`)
- Synced fields: `@type("float32") x: number = 0;` — with default values
- Private synced fields: `@view()` on `PlayerSecretState` — visible only to owning client (stats, gold, xp, inventory, speed, attackCooldown)
- Server-only fields: normal `path: WorldPos[] = [];` — no `@type()` decorator (godMode, pacifist, talentAllocations, etc.)
- Client callbacks: `$(room.state).listen(prop, cb)`, `$(room.state).players.onAdd(cb)`, `$(player).onChange(cb)`

### UI Store pattern

- Pub-sub stores using `useSyncExternalStore` — no React context
- Each store: `subscribe()`, `getSnapshot()`, mutation methods
- Stores emit on state change; React re-renders only subscribed components

### Database

- Manual SQL migrations in `packages/server/src/migrations/`
- Journal + snapshot metadata in `migrations/meta/`
- Auto-applied on server start via Drizzle `migrate()`
- Two schemas: `characters` (player data, item_instances, character_equipment) and `world` (game data: items, creatures, skills, effects, classes, talents)
- Reset: `./scripts/reset-db.sh` drops all + re-runs migrations + seed
- Registry load order: items → skills → effects → creatures → classes → talents (dependency order)

### Asset Pipeline

- **Characters**: Meshy AI → multi-file GLBs (idle.glb as base + run/walk/punch/death/heavy_punch.glb)
- **Props**: Meshy AI → single GLB (chest.glb, portal.glb)
- **Icons**: craftpix.net PNG → `/public/textures/icons/{iconId}.png`
- **Model registry**: `CharacterLoaderRegistry` maps skin names to model configs
- **Prop registry**: `PropRegistry` maps prop names to GLB paths, preloaded at startup

## Key Game Systems

### Economy (gold + XP + levels)

- Dungeon level = average party level at generation time; creature levels = `[dungeonLevel-1, dungeonLevel+2]`
- Creature stats scale with level: `scale = 1 + (level-1) * 0.20` on HP/attack/defense
- Creature count per room scales: `minCreatures = 1 + floor(dungeonLevel / 10)`
- Gold per kill: `(5 + creatureLevel*3) * levelModifier / alivePartyCount` (min 1)
- XP per kill: `(20 + creatureLevel*6) * levelModifier` — NOT split among party (incentivizes grouping)
- XP curve: `xpToNextLevel(level) = floor(50 × level²)` — exponential, MAX_LEVEL = 30
- Level-up: +1 str/vit/agi, full heal, carry-over excess XP, chat announcement, golden overlay with sound
- Gold + XP + level + stats persisted to DB on leave + auto-save every 60s (skip if unchanged)

### Combat

- Server-authoritative: AISystem (creature AI + threat), CombatSystem (player auto-attack)
- Auto-attack requires: active target + facing within 120° arc + target in range
- Auto-target: when hit with no target, automatically select the attacker (skipped if player has a player target, e.g. reviving)
- Tab-targeting: cycles through nearby creatures and players sorted by distance
- Chase mode: clicking a creature makes server re-path toward it every 4 ticks until in range
- Creature skills from DB: `world.creature_skills` with `is_default` flag → animState + damageMultiplier
- Player auto-attack uses class default skill from DB: `world.class_skills` with `is_default` flag
- Damage: `max(1, attackDamage - defense) * damageMultiplier`
- Facing check: player must face target to auto-attack (120° arc), "Not facing" feedback if blocked
- Back-hit detection: `isFromBehind()` shared utility for directional effects (>100° from facing)
- Right-click creature: select target + enable auto-attack (no movement)
- Creature walk/run: ROAM/LEASH = walk (40% speed), CHASE = run. Auto-walk if speed ≤ 2.5

### Boss System

- `is_boss` flag on creature types in DB — bosses spawn alone in dedicated rooms
- Boss room placed in last 30% of dungeon rooms (far from spawn)
- Current boss: Stone Golem (golem_slam skill, 1.5x damage, 100HP, scale 1.5x)
- Boss drops: Dungeon Key (transient, legendary), Health Potion (2-3), Regeneration Potion (1-2, uncommon)

### Dungeon Key & Exit

- Dungeon Key: `transient=true` item, not persisted to DB, cleared on dungeon restart
- Exit portal requires key to activate (checked before combat validation)
- Key consumed on portal use → countdown for all players
- Items with `transient=true` filtered from inventory save in `PlayerSessionManager`
- Transient items dropped as loot bag when player leaves/kicked/expires (notified in chat)

### Item Rarity

- Rarity field on items: common, uncommon, rare, epic, legendary
- UI: colored borders on ActionSlot (green/blue/purple/gold), centralized in `rarityColors.ts`
- Health potion = common, Regeneration Potion = uncommon, Dungeon Key = legendary

### Reconnection

- Token in localStorage, 300s reconnect window, session migration for re-login without token

### Chat

- Server-side ChatSystem with rate limiting, command parsing, broadcasting
- Slash commands: /help, /players, /kill, /heal, /revive, /tp, /tpxy, /leader, /setlevel, /kick, /give, /gold, /reset-tutorials, /resettalents, /resetstats, /spawn, /god (admin)
- Client: Enter to open, Escape to close, Tab autocomplete for commands + player names
- Chat input history: arrow up/down to navigate sent messages (max 50, draft preserved)
- Item links: `[item:id]` or `[item:id:instanceId]` syntax in messages, rendered as colored clickable spans with rarity styling and tooltips (shows rolled stats if instanceId present)
- Shift+click (left or right) on any ItemActionSlot to insert item link in chat
- Messages fade after 10s, hover to reveal all

### Death & Revive

- Life states: ALIVE → DOWNED (bleedout 30s) → DEAD (respawn timer)
- Revive: other players can channel (R key, 3.5s) within range 3.0 to revive downed allies at 30% HP; cancelled if reviver takes damage
- Respawn: base 5s + 5s per death (max 30s), full heal at spawn point
- Creature death: freeze animation on last frame, corpse visible 5s, hitbox disabled
- Client: DeathOverlay with timers, downed/dead audio loops, tutorial hints
- Server: GameLoop ticks life state transitions, CombatSystem stops targeting dead players

### Loot System

- Creatures drop loot bags on death (per-creature loot tables from DB)
- Loot bags: 3D treasure chest model with ground glow disc (emissive, no PointLight)
- Each alive player rolls drops independently; notifications sent to other players
- Server: LootBagState (MapSchema), CreatureTypeRegistry loads loot tables
- Client: ClientLootBag entity, lootBagStore, LootBagPanel

### Equipment System

- Diablo-inspired: each equipment drop is a unique instance with randomly rolled stats
- 6 equipment slots: weapon, head, chest, boots, accessory_1, accessory_2
- Item templates in `world.items`: `equipSlot`, `levelReq`, `statRanges` (guaranteed), `bonusPool` (weighted random)
- Item instances in `characters.item_instances`: `rolledStats` (JSONB), `itemLevel`
- Stat rolling: `ilvlFactor` scales effective range (50% at lvl 1, 100% at max); `random()^0.8` biases toward higher values
- Bonus affixes by rarity: common=0, uncommon=1, rare=1-2, epic=2-3, legendary=2-3
- Base stats (str/vit/agi) from equipment applied BEFORE class scaling in `recomputeStats()`; derived stats (HP/ATK/DEF/speed/cooldown) applied as flat mods
- No class restrictions — any class can equip any item
- Equip: right-click in inventory; Unequip: click in equipment tab; Swap: auto-swaps if slot occupied
- Shift-held comparison: shows stat diffs with color coding (green=better, red=worse) vs equipped item
- Server: ItemInstanceRegistry (in-memory cache + DB), LootRoller (stat rolling), EquipmentSlotState
- Client: itemInstanceStore (lazy-load via INSTANCE_DEFS_REQUEST), EquipmentTab, EquipmentTooltip, ItemActionSlot
- Persistence: `character_equipment` table, loaded on join before recomputeStats(), saved on disconnect/auto-save
- See [docs/equipment-system-design.md](./docs/equipment-system-design.md) for full spec

### Stamina & Sprint

- Shift to sprint: 1.5x speed, drains 20/s (5s full drain), regens 10/s after 1s delay
- StaminaBar appears above XP bar when not full
- Server-authoritative: GameLoop ticks drain/regen, validates sprint state

### Skills

- Skills defined in DB (`world.skills`): id, name, icon, passive, cooldown, damageMultiplier, animState, animDuration, hpThreshold, resetOnKill, effectId, aoeRange
- Class skills in DB (`world.class_skills`): maps classes to skills with `is_default` flag and `unlock_level` (level-gated unlock)
- Creature skills in DB (`world.creature_skills`): maps creatures to skills with `is_default` flag
- Three skill paths in CombatSystem: buff (effectId + no damage → self-buff), AoE (aoeRange > 0 → area damage), single-target (default → needs enemy target)
- Conditional mechanics: `hpThreshold` (target must be below X% HP), `resetOnKill` (cooldown resets if target dies)
- Level-gated unlock: `ClassRegistry.syncAndNotifySkills()` grants skills at the correct level, sends i18n chat notification
- Current warrior skills: basic_attack (passive), heavy_strike (5s CD, 2.5x), execute (10s CD, 4x, <30% HP, resetOnKill), war_cry (25s CD, self-buff), ground_slam (12s CD, 1.5x, AoE 4.0, applies dazed)
- Current creature skills: golem_slam (passive, 1.5x dmg)
- SkillBar with 1-5 hotkeys, cooldown overlay via ActionSlot component
- Icons: PNG images via ItemIcon component

### Classes & Talents

- Classes in DB (`world.classes`): stat scaling formulas, skill assignments
- Talents in DB (`world.talents` + `world.talent_effects`): tree with rows, dependencies, max ranks
- Talent points: 1 per level starting at TALENT_UNLOCK_LEVEL (5)
- Talent effects: stat_mod (flat/percent), unlock_skill, modify_skill
- Talent reset: `/resettalents` command, gold cost per level
- Client: TalentPanel with tree layout, connector lines, rank display

### Spatial Audio

- Remote player/creature footsteps and attacks play from their world position
- Babylon.js spatial audio with linear rolloff (max 20 units, ref 2 units)
- Audio listener follows camera target (local player on ground plane)
- Pooled Sound instances (8 footsteps, 4 per attack anim) with round-robin cycling

### Effects (Buffs & Debuffs)

- Data-driven: effect definitions in DB (`world.effects`), loaded by EffectRegistry at startup
- Creature effect triggers in DB (`world.creature_effects`): on_hit, on_hit_behind with level-scaled chance
- **Player effects**: EffectSystem ticks timers, processes tick effects (HoT/DoT), recomputes derived stats with modifiers, cleared on death/respawn/revive
- **Tick effects**: `tickEffect` field on EffectDef (type, value, interval) — EffectSystem accumulates dt per effect and applies heal/damage per interval (e.g. Regeneration: 8 HP every 2s)
- **Item-triggered effects**: `ItemEffectType.APPLY_EFFECT` handler applies a buff via EffectSystem (e.g. Regen Potion → Regeneration buff)
- **Creature effects**: GameLoop.tickCreatureEffects() ticks timers, recomputeCreatureSpeed() applies speed modifiers; GameLoop.applyCreatureEffect() creates/refreshes effects (simplified, no stacking/scaling)
- CreatureState has `MapSchema<ActiveEffectState>` for synced creature debuffs (visible in TargetFrame)
- Current effects: Weakness (zombie on_hit, -25% attack, 5s), Hamstring (zombie on_hit_behind, -35% speed, 3s), War Cry buff (+25% attack, 10s), Dazed (ground_slam AoE, -40% speed, 3s), Regeneration (potion, 8 HP/2s, 10s, scales to 15 HP/2s over 12s)
- Client: effectDefStore (lazy-loaded, includes tickInterval for tooltip), BuffBar (player), EffectIcon with tooltip, TargetFrame shows effects for both players and creatures

### Graphics Settings

- Settings panel with toggles: shadows, shadow quality (Low/Medium/High), particles, glow, AA (reload), FXAA, sharpen, HiDPI/Retina (reload), resolution scale, show performance
- Reload-required banner when AA or HiDPI changed
- All persisted to localStorage, applied at runtime (except AA/HiDPI = reload)

### Tutorial System

- LIFO hint stack — multiple hints queue up and display sequentially
- Steps: start_dungeon, allocate_stats, sprint, you_downed, teammate_downed, first_debuff, allocate_talents, dungeon_key, portal_no_key, welcome
- Server sends hints contextually; client dismisses on action
- Welcome overlay: dedicated modal for first-time players with tips (routed to welcomeStore instead of tutorialStore)
- Admin: /reset-tutorials command re-sends applicable hints

### Admin & Debug Tools

- `/god [pacifist]`: toggle invulnerability. With `pacifist`, attacks show damage numbers but don't reduce creature HP
- `/spawn <type> [level] [count]`: spawn creatures near the player (e.g. `/spawn zombie 10 3`)
- God mode (`godMode`) and pacifist (`pacifist`) are server-only fields on PlayerState, not synced to client
- Debug panel (F9): tick rate, creature count, admin info

### Derived Stats Architecture

- `EffectSystem.recomputeStats()` is the **single source of truth** for all derived stats (maxHealth, attackDamage, defense, speed, attackCooldown)
- Computes: (base stats + equipment base bonuses) × class scaling → equipment derived mods (flat) → talent mods (flat/percent) → effect mods (flat/percent)
- Integer stats (maxHealth, attackDamage, defense) are rounded; float stats (speed, attackCooldown) keep precision
- Callers responsible for health adjustment after recompute (full heal on level-up, proportional on stat allocate, clamp on reset)
- `PlayerState.levelUp()`, `allocateStat()`, `resetStats()` only mutate base data — callers must call `recomputeStats()`

### Visual Effects

- Level-up: golden overlay with animated text + number + radial glow burst + 3D particle aura
- Heal: green particles rising from character when health increases
- Low health: red vignette border below 30% HP (intensity scales with HP)
- Loot glow: emissive chest + ground glow disc (DynamicTexture, no light cost)
- Portal: unlit material + cyan particles + point light

## Vite Configuration

- `recast-detour` excluded from optimizeDeps (WASM)
- `.wasm` included in assetsInclude
- React/react-dom aliased to `packages/client/node_modules/` to prevent duplicate instances in monorepo
