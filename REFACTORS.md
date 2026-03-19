# Pending Refactors

## Extract shared `attachModel` logic

**Files:** `ClientPlayer.ts`, `ClientCreature.ts`

Both `attachModel()` methods perform near-identical setup:

1. Store `modelRoot` + `modelMeshes`, parent to anchor, set scale
2. Fix PBR materials (alpha=1, opaque, backFaceCulling, emissiveIntensity cap at 0.4)
3. Create invisible hitbox cylinder with pickType metadata
4. Call `animController.startIdle()`

**Differences:**

- `pickType`: `"player"` vs `"creature"`
- Player resets `modelRoot.position.setAll(0)`
- Player adds shadow casters

**Proposed solution:** Extract a shared helper function (e.g. `setupCharacterModel()`) that handles material fix + hitbox creation, parameterized by `pickType` and `pickId`. Keep entity-specific logic (shadows, position reset) in each class.

## Use shared `healthColor` utility in ClientCreature

**Files:** `ClientCreature.ts`, `ui/components/healthColor.ts`

`ClientCreature.updateHealthBar()` hardcodes the same 60%/30% color thresholds that already exist in the shared `healthColor` utility. Should reuse the shared function instead.

## Consolidate movement code (server)

**Files:** `AISystem.ts:moveCreature()`, `GameLoop.ts:moveEntity()`

70% identical waypoint traversal logic. Key differences:

- GameLoop supports multi-waypoint traversal in one frame (while loop)
- AISystem processes one waypoint per tick
- Sprint multiplier only on player side

**Proposed solution:** Extract base `moveAlongPath()` to `packages/server/src/systems/Movement.ts`, parameterize waypoint threshold, speed multiplier, and multi-waypoint mode.

## Use `distSq()` utility across server systems

**Files:** `AISystem.ts`, `GameLoop.ts`, `CombatSystem.ts`

The `distSq()` function was added to `@dungeon/shared/math.ts` but is not yet used in server systems that calculate inline squared distances. Replace inline calculations with the shared utility for consistency.

## Native desktop client (Electron)

Wrap the web client in Electron for a native desktop experience:

- **Fullscreen without Escape exit** — full control over key behavior
- **Better GPU performance** — less browser sandbox overhead
- **Gamepad/joystick support** — native hardware access
- **Auto-updates** — ship new versions seamlessly
- **Distribution** — .app (macOS), .exe (Windows), .AppImage (Linux)

Use Electron over Tauri to guarantee Chromium rendering (same engine as development). Tauri uses the OS WebView which could render Babylon.js differently.
