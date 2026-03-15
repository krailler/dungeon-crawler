# Dungeon Crawler - Project Guide

> For detailed architecture, design decisions, and full file inventory, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Git

- Always use `--no-gpg-sign` when committing (GPG agent not available)

## Tech Stack

- **3D Engine**: Babylon.js 8.x (client)
- **Multiplayer**: Colyseus 0.17.x (server) + @colyseus/sdk 0.17.x (client)
- **Language**: TypeScript 5.9 (strict mode)
- **Bundler**: Vite 8.x (client)
- **Server runtime**: tsx (esbuild, watch mode)
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
      constants/      # Game balance constants (economy.ts, etc.)
      Constants.ts    # Core constants (TILE_SIZE, PLAYER_*, ENEMY_*, etc.)
      TileMap.ts      # 2D grid data + TileType + serialization
      protocol.ts     # MessageType + CloseCode + all message interfaces
      Stats.ts        # BaseStats, DerivedStats, computeDerivedStats(), computeDamage()
      EnemyTypes.ts   # Enemy type definitions + computeEnemyDerivedStats() + scaleEnemyDerivedStats()
      Economy.ts      # computeGoldDrop() — gold distribution formula
      Leveling.ts     # xpToNextLevel(), computeXpDrop() — XP formulas
      FloorVariants.ts, WallVariants.ts, TileSets.ts, random.ts
      index.ts        # Barrel export
  server/           # Authoritative game server (Colyseus)
    src/
      state/          # Schema state classes (PlayerState, EnemyState, DungeonState, GateState)
      rooms/          # DungeonRoom (game loop, economy, message handlers)
      systems/        # AISystem, CombatSystem (server-side logic)
      chat/           # ChatSystem, CommandRegistry, commands
      dungeon/        # DungeonGenerator (procedural, no Babylon deps)
      navigation/     # Pathfinder (A* on TileMap)
      sessions/       # activeSessionRegistry (duplicate login detection)
      db/             # Drizzle ORM schema + migrations (PostgreSQL)
      main.ts         # Server entry point
  client/           # Babylon.js renderer + Colyseus client
    src/
      core/           # ClientGame, InputManager
      camera/         # IsometricCamera
      entities/       # ClientPlayer, ClientEnemy, CharacterAssetLoader
      dungeon/        # DungeonRenderer, FloorAssetLoader, WallAssetLoader
      systems/        # WallOcclusionSystem, FogOfWarSystem
      audio/          # SoundManager
      i18n/           # i18next config + locales (en.json)
      ui/
        stores/       # Pub-sub stores (auth, hud, chat, debug, admin, loading, minimap, gate, prompt, announcement)
        hud/          # HUD components (HudRoot, CharacterPanel, ChatPanel, DebugPanel, MinimapOverlay, PauseMenu, etc.)
        components/   # Reusable UI (HudButton, HudPill)
        icons/        # SVG icon components
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

- Dungeon level = average party level at generation time; enemy levels = `[dungeonLevel-1, dungeonLevel+2]`
- Enemy stats scale with level: `scale = 1 + (level-1) * 0.20` on HP/attack/defense
- Enemy count per room scales: `minEnemies = 1 + floor(dungeonLevel / 10)`
- Gold per kill: `(5 + enemyLevel*3) * levelModifier / alivePartyCount` (min 1)
- XP per kill: `(20 + enemyLevel*6) * levelModifier` — NOT split among party (incentivizes grouping)
- XP curve: `xpToNextLevel(level) = floor(50 × level²)` — exponential, MAX_LEVEL = 30
- Level-up: +1 str/vit/agi, full heal, carry-over excess XP, chat announcement
- Gold + XP + level + stats persisted to DB on leave + auto-save every 60s (skip if unchanged)
- Shared: `Economy.ts`, `Leveling.ts`, `constants/economy.ts`, `EnemyTypes.ts`
- Server: `DungeonRoom.ts` (distribution + persistence), `PlayerState` (gold, xp, xpToNext, level, addXp, setLevel)
- Client: gold pill with floating "+amount" animation, XP bar (bottom center, WoW-style) with floating "+XP" text, level-up particle effect (golden aura)

### Combat

- Server-authoritative: AISystem (enemy AI + threat), CombatSystem (player auto-attack)
- Damage: `max(1, attackDamage - defense)`
- Stats derived from base stats (strength/vitality/agility) via shared formulas

### Reconnection

- Token in localStorage, 120s reconnect window, session migration for re-login without token

### Chat

- Server-side ChatSystem with rate limiting, command parsing, broadcasting
- Slash commands: /help, /players, /kill, /heal, /tp, /leader, /setlevel, /kick (admin)
- Client: Enter to open, Escape to close, Tab autocomplete for commands + player names
- Chat input history: arrow up/down to navigate sent messages (max 50, draft preserved)
- Messages fade after 10s, hover to reveal all

## Vite Configuration

- `recast-detour` excluded from optimizeDeps (WASM)
- `.wasm` included in assetsInclude
- React/react-dom aliased to `packages/client/node_modules/` to prevent duplicate instances in monorepo
