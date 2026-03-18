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
