# Dungeon Crawler - Project Guide

## Tech Stack

- **3D Engine**: Babylon.js 8.x
- **Language**: TypeScript 5.9 (strict mode)
- **Bundler**: Vite 8.x
- **Pathfinding**: recast-detour (WASM, navmesh)
- **UI**: HTML/CSS overlay for HUD, Babylon.js GUI only for in-world UI (floating bars)

## Commands

```bash
npm run dev      # Dev server with HMR
npm run build    # Production build
npm run preview  # Preview production build
```

## Project Structure

```
src/
  core/           # Game loop, input, asset loading
  camera/         # Isometric camera
  entities/       # Player, Enemy, Entity base
  components/     # HealthComponent, CombatStats, Movement
  systems/        # MovementSystem, CombatSystem, AISystem
  dungeon/        # Procedural generator, TileMap, renderer
  navigation/     # NavMesh wrapper (RecastJSPlugin)
  ui/             # HUD HTML overlay
  lighting/       # Dungeon lighting
  utils/          # Constants, helpers
  main.ts         # Entry point
public/assets/    # Models, textures, sounds
```

## Architectural Decisions

### Engine: Babylon.js (not Three.js)
- Built-in physics, GUI, collisions, particles
- Native TypeScript
- Better suited for games vs Three.js which is more general-purpose

### Entity pattern: Hybrid (not pure ECS)
- Classes: Entity (base) -> Player, Enemy
- Components as attached data: HealthComponent, CombatStatsComponent, MovementComponent
- Systems process logic each frame: MovementSystem, CombatSystem, AISystem
- Pure ECS is overkill for MVP with ~3 entity types

### Camera: ArcRotateCamera in perspective mode
- alpha = -PI/4 (45° diagonal view)
- beta = PI/3 (60° from zenith = 30° above horizon)
- radius = 25, zoom range 20-30
- Locked angles, no panning — follows player with lerp

### Physics: Custom (not Havok)
- Distance-based collisions + navmesh clamping
- Havok adds ~2MB WASM with no benefit for this genre
- NavMesh prevents walking through walls

### Dungeons: Procedural tile-based generation
- 2D grid with TileType (WALL, FLOOR, DOOR, SPAWN, EXIT)
- Algorithm: random room placement + L-shaped corridors
- DungeonRenderer converts tiles to 3D meshes (boxes)
- TILE_SIZE = 2 world units

### Pathfinding: Grid-based A* on TileMap
- Custom A* implementation on the 2D tile grid (8-directional with diagonal wall check)
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
- Constants in UPPER_SNAKE_CASE in Constants.ts
- One file per class/component
- No `enum` keyword — use `as const` objects + type union (tsconfig `erasableSyntaxOnly`)
- No constructor parameter properties (`private x: T`) — declare fields explicitly

## Vite Configuration

- `recast-detour` excluded from optimizeDeps (WASM)
- `.wasm` included in assetsInclude

## Current MVP Status

- [x] Phase 0: Project setup + documentation + base scene
- [x] Phase 1: Dungeon generation (DungeonGenerator + DungeonRenderer)
- [x] Phase 2: Player with click-to-move (Player + A* Pathfinder + Input)
- [ ] Phase 3: Enemies with basic AI (Enemy + AISystem)
- [ ] Phase 4: Combat system + functional HUD (CombatSystem + damage)
- [ ] Phase 5: Polish (dynamic lighting, particles, sound)

## Implemented Files

- `src/main.ts` — Entry point, creates Game
- `src/core/Game.ts` — Engine + Scene + render loop + game loop + dungeon + player
- `src/camera/IsometricCamera.ts` — ArcRotateCamera with locked Diablo-style angles
- `src/utils/Constants.ts` — Tuning constants (tile size, camera, player stats)
- `src/dungeon/TileMap.ts` — 2D grid data structure + TileType const object
- `src/dungeon/DungeonGenerator.ts` — Random room placement + L-shaped corridors
- `src/dungeon/DungeonRenderer.ts` — Converts TileMap to 3D floor/wall meshes
- `src/entities/Player.ts` — Player mesh (cylinder+sphere), path following, rotation
- `src/core/InputManager.ts` — Click-on-floor raycasting via scene.pick()
- `src/navigation/Pathfinder.ts` — A* pathfinding on TileMap grid (8-directional)
- `src/systems/WallOcclusionSystem.ts` — Diablo-style wall transparency (fades walls between camera and player)
- `index.html` — Fullscreen canvas + HUD overlay (health bar)
- `vite.config.ts` — WASM exclusion for recast-detour
