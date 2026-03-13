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
      Constants.ts    # All game balance constants (TILE_SIZE, PLAYER_*, ENEMY_*, etc.)
      TileMap.ts      # 2D grid data + TileType + serialization
      protocol.ts     # MessageType + MoveMessage interface
      FloorVariants.ts # Deterministic floor tile variant generation
      WallVariants.ts  # Deterministic wall decoration variant generation
      TileSets.ts     # Tile set definitions + name↔id mapping
      random.ts       # Shared seeded PRNG (mulberry32)
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
      core/           # ClientGame, InputManager (click-and-hold Diablo-style)
      camera/         # IsometricCamera
      entities/       # ClientPlayer, ClientEnemy (GLB models + animations), CharacterAssetLoader
      dungeon/        # DungeonRenderer, FloorAssetLoader, WallAssetLoader
      systems/        # WallOcclusionSystem, FogOfWarSystem
      i18n/           # i18next config + locales (en.json)
      ui/             # HUD: hudStore (pub-sub state) + HudRoot (React + Tailwind)
      main.ts         # Client entry point
    public/
      models/
        characters/
          player/       # survivorMaleB skin: idle.glb, run.glb
          zombie/       # zombieA skin: idle.glb, run.glb
    index.html
    vite.config.ts
scripts/                # Blender Python scripts for asset generation
  convert_kenney_fbx.py   # FBX→GLB converter (parameterized: skin + output)
  create_idle_animation.py # Procedural idle animation (arms down + breathing)
  create_run_animation.py  # Procedural walk animation (sagittal leg/arm swing)
assets/
  kenney-characters/      # Source Kenney Animated Characters (FBX + skins)
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

### Internationalization (i18n)

- i18next with `initReactI18next` plugin (no Provider needed)
- Browser language auto-detection via `i18next-browser-languagedetector`
- Locale files: `packages/client/src/i18n/locales/{lang}.json`
- React components: `useTranslation()` hook
- Outside React (ClientGame.ts): standalone `t()` from `i18n/i18n.ts`
- To add a language: create `{lang}.json`, register in `i18n.ts` resources

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
- React/react-dom aliased to `packages/client/node_modules/` to prevent duplicate instances in monorepo

## Implemented Files

### Shared (`packages/shared/src/`)

- `Constants.ts` — All game constants: TILE*SIZE, PLAYER*\_, ENEMY\__, CAMERA*\*, DUNGEON*_, WALL\_\_, lighting (AMBIENT/TORCH/WALL_TORCH), fog of war
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

- `main.ts` — Entry point: loads CSS, inits i18n, creates ClientGame
- `core/ClientGame.ts` — Colyseus client, state listeners, render loop, two CharacterAssetLoaders (player + enemy), shadow casters
- `core/InputManager.ts` — Diablo-style click-and-hold: pointerdown/pointerup + throttled MOVE sends (150ms)
- `camera/IsometricCamera.ts` — ArcRotateCamera with locked Diablo-style angles, radius 15
- `entities/CharacterAssetLoader.ts` — Loads GLB character models per skin (basePath), instantiates with retargeted animations
- `entities/ClientPlayer.ts` — GLB character model + SpotLight torch + ShadowGenerator PCF + lerp interpolation + idle/run animations
- `entities/ClientEnemy.ts` — GLB zombie model + lerp + hit flash (baseMaterials swap) + idle/run animations + floating health bar
- `dungeon/DungeonRenderer.ts` — GLB floor tiles, thin wall segments, GLB wall decorations, wall torch PointLights + fire ParticleSystems
- `dungeon/FloorAssetLoader.ts` — Loads floor tile GLBs per set, GPU-efficient instancing via AssetContainer
- `dungeon/WallAssetLoader.ts` — Loads wall decoration GLBs per set, places on wall faces (N/S/W/E), auto-scales to TILE_SIZE × WALL_HEIGHT
- `systems/WallOcclusionSystem.ts` — Diablo-style wall transparency + wall decoration toggling (Set-based tracking)
- `systems/FogOfWarSystem.ts` — PostProcess depth-based shader: radial darkness around player (inner/outer radius)
- `i18n/i18n.ts` — i18next initialization: LanguageDetector + initReactI18next, standalone t() export
- `i18n/locales/en.json` — English translations (13 strings: party, connection, player, HUD)
- `ui/hudStore.ts` — HUD pub-sub store: party members, FPS, ping, connection status; React root lifecycle
- `ui/HudRoot.tsx` — React + Tailwind component: party health bars, FPS, ping, connection status (i18n)
- `index.html` — Fullscreen canvas + HUD overlay
- `vite.config.ts` — WASM exclusion, React alias for monorepo dedup
