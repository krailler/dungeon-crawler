# Dungeon Crawler - Project Guide

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
```

## Project Structure (monorepo with npm workspaces)

```
packages/
  shared/           # Code shared between client and server
    src/
      constants/      # Game balance constants (economy, items, death, stamina, camera, lighting, etc.)
      TileMap.ts      # 2D grid data + TileType + serialization
      protocol.ts     # MessageType + CloseCode + all message interfaces
      Stats.ts        # BaseStats, DerivedStats, computeDerivedStats(), computeDamage()
      CreatureTypes.ts # Creature type definitions + computeCreatureDerivedStats() + scaleCreatureDerivedStats()
      Economy.ts      # computeGoldDrop() — gold distribution formula
      Leveling.ts     # xpToNextLevel(), computeXpDrop() — XP formulas
      Items.ts        # ItemDef type, InventorySlot type
      Skills.ts       # SkillDef type, SKILL_DEFS (basic_attack, heavy_strike)
      Roles.ts        # Role type (admin, user)
      GateTypes.ts    # GateType (lobby)
      Tutorial.ts     # TutorialStep type
      RoomNames.ts    # generateRoomName() — procedural dungeon names
      FloorVariants.ts, WallVariants.ts, TileSets.ts, random.ts
      index.ts        # Barrel export
  server/           # Authoritative game server (Colyseus)
    src/
      state/          # Schema state classes (PlayerState, PlayerSecretState, CreatureState, DungeonState, GateState, LootBagState, InventorySlotState)
      rooms/          # DungeonRoom + PlayerSessionManager (lifecycle, persistence)
      systems/        # AISystem, CombatSystem, GameLoop, GateSystem
      chat/           # ChatSystem, CommandRegistry, commands, notifyLevelProgress
      items/          # ItemRegistry (DB-loaded item defs), EffectHandlers (heal, etc.)
      creatures/      # CreatureTypeRegistry (DB-loaded creature types + loot tables)
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
      camera/         # IsometricCamera
      entities/       # ClientPlayer, ClientCreature, ClientLootBag, SelectionRing, CharacterAssetLoader, AnimationController
      dungeon/        # DungeonRenderer, FloorAssetLoader, WallAssetLoader
      systems/        # WallOcclusionSystem, WallFadePlugin, FogOfWarSystem
      audio/          # SoundManager (ambient + spatial audio), uiSfx
      i18n/           # i18next config + locales (en.json)
      ui/
        stores/       # Pub-sub stores (auth, hud, chat, debug, admin, loading, minimap, gate, prompt, announcement, itemDef, creature, target, death, lootBag, settings, tutorial, feedback)
        hud/          # HUD components (HudRoot, CharacterPanel, ChatPanel, DebugPanel, MinimapOverlay, SkillBar, ConsumableSlots, InventoryPanel, XpBar, StaminaBar, TargetFrame, DeathOverlay, LootBagPanel, ActionFeedback, TutorialHint, SettingsPanel, PauseMenu, GatePrompt, PromptOverlay, AnnouncementOverlay)
        components/   # Reusable UI (HudButton, HudPill, ActionSlot, HudPanel, MenuButton, ConfirmDialog, healthColor, lifeState)
        hooks/        # useDraggable
        icons/        # SVG icon components (CharacterIcon, MapIcon, PotionIcon, BackpackIcon, SwordIcon, FistIcon, etc.)
        screens/      # LoginScreen, LoadingScreen
      main.ts         # Client entry point
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
- Server-only fields: normal `path: WorldPos[] = [];` — no `@type()` decorator
- Client callbacks: `$(room.state).listen(prop, cb)`, `$(room.state).players.onAdd(cb)`, `$(player).onChange(cb)`

### UI Store pattern

- Pub-sub stores using `useSyncExternalStore` — no React context
- Each store: `subscribe()`, `getSnapshot()`, mutation methods
- Stores emit on state change; React re-renders only subscribed components

### Database migrations

- Manual SQL migrations in `packages/server/src/migrations/`
- Journal + snapshot metadata in `migrations/meta/`
- Auto-applied on server start via Drizzle `migrate()`

## Key Game Systems

### Economy (gold + XP + levels)

- Dungeon level = average party level at generation time; creature levels = `[dungeonLevel-1, dungeonLevel+2]`
- Creature stats scale with level: `scale = 1 + (level-1) * 0.20` on HP/attack/defense
- Creature count per room scales: `minCreatures = 1 + floor(dungeonLevel / 10)`
- Gold per kill: `(5 + creatureLevel*3) * levelModifier / alivePartyCount` (min 1)
- XP per kill: `(20 + creatureLevel*6) * levelModifier` — NOT split among party (incentivizes grouping)
- XP curve: `xpToNextLevel(level) = floor(50 × level²)` — exponential, MAX_LEVEL = 30
- Level-up: +1 str/vit/agi, full heal, carry-over excess XP, chat announcement
- Gold + XP + level + stats persisted to DB on leave + auto-save every 60s (skip if unchanged)
- Shared: `Economy.ts`, `Leveling.ts`, `constants/economy.ts`, `CreatureTypes.ts`
- Server: `DungeonRoom.ts` (distribution + persistence), `PlayerState` (gold, xp, xpToNext, level, addXp, setLevel)
- Client: gold pill with floating "+amount" animation, XP bar (bottom center, WoW-style) with floating "+XP" text, level-up particle effect (golden aura)

### Combat

- Server-authoritative: AISystem (creature AI + threat), CombatSystem (player auto-attack)
- Damage: `max(1, attackDamage - defense)`
- Stats derived from base stats (strength/vitality/agility) via shared formulas

### Reconnection

- Token in localStorage, 120s reconnect window, session migration for re-login without token

### Chat

- Server-side ChatSystem with rate limiting, command parsing, broadcasting
- Slash commands: /help, /players, /kill, /heal, /revive, /tp, /leader, /setlevel, /kick, /give, /reset-tutorials (admin)
- Client: Enter to open, Escape to close, Tab autocomplete for commands + player names
- Chat input history: arrow up/down to navigate sent messages (max 50, draft preserved)
- Messages fade after 10s, hover to reveal all

### Death & Revive

- Life states: ALIVE → DOWNED (bleedout 30s) → DEAD (respawn timer)
- Revive: other players can channel (R key, 3.5s) within range 3.0 to revive downed allies at 30% HP
- Respawn: base 5s + 5s per death (max 30s), full heal at spawn point
- Client: DeathOverlay with timers, downed/dead audio loops, tutorial hints
- Server: GameLoop ticks life state transitions, CombatSystem stops targeting dead players

### Loot System

- Creatures drop loot bags on death (per-creature loot tables from DB)
- Loot bags: golden sphere with bobbing animation, clickable to open grid panel
- Each alive player rolls drops independently; notifications sent to other players
- Server: LootBagState (MapSchema), CreatureTypeRegistry loads loot tables
- Client: ClientLootBag entity, lootBagStore, LootBagPanel

### Stamina & Sprint

- Shift to sprint: 1.5x speed, drains 20/s (5s full drain), regens 10/s after 1s delay
- StaminaBar appears above XP bar when not full
- Server-authoritative: GameLoop ticks drain/regen, validates sprint state

### Skills

- 2 skills: basic_attack (passive auto-attack), heavy_strike (active, 5s cooldown, 2.5x damage)
- SkillBar with 1-5 hotkeys, cooldown overlay via ActionSlot component
- Server: CombatSystem applies skill cooldowns and damage multipliers

### Spatial Audio

- Remote player/creature footsteps and attacks play from their world position
- Babylon.js spatial audio with linear rolloff (max 20 units, ref 2 units)
- Audio listener follows camera target (local player on ground plane)
- Pooled Sound instances (8 footsteps, 4 per attack anim) with round-robin cycling

### Tutorial System

- LIFO hint stack — multiple hints queue up and display sequentially
- Steps: start_dungeon, allocate_stats, sprint, you_downed, teammate_downed
- Server sends hints contextually; client dismisses on action
- Admin: /reset-tutorials command re-sends applicable hints

## Vite Configuration

- `recast-detour` excluded from optimizeDeps (WASM)
- `.wasm` included in assetsInclude
- React/react-dom aliased to `packages/client/node_modules/` to prevent duplicate instances in monorepo
