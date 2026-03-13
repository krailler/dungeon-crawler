# Dungeon Crawler - Project Guide

## Git

- Always use `--no-gpg-sign` when committing (GPG agent not available)

## Tech Stack

- **3D Engine**: Babylon.js 8.x (client)
- **Multiplayer**: Colyseus 0.17.x (server) + @colyseus/sdk 0.17.x (client)
- **Language**: TypeScript 5.9 (strict mode)
- **Bundler**: Vite 8.x (client)
- **Server runtime**: tsx (esbuild, watch mode)
- **Pathfinding**: Grid-based A\* on TileMap (server-side)
- **UI**: HTML/CSS overlay for HUD, Babylon.js GUI only for in-world UI (floating bars)

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
      Constants.ts    # All game balance constants (TILE_SIZE, PLAYER_*, ENEMY_*, etc.)
      TileMap.ts      # 2D grid data + TileType + serialization
      protocol.ts     # MessageType + MoveMessage interface
      index.ts        # Barrel export
  server/           # Authoritative game server (Colyseus)
    src/
      state/          # Schema state classes (PlayerState, EnemyState, DungeonState)
      rooms/          # DungeonRoom (game loop, message handlers)
      systems/        # AISystem, CombatSystem (server-side logic)
      dungeon/        # DungeonGenerator (procedural, no Babylon deps)
      navigation/     # Pathfinder (A* on TileMap, uses WorldPos)
      main.ts         # Server entry point
  client/           # Babylon.js renderer + Colyseus client
    src/
      core/           # ClientGame, InputManager
      camera/         # IsometricCamera
      entities/       # ClientPlayer, ClientEnemy (mesh + interpolation)
      dungeon/        # DungeonRenderer (3D mesh generation)
      systems/        # WallOcclusionSystem
      ui/             # HUD: hudStore (pub-sub state) + HudRoot (React)
      main.ts         # Client entry point
    index.html
    vite.config.ts
```

## Architectural Decisions

### Engine: Babylon.js (not Three.js)

- Built-in physics, GUI, collisions, particles
- Native TypeScript
- Better suited for games vs Three.js which is more general-purpose

### Architecture: Authoritative Server

- Server owns all game logic: dungeon gen, pathfinding, AI, combat
- Clients are dumb renderers: receive state, interpolate, render meshes
- Colyseus Schema v4 for state sync (binary delta encoding)
- `@type()` decorators with `experimentalDecorators: true` + `useDefineForClassFields: false` in server tsconfig
- Server-only fields (path, speed, currentPathIndex) use normal initializers (not in Schema)

### Entity pattern: Hybrid (not pure ECS)

- Server: Schema state classes (PlayerState, EnemyState) + Systems (AISystem, CombatSystem)
- Client: ClientPlayer, ClientEnemy (mesh + lerp interpolation toward server state)
- Pure ECS is overkill for MVP with ~3 entity types

### Camera: ArcRotateCamera in perspective mode

- alpha = -PI/4 (45° diagonal view)
- beta = PI/3 (60° from zenith = 30° above horizon)
- radius = 25, zoom range 20-30
- Locked angles, no panning — follows player with lerp

### Physics: Custom (not Havok)

- Distance-based collisions on server + navmesh clamping via A\* pathfinding
- Havok adds ~2MB WASM with no benefit for this genre
- A\* pathfinding on TileMap prevents walking through walls

### Dungeons: Procedural tile-based generation

- 2D grid with TileType (WALL, FLOOR, DOOR, SPAWN, EXIT)
- Algorithm: random room placement + L-shaped corridors
- DungeonRenderer converts tiles to 3D meshes (boxes)
- TILE_SIZE = 2 world units

### Pathfinding: Grid-based A\* on TileMap

- Custom A\* implementation on the 2D tile grid (8-directional with diagonal wall check)
- Octile distance heuristic, skips start node in returned path
- recast-detour available for upgrade to NavMesh if needed later

### UI: HTML/CSS overlay

- Better performance for frequent updates (health, damage)
- Easier to style than Babylon.js GUI
- Babylon.js GUI only for floating bars above enemies (linkWithMesh)

### Lighting

- HemisphericLight ambient (intensity 0.7 debug, lower to 0.1 for gameplay)
- SpotLight as player torch (with ShadowGenerator PCF)
- PointLights for wall torches (no shadows, atmosphere only)
- GlowLayer for emissive effects

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
- Constants in UPPER_SNAKE_CASE in shared Constants.ts
- One file per class/component
- No `enum` keyword — use `as const` objects + type union (tsconfig `erasableSyntaxOnly`)
- No constructor parameter properties (`private x: T`) — declare fields explicitly

### Colyseus Schema conventions

- Use `@type()` decorators for synced fields (server tsconfig has `experimentalDecorators: true`)
- Synced fields: `@type("float32") x: number = 0;` — with default values
- Server-only fields: normal `path: WorldPos[] = [];` — no `@type()` decorator
- Client callbacks: `$(room.state).listen(prop, cb)`, `$(room.state).players.onAdd(cb)`, `$(player).onChange(cb)`

## Vite Configuration

- `recast-detour` excluded from optimizeDeps (WASM)
- `.wasm` included in assetsInclude

## Current MVP Status

- [x] Phase 0: Project setup + documentation + base scene
- [x] Phase 1: Dungeon generation (DungeonGenerator + DungeonRenderer)
- [x] Phase 2: Player with click-to-move (Player + A\* Pathfinder + Input)
- [x] Phase 3: Enemies with basic AI (Enemy + AISystem)
- [x] Phase 4: Combat system + functional HUD (CombatSystem + damage)
- [x] Phase 4.5: Client-server migration (Colyseus multiplayer)
- [ ] Phase 5: Polish (dynamic lighting, particles, sound)

## Implemented Files

### Shared (`packages/shared/src/`)

- `Constants.ts` — All game balance constants (TILE*SIZE, PLAYER*\_, ENEMY\_\_, CAMERA*\*, DUNGEON*\*, WALL_HEIGHT)
- `TileMap.ts` — 2D grid data + TileType + `serializeGrid()` / `fromSerialized()` for network transfer
- `protocol.ts` — MessageType const object + MoveMessage interface
- `FloorVariants.ts` — Deterministic floor tile variant generation with weighted random + per-room tile sets
- `WallVariants.ts` — Deterministic wall decoration variant generation (3 variants, weighted: 40/45/15%), per-room sets inherited from adjacent floor
- `TileSets.ts` — Tile set definitions + name↔id mapping
- `random.ts` — Shared seeded PRNG (mulberry32)
- `index.ts` — Barrel export

### Server (`packages/server/src/`)

- `main.ts` — Colyseus Server entry, defines "dungeon" room
- `rooms/DungeonRoom.ts` — Game room: dungeon gen, message handlers, 20-tick game loop
- `state/DungeonState.ts` — Root Schema state (MapSchema players/enemies, tileMapData)
- `state/PlayerState.ts` — Player Schema (position, health, synced) + server-only path data
- `state/EnemyState.ts` — Enemy Schema (position, health, isDead) + server-only AI data
- `systems/AISystem.ts` — Enemy AI: IDLE/CHASE/ATTACK, multi-player targeting, A\* repath
- `systems/CombatSystem.ts` — Player auto-attack: per-player cooldowns, closest enemy targeting
- `dungeon/DungeonGenerator.ts` — Procedural dungeon (no Babylon deps)
- `navigation/Pathfinder.ts` — A\* on TileMap (uses WorldPos, no Babylon deps)

### Client (`packages/client/src/`)

- `main.ts` — Entry point, creates ClientGame
- `core/ClientGame.ts` — Colyseus client, state listeners, render loop, entity management
- `core/InputManager.ts` — Click-on-floor raycasting, sends MOVE to server
- `camera/IsometricCamera.ts` — ArcRotateCamera with locked Diablo-style angles
- `entities/ClientPlayer.ts` — Player mesh + lerp interpolation from server state
- `entities/ClientEnemy.ts` — Enemy mesh + lerp + hit flash on damage
- `dungeon/DungeonRenderer.ts` — Converts TileMap to 3D floor/wall meshes + GLB wall decorations on exposed faces
- `dungeon/FloorAssetLoader.ts` — Loads floor tile GLBs per set, GPU-efficient instancing via AssetContainer
- `dungeon/WallAssetLoader.ts` — Loads wall decoration GLBs per set, places on wall faces (N/S/W/E), auto-scales to TILE_SIZE × WALL_HEIGHT
- `systems/WallOcclusionSystem.ts` — Diablo-style wall transparency + wall decoration toggling
- `ui/hudStore.ts` — HUD pub-sub store: party members, FPS, ping; React root lifecycle (mountHud/disposeHud)
- `ui/HudRoot.tsx` — React component: party health bars, FPS counter, ping display
- `index.html` — Fullscreen canvas + HUD overlay
- `vite.config.ts` — WASM exclusion for recast-detour
