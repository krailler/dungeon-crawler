# Testing Guide

## Overview

KrawlHero uses **Bun's built-in test runner** (`bun test`) for all tests. No external test framework needed — Bun provides `describe`, `it`, `expect`, `beforeEach`, `mock` with Jest-compatible API.

**Current stats**: 729 tests, 89% line coverage, <9s execution.

## Running Tests

```bash
# All tests
npm test                     # or: NODE_ENV=test bun test --recursive

# With coverage report
npm run test:coverage        # or: NODE_ENV=test bun test --recursive --coverage

# By package
npm run test:shared          # shared package only
npm run test:server          # server package only

# Single file
NODE_ENV=test bun test packages/server/tests/AISystem.test.ts
```

`NODE_ENV=test` silences Pino logger output during tests.

## Test Structure

```
packages/
  shared/
    tests/                    # Unit tests for pure shared functions
      Stats.test.ts
      Economy.test.ts
      Leveling.test.ts
      math.test.ts
      CreatureTypes.test.ts
      TileMap.test.ts
      random.test.ts
      Effects.test.ts
      Talents.test.ts
      Items.test.ts
      Classes.test.ts
  server/
    tests/                    # Unit + integration tests for server
      helpers/
        testSetup.ts          # DB/registry mocks for integration tests
      # Unit tests (no Colyseus, no DB)
      RateLimiter.test.ts
      Pathfinder.test.ts
      DungeonGenerator.test.ts
      LootRoller.test.ts
      ItemInstanceRegistry.test.ts
      CommandRegistry.test.ts
      activeSessionRegistry.test.ts
      reconnectionRegistry.test.ts
      PlayerState.test.ts
      CreatureState.test.ts
      EffectHandlers.test.ts
      EffectSystem.test.ts
      CombatSystem.test.ts
      AISystem.test.ts
      GameLoop.test.ts
      GateSystem.test.ts
      QuestSystem.test.ts
      ChatSystem.test.ts
      commands.test.ts
      PlayerSessionManager.test.ts
      # Integration tests (Colyseus @colyseus/testing)
      DungeonRoom.integration.test.ts
```

## Test Types

### 1. Shared Package Tests (pure functions)

No mocks, no setup. Import function, call it, assert result.

```typescript
import { describe, it, expect } from "bun:test";
import { computeDamage } from "../src/Stats.js";

describe("computeDamage", () => {
  it("returns minimum 1 damage", () => {
    expect(computeDamage(5, 100)).toBe(1);
  });
});
```

### 2. Server Unit Tests (with mocked registries)

Systems like CombatSystem, AISystem, EffectSystem depend on global registries (getSkillDef, getEffectDef, etc.) which load from DB. Mock these modules before importing:

```typescript
import { mock } from "bun:test";
import { resolve } from "path";

const SRC = resolve(import.meta.dir, "../src");
const m = (rel: string) => resolve(SRC, rel);

// Mock BEFORE importing the module under test
mock.module(m("effects/EffectRegistry"), () => ({
  getEffectDef: (id: string) => (id === "weakness" ? MOCK_WEAKNESS_DEF : undefined),
}));
mock.module(m("effects/EffectRegistry.ts"), () => ({
  /* same */
}));

// NOW import
import { EffectSystem } from "../src/systems/EffectSystem.js";
```

**Important**: Bun resolves imports to absolute paths. Mock both the extensionless AND `.ts` variants to ensure the mock is applied regardless of how the module is imported internally.

### 3. Integration Tests (@colyseus/testing)

Full room lifecycle tests using `@colyseus/testing`. A `TestDungeonRoom` subclass bypasses JWT auth and DB lookups.

```typescript
import "./helpers/testSetup";  // Must be first — mocks DB + registries

import { ColyseusTestServer, boot } from "@colyseus/testing";
import { Server } from "colyseus";

// TestDungeonRoom: overrides onAuth to return hardcoded data
class TestDungeonRoom extends DungeonRoom {
  async onAuth(_client, options, _context) {
    return { accountId: options.accountId, characterName: "Test", ... };
  }
}

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  const server = new Server();
  server.define("dungeon", TestDungeonRoom);
  colyseus = await boot(server);
});

it("player joins", async () => {
  const room = await colyseus.createRoom("dungeon", {});
  const client = await colyseus.connectTo(room, { accountId: "test-1" });
  await room.waitForNextPatch();
  expect(room.state.players.size).toBe(1);
});
```

**testSetup.ts** mocks:

- `db/database` — chainable proxy returning `[]` for all queries
- `db/schema` — proxy table references
- All registries (ItemRegistry, SkillRegistry, EffectRegistry, CreatureTypeRegistry, ClassRegistry, TalentRegistry)
- `items/ItemInstanceRegistry` — in-memory cache (no DB writes)
- `auth/authConfig` — noop (skips JWT callback registration)
- `console.warn` filter for "@colyseus/sdk: onMessage() not registered" noise

## Writing New Tests

### When to add tests

- New pure function in shared → add to existing test file or create new one
- New system/module in server → create `packages/server/tests/YourModule.test.ts`
- New message handler in DungeonRoom → add integration test in `DungeonRoom.integration.test.ts`
- Bug fix → add a test that reproduces the bug before fixing

### Conventions

- File naming: `ModuleName.test.ts` (PascalCase matching source)
- Integration tests: `ModuleName.integration.test.ts`
- Use `beforeEach` for fresh state per test
- Use `toBeCloseTo(value, digits)` for float comparisons
- ESM imports: use `.js` extension (`import from "../src/Stats.js"`)
- Mock registries with absolute paths via `resolve(import.meta.dir, "../src")`

### Coverage targets

| Area                                                         | Target | Current |
| ------------------------------------------------------------ | ------ | ------- |
| Shared package                                               | 100%   | ~99%    |
| Server systems (AI, Combat, Effect, GameLoop, Gate, Quest)   | 100%   | 100%    |
| Server state (PlayerState, CreatureState)                    | >95%   | ~99%    |
| Server utilities (Pathfinder, LootRoller, RateLimiter, etc.) | 100%   | 100%    |
| Server chat (ChatSystem, CommandRegistry, commands)          | >95%   | ~100%   |
| Server rooms (PlayerSessionManager)                          | >90%   | ~95%    |
| DungeonRoom (integration)                                    | >75%   | ~80%    |
| **Global**                                                   | >85%   | **89%** |

## Known Limitations

### What's NOT covered (and why)

- **DungeonRoom.onAuth()**: Bypassed by TestDungeonRoom. Requires real JWT + DB.
- **SKILL_USE deep paths**: Need registry mocks returning real SkillDefs (buff/AoE/single-target processing).
- **DB load internals** (PlayerSessionManager loadInventory/loadEquipment): Mock DB returns `[]`, so row-processing loops don't execute.
- **scheduleReconnectTimers expiry**: Uses native `setTimeout` with 300s delay. Impractical without fake timers.
- **createRegistry.ts**: DB infrastructure, not game logic.
- **Client code**: No tests (Babylon.js + React requires DOM mocking, low ROI).

### Future improvements

- **Fake timers**: Use Bun fake timers (when available) to test reconnection timeout flows.
- **Rich DB mocks**: Return actual row data to cover inventory/equipment loading paths.
- **Skill registry mocks**: Return real SkillDefs to test SKILL_USE buff/AoE/single-target paths.
- **CI/CD**: Add GitHub Actions workflow to run tests on push/PR.
