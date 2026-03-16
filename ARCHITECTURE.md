# Dungeon Crawler - Architecture & Implementation Details

> Detailed architectural decisions and file inventory. For project rules, conventions, and quick reference, see [CLAUDE.md](./CLAUDE.md).

## Architectural Decisions

### Engine: Babylon.js (not Three.js)

- Built-in physics, GUI, collisions, particles
- Native TypeScript
- Better suited for games vs Three.js which is more general-purpose

### Architecture: Authoritative Server

- Server owns all game logic: dungeon gen, pathfinding, AI, combat, economy
- Clients are dumb renderers: receive state, interpolate, render meshes
- Colyseus Schema v4 for state sync (binary delta encoding)
- `@type()` decorators with `experimentalDecorators: true` + `useDefineForClassFields: false` in server tsconfig
- Server-only fields (path, speed, currentPathIndex, characterId) use normal initializers (not in Schema)

### Entity pattern: Hybrid (not pure ECS)

- Server: Schema state classes (PlayerState, EnemyState) + Systems (AISystem, CombatSystem)
- Client: ClientPlayer, ClientEnemy (mesh + lerp interpolation toward server state)

### Camera: ArcRotateCamera in perspective mode

- alpha = -PI/4 (45° diagonal view)
- beta = PI/3 (60° from zenith = 30° above horizon)
- radius = 15, locked zoom
- Locked angles, no panning — follows player with lerp

### Physics: Custom (not Havok)

- Distance-based collisions on server + navmesh clamping via A\* pathfinding
- Havok adds ~2MB WASM with no benefit for this genre
- A\* pathfinding on TileMap prevents walking through walls

### Dungeons: Procedural tile-based generation

- 2D grid with TileType (WALL, FLOOR, DOOR, SPAWN, EXIT)
- Algorithm: random room placement + L-shaped corridors
- DungeonRenderer converts tiles to 3D meshes (GLB floor tiles + thin wall segments + GLB wall decorations)
- TILE_SIZE = 2 world units

### Pathfinding: Grid-based A\* on TileMap

- Custom A\* implementation on the 2D tile grid (8-directional with diagonal wall check)
- Octile distance heuristic, skips start node in returned path
- Server uses exact click coordinates as final waypoint

### UI: React + Tailwind CSS overlay

- Better performance for frequent updates (health, damage)
- Easier to style than Babylon.js GUI
- Babylon.js GUI only for floating bars above enemies (linkWithMesh)

### Lighting

- HemisphericLight ambient (intensity 0.2)
- SpotLight as player torch (with ShadowGenerator PCF, local player only)
- PointLights for wall torches (~18% of walls, deterministic hash) with fire ParticleSystems
- GlowLayer for emissive effects
- Fog of war: PostProcess depth-based shader with radial darkness

### Character Models: Multi-skin GLB pipeline

- Base mesh: Kenney Animated Characters FBX, converted to GLB via Blender scripts
- Skins stored in `public/models/characters/{skinName}/` with `idle.glb` + `run.glb`
- `CharacterAssetLoader(scene, basePath)` loads GLBs per skin, instantiates with retargeted animations
- Idle GLB = base mesh; other GLBs provide animations via `instantiateModelsToScene` retargeting
- Blender scripts parameterized: `-- <skin_name> <output_dir>` (default: survivorMaleB → player/)
- Animations are procedural (Python in Blender), not from FBX source
- To add a new character/enemy: run scripts with new skin name, create loader with new basePath

### Stats System

- 3 base stats: `strength`, `vitality`, `agility` (persisted in DB, default 10)
- Derived stats computed via `computeDerivedStats(base, scaling?)` in shared package
- Formulas calibrated so 10/10/10 matches original hardcoded values (HP=100, dmg=10, speed=5)
- Damage formula: `max(1, attackDamage - targetDefense)` — simple, minimum 1
- Enemy types use `overrides: Partial<DerivedStats>` for hand-tuning
- CombatSystem and AISystem read stats from entity state, not from global constants

### Economy System

- **Dungeon level**: `dungeonLevel = average party level` at dungeon generation time (min 1, default 1 if no players). Does NOT rebalance when new players join mid-dungeon.
- **Enemy levels**: each enemy assigned level in range `[dungeonLevel - 1, dungeonLevel + 2]` (min 1) using seeded RNG
- **Enemy count per room**: scales with dungeon level: `minEnemies = 1 + floor(dungeonLevel / 10)` — forces grouping at high levels
- **Enemy stat scaling**: multiplicative `scale = 1 + (level - 1) * 0.20` applied to maxHealth, attackDamage, defense (not speed/cooldown/range)
- **Gold formula**: `baseGold = 5 + enemyLevel * 3`, modified by level difference between enemy and average party level
  - Anti-farming: enemies 5+ levels below party give only 10% gold
  - Mild penalty for lower enemies, mild bonus for higher enemies
  - Equal split among alive party members
- **XP formula**: `baseXp = 20 + enemyLevel * 6`, modified by level difference — NOT split among party (incentivizes grouping)
- **XP curve**: `xpToNextLevel(level) = floor(50 × level²)` — exponential, MAX_LEVEL = 30
- **Level-up**: +1 strength, +1 vitality, +1 agility per level; full heal; carry-over excess XP; chat announcement
- **Persistence**: gold + xp + level + stats + inventory saved to DB on leave/disconnect + periodic auto-save every 60s (optimized: only writes when hash of `gold:xp:level:str:vit:agi:tutorials:inventory` changes)
- **Client display**: gold pill with floating "+amount" animation, XP bar (WoW-style, bottom center) with floating "+XP" text, level-up golden particle effect (all players), level label on enemy floating health bars
- **Shared code**: `Economy.ts` (computeGoldDrop), `Leveling.ts` (xpToNextLevel, computeXpDrop), `constants/economy.ts` (tuning constants), `EnemyTypes.ts` (scaleEnemyDerivedStats)

### Inventory & Items

- **DB schemas**: `characters` schema (accounts, characters, character_inventory) and `world` schema (items) in same PostgreSQL DB
- **Item definitions**: loaded from `world.items` table at server startup into `ItemRegistry` (in-memory `Map<string, ItemDef>`)
- **Effect system**: `EffectHandlers` maps `effectType` string (e.g. "heal") to hardcoded functions; params from `effectParams` JSONB column
- **Inventory state**: `MapSchema<InventorySlotState>` on `PlayerSecretState` (synced via `@view()` to owning client only)
- **Persistence**: `character_inventory` table with upsert+transaction on save (not DELETE+INSERT); load on join with hash computed after async load
- **Item drops**: on enemy kill, each alive player rolls `POTION_DROP_CHANCE` (25%) → `addItem()` stacks or fills empty slots (max `INVENTORY_MAX_SLOTS = 12`)
- **Consumable use**: client sends `ITEM_USE`, server validates (alive, has item, no cooldown), executes effect, removes 1 qty, starts cooldown
- **Cooldowns**: `itemCooldowns: Map<string, number>` on PlayerState (server-only), ticked down in GameLoop, client receives `ITEM_COOLDOWN` message
- **Lazy item defs**: client requests defs on demand via `ITEM_DEFS_REQUEST`/`ITEM_DEFS_RESPONSE` with microtick batching (`queueMicrotask`), in-memory cache, version-based invalidation
- **Client UI**: `ConsumableSlots` (Q hotkey, first consumable), `InventoryPanel` (B hotkey, grid of 12 slots), both use `ActionSlot` component
- **Balance**: health potion heals 50 HP, 10s cooldown, max stack 10, drop weight 1.0
- **Admin**: `/give <player> <itemId> [qty]` command

### Admin & Combat Log

- Server actions (restart, seed change) protected by admin role check
- `broadcastToAdmins()` sends messages only to clients with `role === "admin"`
- Combat log: server emits `COMBAT_LOG` messages on every hit (player→enemy and enemy→player)
- Client logs to console with colors when debug toggle `combatLog` is enabled
- Debug panel: combat log toggle and server section only visible to admin users

### Chat System

- Server-side ChatSystem handles rate limiting (5 msgs / 5s), command parsing, and broadcasting
- Single `CHAT_SEND` message type from client; server parses `/commands` vs plain text
- Single `CHAT_ENTRY` message type from server with `category` (PLAYER, SYSTEM, EMOTE, COMMAND, ERROR, ANNOUNCEMENT)
- System events use i18n keys so clients can translate; fallback text for non-i18n clients
- Slash commands registered via CommandRegistry with admin-only flag (/give for items)
- Client ChatPanel: Enter to open/send, Escape to close, message fade after 10s, hover to reveal
- Command help overlay appears when input starts with `/`, Tab to autocomplete
- Chat input history: arrow up/down navigates sent messages (max 50, draft preserved on ArrowUp, restored past end on ArrowDown)
- Player name autocomplete for commands that expect `<player>` argument

### Reconnection & Session Migration

- Reconnection token stored in `localStorage` (survives tab close, unlike sessionStorage)
- `onDrop` allows 120s for reconnection with countdown warnings at 30s and 10s remaining
- If player reconnects from different browser/device (no token), `onJoin` detects existing player via `accountToSession` map and migrates state (HP, position, gold) to new session instead of creating duplicate
- Dead enemies removed from server state 1s after death to prevent ghost entities on rejoin

### Gate & Dungeon Start

- Lobby gate requires leader to open, with countdown before opening
- Once lobby gate is open, new players are blocked via `onAuth` check (throws "DUNGEON_STARTED")
- Returning players (account has existing disconnected player) are allowed through

### Party System

- Leader can promote others via context menu or be auto-assigned (first player in room)
- Leader can kick players via context menu (uses `kickedSessions` set for lifecycle tracking)
- Context menu closes on click outside (pointerdown capture), Escape (keydown capture), or action

### Internationalization (i18n)

- i18next with `initReactI18next` plugin (no Provider needed)
- Browser language auto-detection via `i18next-browser-languagedetector`
- Locale files: `packages/client/src/i18n/locales/{lang}.json`
- React components: `useTranslation()` hook
- Outside React (ClientGame.ts): standalone `t()` from `i18n/i18n.ts`
- To add a language: create `{lang}.json`, register in `i18n.ts` resources

## Implemented Files

### Shared (`packages/shared/src/`)

- `Constants.ts` — Game constants: TILE*SIZE, PLAYER*\*, ENEMY*\*, CAMERA*\*, DUNGEON\_\*, lighting, fog of war
- `TileMap.ts` — 2D grid data + TileType + `serializeGrid()` / `fromSerialized()` for network transfer
- `protocol.ts` — MessageType const object + CloseCode + ChatCategory/ChatVariant + all message interfaces
- `Stats.ts` — BaseStats, DerivedStats, `computeDerivedStats()`, `computeDamage()`, scaling constants
- `EnemyTypes.ts` — Enemy type definitions with baseStats + overrides, `computeEnemyDerivedStats()`, `scaleEnemyDerivedStats(derived, level)`
- `Economy.ts` — `computeGoldDrop(enemyLevel, avgPartyLevel, aliveCount)` with anti-farming modifiers
- `Leveling.ts` — `xpToNextLevel(level)`, `computeXpDrop(enemyLevel, playerLevel)` with level diff modifier
- `Items.ts` — `ItemDef` type (id, name, icon, maxStack, consumable, cooldown, effectType, effectParams, dropWeight)
- `constants/economy.ts` — Economy + XP tuning constants (BASE_GOLD_PER_KILL, BASE_XP_PER_KILL, XP_CURVE_BASE, MAX_LEVEL, ENEMY_STAT_SCALE_PER_LEVEL, save interval)
- `constants/items.ts` — Item balance constants (INVENTORY_MAX_SLOTS, POTION_DROP_CHANCE)
- `FloorVariants.ts` — Deterministic floor tile variant generation with weighted random + per-room tile sets
- `WallVariants.ts` — Deterministic wall decoration variant generation (3 variants, weighted: 40/45/15%)
- `TileSets.ts` — Tile set definitions + name↔id mapping
- `random.ts` — Shared seeded PRNG (mulberry32)
- `index.ts` — Barrel export

### Server (`packages/server/src/`)

- `main.ts` — Colyseus Server entry, defines "dungeon" room, loads ItemRegistry at startup
- `rooms/DungeonRoom.ts` — Game room: dungeon gen (with dungeonLevel), message handlers, game loop, gold distribution on kill, auto-save, reconnection with session migration + countdown warnings, gate system, party kick, ITEM_USE/ITEM_DEFS_REQUEST handlers
- `chat/ChatSystem.ts` — Server-side chat: rate limiting, message broadcasting, system events (i18n keys), command dispatch
- `chat/CommandRegistry.ts` — Slash command registry with admin-only support, argument parsing
- `chat/commands.ts` — Built-in commands: /help, /players, /kill, /heal, /tp, /leader, /setlevel, /kick, /give
- `items/ItemRegistry.ts` — Loads item definitions from DB at startup, provides `getItemDef()`, `getDroppableItems()`, versioned cache
- `items/EffectHandlers.ts` — Maps effectType strings to functions (heal → restore HP)
- `state/DungeonState.ts` — Root Schema state (MapSchema players/enemies/gates, tileMapData, tickRate, dungeonLevel, dungeonVersion, serverRuntime)
- `state/PlayerState.ts` — Player Schema (position, health, base stats, derived stats, gold, xp, xpToNext, level synced) + server-only (path, combat data, characterId, itemCooldowns) + `addXp()`, `setLevel()`, `applyDerivedStats()`, `addItem()`, `removeItem()`, `countItem()`
- `state/PlayerSecretState.ts` — Private state synced only to owning client via `@view()`: gold, xp, skills, inventory (MapSchema\<InventorySlotState\>)
- `state/InventorySlotState.ts` — Schema class: itemId (string) + quantity (uint16)
- `rooms/PlayerSessionManager.ts` — Join/leave/reconnect lifecycle, session migration, `savePlayerProgress()` (stats + inventory upsert), `loadInventory()`, leader reassignment
- `systems/GameLoop.ts` — 20-tick simulation: movement, sprint/stamina, item drops on kill, item cooldown ticking
- `state/EnemyState.ts` — Enemy Schema (position, health, isDead, enemyType, level) + server-only AI/combat data
- `state/GateState.ts` — Gate Schema (position, type, open state)
- `systems/AISystem.ts` — Enemy AI: IDLE/CHASE/ATTACK, multi-player targeting (threat table), A\* repath, combat event callbacks
- `systems/CombatSystem.ts` — Player auto-attack: per-player cooldowns, closest enemy targeting, combat event callbacks
- `dungeon/DungeonGenerator.ts` — Procedural dungeon (no Babylon deps)
- `navigation/Pathfinder.ts` — A\* on TileMap (uses WorldPos, no Babylon deps)
- `sessions/activeSessionRegistry.ts` — Global session tracking for duplicate login detection/kick
- `db/schema.ts` — Drizzle ORM schema: `characters` schema (accounts, characters, character_inventory), `world` schema (items)
- `db/database.ts` — PostgreSQL connection + auto-migration
- `db/seed.ts` — Seed data: health_potion item definition

### Client (`packages/client/src/`)

- `main.ts` — Entry point: loads CSS, inits i18n, creates ClientGame, auth state watcher
- `core/ClientGame.ts` — Colyseus client, render loop, reconnection, combat log, chat, debug paths, itemDefStore connect
- `core/StateSync.ts` — State listener setup: players (gold, xp, level-up detection + particle effect, inventory sync), enemies (level), minimap sync, item def preloading
- `core/InputManager.ts` — Diablo-style click-and-hold: pointerdown/pointerup + throttled MOVE sends (150ms)
- `camera/IsometricCamera.ts` — ArcRotateCamera with locked Diablo-style angles, radius 15
- `entities/CharacterAssetLoader.ts` — Loads GLB character models per skin (basePath), instantiates with retargeted animations
- `entities/ClientPlayer.ts` — GLB character model + SpotLight torch + ShadowGenerator PCF + lerp + idle/run + facing target + chat bubble + level-up particle effect (golden aura)
- `entities/AnimationController.ts` — Animation state machine: crossfade between idle/run/oneshot, footstep sound timing
- `entities/ClientEnemy.ts` — GLB zombie model + lerp + hit flash + idle/run + floating health bar with level label ("Lv.X")
- `dungeon/DungeonRenderer.ts` — GLB floor tiles, thin wall segments, GLB wall decorations, wall torch lights + particles, gate meshes
- `dungeon/FloorAssetLoader.ts` — Loads floor tile GLBs per set, GPU-efficient instancing
- `dungeon/WallAssetLoader.ts` — Loads wall decoration GLBs per set, places on wall faces
- `systems/WallOcclusionSystem.ts` — Diablo-style wall transparency + spatial grid partitioning
- `systems/FogOfWarSystem.ts` — PostProcess depth-based shader: radial darkness
- `audio/SoundManager.ts` — Ambient music + SFX
- `i18n/i18n.ts` — i18next initialization
- `i18n/locales/en.json` — English translations (all UI strings)
- `ui/stores/authStore.ts` — Auth state: login/logout/kick, token, role
- `ui/stores/hudStore.ts` — HUD pub-sub: party members (stats, level, gold, xp, xpToNext, online, inventory), FPS, ping, connection, item cooldowns
- `ui/stores/itemDefStore.ts` — Lazy-loading item definition cache with microtick batching, version-based invalidation, async preloading
- `ui/stores/chatStore.ts` — Chat pub-sub: message history, input, commands
- `ui/stores/debugStore.ts` — Debug toggles, persisted localStorage
- `ui/stores/adminStore.ts` — Admin state: room ref, seed, tickRate, runtime, actions
- `ui/stores/loadingStore.ts` — Loading screen phases + fade-out
- `ui/stores/minimapStore.ts` — Minimap: tile map, player/enemy positions, fog discovery
- `ui/stores/gateStore.ts` — Gate state: positions, open state, nearest interactable
- `ui/stores/promptStore.ts` — Confirmation prompt state
- `ui/stores/announcementStore.ts` — Center-screen announcement overlay
- `ui/hud/HudRoot.tsx` — Party bars (level badges, offline), gold pill with floating "+amount" animation (GoldPill component), FPS/ping, context menu (promote/kick), character/minimap/inventory buttons, SkillBar + ConsumableSlots
- `ui/hud/XpBar.tsx` — WoW-style XP bar (bottom center, 60% width): purple gradient, level label, XP numbers, floating "+XP" animated text on gain
- `ui/hud/ChatPanel.tsx` — Chat: messages with fade, input with Enter, slash command help with Tab, arrow up/down history navigation
- `ui/hud/CharacterPanel.tsx` — Character sheet: name, level, health bar, gold display, base stats, derived stats (uses HudPanel)
- `ui/hud/SkillBar.tsx` — Skill slots (1-5 hotkeys) using ActionSlot component
- `ui/hud/ConsumableSlots.tsx` — Quick consumable slot (Q hotkey), first consumable from inventory
- `ui/hud/InventoryPanel.tsx` — 4x3 inventory grid (B hotkey) with item tooltips, click-to-use (uses HudPanel + ActionSlot)
- `ui/hud/DebugPanel.tsx` — Debug toggles + admin section
- `ui/hud/MinimapOverlay.tsx` — Minimap with fog, player/enemy dots
- `ui/hud/PauseMenu.tsx` — Escape pause overlay
- `ui/hud/GatePrompt.tsx` — Gate interaction hint + confirmation dialog
- `ui/hud/PromptOverlay.tsx` — Generic confirmation overlay
- `ui/hud/AnnouncementOverlay.tsx` — Center-screen announcements
- `ui/components/HudButton.tsx` — Reusable HUD button with icon + label + shortcut
- `ui/components/HudPill.tsx` — Reusable HUD pill (default/amber variants)
- `ui/components/ActionSlot.tsx` — Unified slot component for skills/consumables/inventory (variants: default/red/empty, sizes: md/sm, cooldown overlay, quantity badge, tooltip, keybind)
- `ui/components/HudPanel.tsx` — Reusable panel with header + close button (used by CharacterPanel, InventoryPanel)
- `ui/icons/` — SVG icon components (CharacterIcon, MapIcon, StarIcon, CoinIcon, PotionIcon, BackpackIcon)
- `ui/screens/LoginScreen.tsx` — Login form + dev quick-login
- `ui/screens/LoadingScreen.tsx` — Loading progress bar
