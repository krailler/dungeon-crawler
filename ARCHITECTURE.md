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

- Server: Schema state classes (PlayerState, CreatureState) + Systems (AISystem, CombatSystem)
- Client: ClientPlayer, ClientCreature (mesh + lerp interpolation toward server state)

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
- To add a new character/creature: run scripts with new skin name, create loader with new basePath

### Stats System

- 3 base stats: `strength`, `vitality`, `agility` (persisted in DB, default 10)
- Derived stats computed via `computeDerivedStats(base, scaling?)` in shared package
- Formulas calibrated so 10/10/10 matches original hardcoded values (HP=100, dmg=10, speed=5)
- Damage formula: `max(1, attackDamage - targetDefense)` — simple, minimum 1
- Creature types use `overrides: Partial<DerivedStats>` for hand-tuning
- CombatSystem and AISystem read stats from entity state, not from global constants

### Economy System

- **Dungeon level**: `dungeonLevel = average party level` at dungeon generation time (min 1, default 1 if no players). Does NOT rebalance when new players join mid-dungeon.
- **Creature levels**: each creature assigned level in range `[dungeonLevel - 1, dungeonLevel + 2]` (min 1) using seeded RNG
- **Creature count per room**: scales with dungeon level: `minCreatures = 1 + floor(dungeonLevel / 10)` — forces grouping at high levels
- **Creature stat scaling**: multiplicative `scale = 1 + (level - 1) * 0.20` applied to maxHealth, attackDamage, defense (not speed/cooldown/range)
- **Gold formula**: `baseGold = 5 + creatureLevel * 3`, modified by level difference between creature and average party level
  - Anti-farming: creatures 5+ levels below party give only 10% gold
  - Mild penalty for lower creatures, mild bonus for higher creatures
  - Equal split among alive party members
- **XP formula**: `baseXp = 20 + creatureLevel * 6`, modified by level difference — NOT split among party (incentivizes grouping)
- **XP curve**: `xpToNextLevel(level) = floor(50 × level²)` — exponential, MAX_LEVEL = 30
- **Level-up**: +1 strength, +1 vitality, +1 agility per level; full heal; carry-over excess XP; chat announcement
- **Persistence**: gold + xp + level + stats + inventory saved to DB on leave/disconnect + periodic auto-save every 60s (optimized: only writes when hash of `gold:xp:level:str:vit:agi:tutorials:inventory` changes)
- **Client display**: gold pill with floating "+amount" animation, XP bar (WoW-style, bottom center) with floating "+XP" text, level-up golden particle effect (all players), level label on creature floating health bars
- **Shared code**: `Economy.ts` (computeGoldDrop), `Leveling.ts` (xpToNextLevel, computeXpDrop), `constants/economy.ts` (tuning constants), `CreatureTypes.ts` (scaleCreatureDerivedStats)

### Inventory & Items

- **DB schemas**: `characters` schema (accounts, characters, character_inventory) and `world` schema (items) in same PostgreSQL DB
- **Item definitions**: loaded from `world.items` table at server startup into `ItemRegistry` (in-memory `Map<string, ItemDef>`)
- **Effect system**: `EffectHandlers` maps `effectType` string (e.g. "heal") to hardcoded functions; params from `effectParams` JSONB column
- **Inventory state**: `MapSchema<InventorySlotState>` on `PlayerSecretState` (synced via `@view()` to owning client only)
- **Persistence**: `character_inventory` table with upsert+transaction on save (not DELETE+INSERT); load on join with hash computed after async load
- **Item drops**: on creature kill, each alive player rolls `POTION_DROP_CHANCE` (25%) → `addItem()` stacks or fills empty slots (max `INVENTORY_MAX_SLOTS = 12`)
- **Consumable use**: client sends `ITEM_USE`, server validates (alive, has item, no cooldown), executes effect, removes 1 qty, starts cooldown
- **Cooldowns**: `itemCooldowns: Map<string, number>` on PlayerState (server-only), ticked down in GameLoop, client receives `ITEM_COOLDOWN` message
- **Lazy item defs**: client requests defs on demand via `ITEM_DEFS_REQUEST`/`ITEM_DEFS_RESPONSE` with microtick batching (`queueMicrotask`), in-memory cache, version-based invalidation
- **Client UI**: `ConsumableSlots` (Q hotkey, first consumable), `InventoryPanel` (B hotkey, grid of 12 slots), both use `ActionSlot` component
- **Balance**: health potion heals 50 HP, 10s cooldown, max stack 10, drop weight 1.0
- **Admin**: `/give <player> <itemId> [qty]` command

### Death & Revive System

- **Life states**: `LifeState` = "alive" | "downed" | "dead" — transitions managed server-side in GameLoop
- **Downed**: player reaches 0 HP → enters DOWNED state, starts BLEEDOUT_DURATION (30s) countdown. Can be revived by allies.
- **Dead**: bleedout timer expires → DEAD state, respawn timer starts (base 5s + 5s per death, max 30s). Player respawns at spawn point with full HP.
- **Revive**: nearby alive player channels R key within REVIVE_RANGE (3.0 units) for REVIVE_CHANNEL_DURATION (3.5s) → target revived at 30% HP
- **Combat integration**: AISystem drops threat on dead targets, CombatSystem stops auto-attacking dead players
- **Audio**: SoundManager plays downed_loop/dead_loop, ducking ambient music during death states
- **Client**: DeathOverlay shows bleed/respawn timers, revive progress bar; TargetFrame shows revive button for downed allies; ActionFeedback shows "dead"/"out of range" errors
- **Shared**: `constants/death.ts` (all timing constants), `LifeState` type
- **Server**: GameLoop (state transitions, revive channel tracking), PlayerState (lifeState, bleedTimer, respawnTimer, reviveProgress)
- **Client**: deathStore (timers, progress), DeathOverlay, feedbackStore

### Loot System

- **Creature loot tables**: defined in DB (`world.creature_loot` table), loaded at startup by `CreatureTypeRegistry`
- **Drop mechanic**: on creature kill, each alive player independently rolls per loot entry (dropChance, minQuantity, maxQuantity)
- **Loot bags**: when drops exist, server creates `LootBagState` at creature position with `MapSchema<InventorySlotState>`
- **Interaction**: client clicks loot bag → sends INTERACT message → server validates range → sends bag contents → client opens `LootBagPanel`
- **Pickup**: player takes item → server moves to inventory (stacks or fills empty slot) → notifies other players via chat announcement
- **Client**: `ClientLootBag` (golden sphere + bobbing + point light), `lootBagStore`, `LootBagPanel` (4-column grid)
- **Server**: `LootBagState`, `CreatureTypeRegistry` (loot entries), `DungeonRoom` (bag creation + pickup handlers)

### Stamina & Sprint

- **Mechanics**: hold Shift to sprint at 1.5x speed; stamina drains at 20/s (5s full drain), regens at 10/s after 1s delay
- **Server-authoritative**: GameLoop ticks drain/regen, validates sprint state, applies speed multiplier
- **Client**: `StaminaBar` above XP bar (visible when stamina < max), `PlayerSecretState.stamina` synced via `@view()`
- **Shared**: `constants/stamina.ts` (STAMINA_MAX=100, rates, delay, multiplier)

### Skills System

- **Definitions**: `Skills.ts` defines `SkillDef` type with id, icon, cooldown, damageMultiplier
- **Current skills**: basic_attack (passive auto-attack, no cooldown), heavy_strike (active, 5s cooldown, 2.5x damage multiplier)
- **Client**: `SkillBar` with hotkeys 1-5, cooldown ring overlay on `ActionSlot` component
- **Server**: `CombatSystem` applies skill cooldowns and damage multipliers; `PlayerSecretState.skills` array synced to client
- **Extensible**: MAX_SKILL_SLOTS = 5, new skills can be added to SKILL_DEFS

### Spatial Audio

- **Purpose**: remote player/creature footsteps and attacks play from their world position with distance-based attenuation
- **Implementation**: Babylon.js Web Audio spatial sound with linear rolloff model
- **Parameters**: maxDistance=20, refDistance=2, rolloffFactor=1
- **Audio listener**: follows camera target (local player on ground plane), not camera position
- **Pooling**: round-robin Sound instance pools to avoid allocation per play — 8 spatial footsteps, 4 per attack animation name
- **Integration**: `AnimationController.setSpatialPosition(fn)` for remote entities; `SoundManager.playSpatialFootstep(pos)` / `playSpatialAnimSound(name, pos)`
- **Volume**: spatial sounds respect master × category volume settings

### Tutorial System

- **Steps**: `TutorialStep` = "start_dungeon" | "allocate_stats" | "sprint" | "you_downed" | "teammate_downed"
- **Server-driven**: server sends `TUTORIAL_HINT` messages contextually (e.g. on gate open, level-up, death)
- **Tracking**: `PlayerState.tutorials` (server-only Set) tracks completed steps; persisted in DB save hash
- **Client**: `tutorialStore` uses LIFO stack — multiple hints queue up instead of replacing each other
- **Display**: `TutorialHint` component (bottom-left), click to dismiss
- **Admin**: `/reset-tutorials` command clears all steps and re-sends applicable hints based on current state

### Admin & Combat Log

- Server actions (restart, seed change) protected by admin role check
- `broadcastToAdmins()` sends messages only to clients with `role === "admin"`
- Combat log: server emits `COMBAT_LOG` messages on every hit (player→creature and creature→player)
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
- Dead creatures removed from server state 1s after death to prevent ghost entities on rejoin

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

- `Constants.ts` — Game constants: TILE*SIZE, PLAYER*\*, CREATURE*\*, CAMERA*\*, DUNGEON\_\*, lighting, fog of war
- `TileMap.ts` — 2D grid data + TileType + `serializeGrid()` / `fromSerialized()` for network transfer
- `protocol.ts` — MessageType const object + CloseCode + ChatCategory/ChatVariant + all message interfaces
- `Stats.ts` — BaseStats, DerivedStats, `computeDerivedStats()`, `computeDamage()`, scaling constants
- `CreatureTypes.ts` — Creature type definitions with baseStats + overrides, `computeCreatureDerivedStats()`, `scaleCreatureDerivedStats(derived, level)`
- `Economy.ts` — `computeGoldDrop(creatureLevel, avgPartyLevel, aliveCount)` with anti-farming modifiers
- `Leveling.ts` — `xpToNextLevel(level)`, `computeXpDrop(creatureLevel, playerLevel)` with level diff modifier
- `Items.ts` — `ItemDef` type (id, name, icon, maxStack, consumable, cooldown, effectType, effectParams, dropWeight)
- `Skills.ts` — `SkillDef` type, `SKILL_DEFS` (basic_attack passive, heavy_strike 5s cooldown 2.5x), `MAX_SKILL_SLOTS`
- `Roles.ts` — `Role` type ("admin", "user")
- `GateTypes.ts` — `GateType` ("lobby")
- `Tutorial.ts` — `TutorialStep` type (start_dungeon, allocate_stats, sprint, you_downed, teammate_downed)
- `RoomNames.ts` — `generateRoomName(seed)` — procedural dungeon names (adjective + noun, mulberry32 RNG)
- `constants/economy.ts` — Economy + XP tuning constants (BASE_GOLD_PER_KILL, BASE_XP_PER_KILL, XP_CURVE_BASE, MAX_LEVEL, CREATURE_STAT_SCALE_PER_LEVEL, save interval)
- `constants/items.ts` — Item balance constants (INVENTORY_MAX_SLOTS, POTION_DROP_CHANCE)
- `constants/death.ts` — Life state constants (BLEEDOUT_DURATION=30s, REVIVE_CHANNEL_DURATION=3.5s, REVIVE_RANGE=3, REVIVE_HP_PERCENT=0.3, respawn timers)
- `constants/stamina.ts` — Sprint constants (STAMINA_MAX=100, SPRINT_SPEED_MULTIPLIER=1.5, drain/regen rates, delay)
- `constants/version.ts` — Protocol versioning (PROTOCOL_VERSION, MIN_PROTOCOL_VERSION)
- `constants/camera.ts` — Camera settings (alpha, beta, radius, follow speed)
- `constants/lighting.ts` — Lighting + fog of war constants (intensities, ranges, fog radii)
- `constants/chat.ts` — Chat limits (max length, history, fade, rate limiting)
- `constants/dungeon.ts` — Dungeon generation (dimensions, rooms, wall height, collision radius, wall margin, minimap radius)
- `constants/player.ts` — Player-specific (ATTACK_ANIM_DURATION)
- `constants/creature.ts` — Creature-specific (CREATURE_REPATH_INTERVAL)
- `constants/gate.ts` — Gate interaction (INTERACT_RANGE, GATE_COUNTDOWN_SECONDS, ANNOUNCEMENT_FADE_MS)
- `FloorVariants.ts` — Deterministic floor tile variant generation with weighted random + per-room tile sets
- `WallVariants.ts` — Deterministic wall decoration variant generation (3 variants, weighted: 40/45/15%)
- `TileSets.ts` — Tile set definitions + name↔id mapping
- `random.ts` — Shared seeded PRNG (mulberry32)
- `index.ts` — Barrel export

### Server (`packages/server/src/`)

- `main.ts` — Colyseus Server entry, defines "dungeon" room, loads ItemRegistry + CreatureTypeRegistry at startup
- `logger.ts` — Pino-based structured logging (pretty in dev, JSON in prod), room-scoped child loggers
- `auth/authConfig.ts` — JWT authentication setup, email/password registration (dev-only), auto-creates character
- `rooms/DungeonRoom.ts` — Game room: dungeon gen (with dungeonLevel), message handlers, game loop, gold distribution on kill, auto-save, reconnection with session migration + countdown warnings, gate system, party kick, ITEM_USE/ITEM_DEFS_REQUEST/SKILL_USE handlers, AOI culling
- `rooms/PlayerSessionManager.ts` — Join/leave/reconnect lifecycle (300s window), session migration, `savePlayerProgress()` (stats + inventory upsert), `loadInventory()`, leader reassignment, tutorial hint sending
- `chat/ChatSystem.ts` — Server-side chat: rate limiting, message broadcasting, system events (i18n keys), command dispatch
- `chat/CommandRegistry.ts` — Slash command registry with admin-only support, argument parsing
- `chat/commands.ts` — Built-in commands: /help, /players, /kill, /heal, /revive, /tp, /leader, /setlevel, /kick, /give, /reset-tutorials
- `chat/notifyLevelProgress.ts` — Level-up notification: public announcement + private stat-point message + tutorial hints
- `items/ItemRegistry.ts` — Loads item definitions from DB at startup, provides `getItemDef()`, `getDroppableItems()`, versioned cache
- `items/EffectHandlers.ts` — Maps effectType strings to functions (heal → restore HP)
- `creatures/CreatureTypeRegistry.ts` — Loads creature types + loot tables from DB, level-based filtering, loot entry lookups
- `state/DungeonState.ts` — Root Schema state (MapSchema players/creatures/gates/lootBags, tileMapData, tickRate, dungeonLevel, dungeonVersion, serverRuntime)
- `state/PlayerState.ts` — Player Schema (position, health, animation, lifeState, bleed/respawn/revive timers, level, sprint) + server-only (path, combat data, characterId, itemCooldowns, tutorials) + `addXp()`, `setLevel()`, `applyDerivedStats()`, `addItem()`, `removeItem()`, `countItem()`
- `state/PlayerSecretState.ts` — Private state synced only to owning client via `@view()`: base/derived stats, gold, xp, skills, stamina, inventory (MapSchema\<InventorySlotState\>), role, auto-attack toggle
- `state/InventorySlotState.ts` — Schema class: itemId (string) + quantity (uint16)
- `state/CreatureState.ts` — Creature Schema (position, health, isDead, creatureType, level, animation, aggro) + server-only AI/combat data
- `state/GateState.ts` — Gate Schema (position, type, N/S vs E/W orientation, open state)
- `state/LootBagState.ts` — Loot bag Schema (position, MapSchema\<InventorySlotState\>)
- `systems/GameLoop.ts` — 32-tick simulation: movement, sprint/stamina, item drops on kill, item cooldown ticking, life state transitions (ALIVE→DOWNED→DEAD→respawn), revive channel management, loot bag creation, entity collision, wall margin enforcement
- `systems/AISystem.ts` — Creature AI: IDLE/CHASE/ATTACK/LEASH/ROAM, multi-player targeting (threat table with decay), A\* repath, proximity threat, stuck detection, leash range
- `systems/CombatSystem.ts` — Player auto-attack: per-player cooldowns, skill cooldown application, damage multipliers, closest creature targeting, combat event callbacks
- `systems/GateSystem.ts` — Gate interaction: lobby gate countdown with warning broadcasts, pathfinder tile blocking/unblocking, post-gate tutorial hints
- `tutorials/resetTutorials.ts` — Clear and resend applicable tutorial hints (used by /reset-tutorials command)
- `dungeon/DungeonGenerator.ts` — Procedural dungeon (BSP, no Babylon deps)
- `navigation/Pathfinder.ts` — A\* on TileMap (8-directional, diagonal wall check, line-of-sight via Bresenham, tile blocking for gates)
- `sessions/activeSessionRegistry.ts` — Global session tracking for duplicate login detection/kick
- `db/schema.ts` — Drizzle ORM schema: `characters` schema (accounts, characters, character_inventory), `world` schema (items, creatures, creature_loot)
- `db/database.ts` — PostgreSQL connection pool (max 10) + auto-migration
- `db/seed.ts` — Seed data: health_potion item definition

### Client (`packages/client/src/`)

- `main.ts` — Entry point: loads CSS, inits i18n, creates ClientGame, auth state watcher
- `core/ClientGame.ts` — Colyseus client, render loop, reconnection, combat log, chat, debug paths, itemDefStore connect, audio listener on camera target, throttled render on blur
- `core/StateSync.ts` — State listener setup: players (gold, xp, level-up detection + particle effect, inventory sync, life state), creatures (level), loot bags, minimap sync, item def preloading, gate/target changes
- `core/InputManager.ts` — Diablo-style click-and-hold: pointerdown/pointerup + throttled MOVE sends (150ms), entity picking via raycast, generic interactable system (gates, loot bags), revive keybind (R), sprint (Shift), Tab target cycling
- `core/ClientUpdateLoop.ts` — Frame-by-frame entity interpolation (lerp position/rotation) + animation updates + fog of war updates
- `camera/IsometricCamera.ts` — ArcRotateCamera with locked Diablo-style angles, radius 15, smooth follow
- `entities/CharacterAssetLoader.ts` — Loads GLB character models per skin (basePath), instantiates with retargeted animations
- `entities/ClientPlayer.ts` — GLB character model + SpotLight torch + ShadowGenerator PCF + lerp (factor 6) + idle/run/attack anims + facing target + chat bubble + level-up particle effect + footstep sounds (local=direct, remote=spatial)
- `entities/AnimationController.ts` — Animation state machine: crossfade between idle/run/oneshot, attack sound timing with optional spatial position callback
- `entities/ClientCreature.ts` — GLB zombie model + lerp (factor 12) + hit flash (white PBR, 0.12s) + idle/run + floating health bar with level label + spatial footstep sounds + damage text
- `entities/ClientLootBag.ts` — Golden sphere with bobbing animation + point light, pickable with interactable metadata
- `entities/SelectionRing.ts` — Reusable selection torus (color-configurable: blue for players, red for creatures), lazy init
- `dungeon/DungeonRenderer.ts` — GLB floor tiles, thin wall segments, GLB wall decorations, wall torch lights + particles, gate meshes, loot bag meshes
- `dungeon/FloorAssetLoader.ts` — Loads floor tile GLBs per set, GPU-efficient instancing
- `dungeon/WallAssetLoader.ts` — Loads wall decoration GLBs per set, places on wall faces
- `systems/WallOcclusionSystem.ts` — Diablo-style wall transparency + spatial grid partitioning
- `systems/WallFadePlugin.ts` — Wall fade effect helper
- `systems/FogOfWarSystem.ts` — PostProcess depth-based shader: radial darkness
- `audio/SoundManager.ts` — Ambient music + SFX + spatial audio pools (footsteps, attack sounds) with distance-based attenuation + death state audio loops
- `audio/uiSfx.ts` — UI sound effect utilities (preload, play)
- `i18n/i18n.ts` — i18next initialization
- `i18n/locales/en.json` — English translations (all UI strings incl. death, loot, feedback, tutorial, cmd sections)
- `ui/stores/authStore.ts` — Auth state: login/logout/kick, token, role
- `ui/stores/hudStore.ts` — HUD pub-sub: party members (stats, level, gold, xp, xpToNext, online, inventory), FPS, ping, connection, item/skill cooldowns
- `ui/stores/itemDefStore.ts` — Lazy-loading item definition cache with microtick batching, version-based invalidation, async preloading
- `ui/stores/chatStore.ts` — Chat pub-sub: message history, input, commands
- `ui/stores/debugStore.ts` — Debug toggles, persisted localStorage
- `ui/stores/adminStore.ts` — Admin state: room ref, seed, tickRate, runtime, actions
- `ui/stores/loadingStore.ts` — Loading screen phases (MODELS, SERVER, DUNGEON_ASSETS, DUNGEON_RENDER) + fade-out
- `ui/stores/minimapStore.ts` — Minimap: tile map, player/creature positions, gate markers, fog discovery
- `ui/stores/gateStore.ts` — Gate state: positions, open state, nearest interactable
- `ui/stores/promptStore.ts` — Confirmation prompt state
- `ui/stores/announcementStore.ts` — Center-screen announcement overlay
- `ui/stores/creatureStore.ts` — All visible creature state tracking
- `ui/stores/targetStore.ts` — Currently selected target entity (creature/player)
- `ui/stores/deathStore.ts` — Life state (ALIVE/DOWNED/DEAD), bleed/respawn timers, revive progress
- `ui/stores/lootBagStore.ts` — Open loot bag ID, slot contents (item/quantity)
- `ui/stores/settingsStore.ts` — Game settings (volume sliders, keybindings persistence)
- `ui/stores/tutorialStore.ts` — Tutorial hint LIFO stack (push/pop/dismiss)
- `ui/stores/feedbackStore.ts` — Transient error/feedback messages (1.5s auto-dismiss)
- `ui/hud/HudRoot.tsx` — Party bars (level badges, offline), gold pill with floating "+amount" animation (GoldPill component), FPS/ping, context menu (promote/kick), character/minimap/inventory buttons, SkillBar + ConsumableSlots
- `ui/hud/XpBar.tsx` — WoW-style XP bar (bottom center, 60% width): purple gradient, level label, XP numbers, floating "+XP" animated text on gain
- `ui/hud/StaminaBar.tsx` — Sprint stamina indicator above XP bar (visible when not full)
- `ui/hud/ChatPanel.tsx` — Chat: messages with fade, input with Enter, slash command help with Tab, arrow up/down history navigation
- `ui/hud/CharacterPanel.tsx` — Character sheet: name, level, health bar, gold display, base stats, derived stats (uses HudPanel)
- `ui/hud/SkillBar.tsx` — Skill slots (1-5 hotkeys) using ActionSlot component
- `ui/hud/ConsumableSlots.tsx` — Quick consumable slot (Q hotkey), first consumable from inventory
- `ui/hud/InventoryPanel.tsx` — 4x3 inventory grid (B hotkey) with item tooltips, click-to-use (uses HudPanel + ActionSlot)
- `ui/hud/TargetFrame.tsx` — Selected target health/stats + revive button for downed allies
- `ui/hud/DeathOverlay.tsx` — Death/downed screen with bleed/respawn timer + revive progress bar
- `ui/hud/LootBagPanel.tsx` — Floating loot bag grid (4 columns) with take-all functionality
- `ui/hud/ActionFeedback.tsx` — Floating error messages (red, bottom-center, auto-dismiss)
- `ui/hud/TutorialHint.tsx` — Tutorial hint display (bottom-left, dismiss on click)
- `ui/hud/DebugPanel.tsx` — Debug toggles + admin section
- `ui/hud/MinimapOverlay.tsx` — Minimap with fog, player/creature dots
- `ui/hud/SettingsPanel.tsx` — Volume + keybinding configuration
- `ui/hud/PauseMenu.tsx` — Escape pause overlay (Resume, Settings, Reset Tutorials, Logout)
- `ui/hud/GatePrompt.tsx` — Gate interaction hint + confirmation dialog
- `ui/hud/PromptOverlay.tsx` — Generic confirmation overlay
- `ui/hud/AnnouncementOverlay.tsx` — Center-screen announcements with auto-dismiss
- `ui/components/ActionSlot.tsx` — Unified slot component for skills/consumables/inventory (variants: primary/consumable/empty, cooldown overlay, quantity badge, tooltip, keybind)
- `ui/components/HudButton.tsx` — Reusable HUD button with icon + label + shortcut
- `ui/components/HudPill.tsx` — Reusable HUD pill (default/amber variants)
- `ui/components/HudPanel.tsx` — Reusable panel with header + close button (used by CharacterPanel, InventoryPanel)
- `ui/components/MenuButton.tsx` — Menu-specific button styling
- `ui/components/ConfirmDialog.tsx` — Yes/No confirmation popup
- `ui/components/healthColor.ts` — Health bar color utility (green → red gradient)
- `ui/components/lifeState.ts` — Life state CSS class mapping (alive/downed/dead)
- `ui/hooks/useDraggable.ts` — Draggable panel handle logic
- `ui/icons/` — SVG icon components (CharacterIcon, MapIcon, StarIcon, CoinIcon, PotionIcon, BackpackIcon, SwordIcon, FistIcon, FullscreenIcon, LockIcon)
- `ui/screens/LoginScreen.tsx` — Login form + dev quick-login
- `ui/screens/LoadingScreen.tsx` — Loading progress bar
