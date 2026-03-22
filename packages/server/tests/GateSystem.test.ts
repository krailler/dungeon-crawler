import { describe, it, expect, beforeEach, mock } from "bun:test";
import { resolve } from "path";
import {
  TILE_SIZE,
  INTERACT_RANGE,
  GATE_COUNTDOWN_SECONDS,
  GateType,
  MessageType,
  TutorialStep,
} from "@dungeon/shared";

// ── Module mocks (before importing GateSystem) ─────────────────────────────

const SRC = resolve(import.meta.dir, "../src");
const m = (rel: string) => resolve(SRC, rel);

const noopLogger: any = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  child: () => noopLogger,
};
const loggerMock = () => ({
  logger: noopLogger,
  createRoomLogger: () => noopLogger,
  pid: (s: string) => s.slice(0, 6),
});
mock.module(m("logger"), loggerMock);
mock.module(m("logger.js"), loggerMock);
mock.module(m("logger.ts"), loggerMock);

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { GateSystem } from "../src/systems/GateSystem.js";

// ── Helpers ────────────────────────────────────────────────────────────────

interface MockGate {
  gateType: string;
  open: boolean;
  tileX: number;
  tileY: number;
}

interface MockPlayer {
  isLeader: boolean;
  x: number;
  z: number;
  characterName: string;
  online: boolean;
  health: number;
  tutorialsCompleted: Set<string>;
}

function makeGate(overrides: Partial<MockGate> = {}): MockGate {
  return {
    gateType: GateType.LOBBY,
    open: false,
    tileX: 5,
    tileY: 5,
    ...overrides,
  };
}

function makePlayer(overrides: Partial<MockPlayer> = {}): MockPlayer {
  return {
    isLeader: true,
    // Default position: right on the gate (tileX=5, tileY=5 => world 10,10)
    x: 5 * TILE_SIZE,
    z: 5 * TILE_SIZE,
    characterName: "TestLeader",
    online: true,
    health: 100,
    tutorialsCompleted: new Set(),
    ...overrides,
  };
}

function makeClient(sessionId = "session-abc123") {
  return { sessionId } as any;
}

/** Map-like object that also supports forEach (mimics Colyseus MapSchema). */
function makeMapSchema<T>(entries: [string, T][] = []): any {
  const map = new Map<string, T>(entries);
  return {
    get: (key: string) => map.get(key),
    set: (key: string, val: T) => map.set(key, val),
    has: (key: string) => map.has(key),
    delete: (key: string) => map.delete(key),
    forEach: (cb: (val: T, key: string) => void) => map.forEach(cb),
    get size() {
      return map.size;
    },
  };
}

interface TimerHandle {
  fn: () => void;
  ms: number;
  clear: () => void;
}

function makeDeps() {
  const lobbyGate = makeGate({ gateType: GateType.LOBBY });
  const lobbyGate2 = makeGate({ gateType: GateType.LOBBY, tileX: 6, tileY: 6 });
  const normalGate = makeGate({ gateType: "door", tileX: 8, tileY: 8 });

  const gates = makeMapSchema<MockGate>([
    ["lobby1", lobbyGate],
    ["lobby2", lobbyGate2],
    ["door1", normalGate],
  ]);

  const player1 = makePlayer();
  const players = makeMapSchema<MockPlayer>([["session-abc123", player1]]);

  const state = { gates, players, dungeonLevel: 1 } as any;

  const timers: TimerHandle[] = [];
  const mockClock = {
    setTimeout: (fn: () => void, ms: number) => {
      const timer: TimerHandle = {
        fn,
        ms,
        clear: mock(() => {}),
      };
      timers.push(timer);
      return timer;
    },
  };

  const sendToClient = mock(() => {});
  const onLobbyGatesOpened = mock(() => {});

  const chatSystem = {
    sendToClientI18n: mock(() => {}),
    broadcastAnnouncement: mock(() => {}),
  };

  const pathfinder = {
    unblockTile: mock(() => {}),
  };

  return {
    state,
    pathfinder: pathfinder as any,
    chatSystem: chatSystem as any,
    clock: mockClock as any,
    log: noopLogger,
    sendToClient,
    onLobbyGatesOpened,
    timers,
    // direct references for assertions
    lobbyGate,
    lobbyGate2,
    normalGate,
    player1,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("GateSystem", () => {
  let deps: ReturnType<typeof makeDeps>;
  let system: GateSystem;

  beforeEach(() => {
    deps = makeDeps();
    system = new GateSystem(deps);
  });

  // ── reset() ────────────────────────────────────────────────────────────

  describe("reset()", () => {
    it("clears pending timers", () => {
      // Trigger a lobby interaction to create timers
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });
      expect(deps.timers.length).toBeGreaterThan(0);

      // Reset — all timers should have clear() called
      const timersBefore = [...deps.timers];
      const newDeps = makeDeps();
      system.reset({
        state: newDeps.state,
        pathfinder: newDeps.pathfinder as any,
        chatSystem: newDeps.chatSystem as any,
        onLobbyGatesOpened: newDeps.onLobbyGatesOpened,
      });

      for (const t of timersBefore) {
        expect(t.clear).toHaveBeenCalled();
      }
    });

    it("clears gate countdowns so a new lobby interact works", () => {
      const client = makeClient();
      // Start a countdown
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      // Reset with fresh deps
      const newDeps = makeDeps();
      system.reset({
        state: newDeps.state,
        pathfinder: newDeps.pathfinder as any,
        chatSystem: newDeps.chatSystem as any,
        onLobbyGatesOpened: newDeps.onLobbyGatesOpened,
      });

      // After reset, interacting with a new lobby gate should work (not be ignored)
      const newPlayer = makePlayer();
      (newDeps.state.players as any).set("session-abc123", newPlayer);
      system.handleInteract(client, newPlayer as any, { gateId: "lobby1" });

      // broadcastAnnouncement should have been called on the NEW chatSystem
      expect(newDeps.chatSystem.broadcastAnnouncement).toHaveBeenCalled();
    });
  });

  // ── handleInteract - validation ────────────────────────────────────────

  describe("handleInteract - validation", () => {
    it("returns early if gate not found", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "nonexistent" });

      expect(deps.chatSystem.sendToClientI18n).not.toHaveBeenCalled();
      expect(deps.chatSystem.broadcastAnnouncement).not.toHaveBeenCalled();
      expect(deps.pathfinder.unblockTile).not.toHaveBeenCalled();
    });

    it("returns early if gate already open", () => {
      deps.lobbyGate.open = true;
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      expect(deps.chatSystem.broadcastAnnouncement).not.toHaveBeenCalled();
    });

    it("returns early and sends error if lobby gate and player is not leader", () => {
      deps.player1.isLeader = false;
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      expect(deps.chatSystem.sendToClientI18n).toHaveBeenCalledWith(
        client,
        "message",
        "chat.gateLeaderOnly",
        {},
        expect.any(String),
        "error",
      );
      expect(deps.chatSystem.broadcastAnnouncement).not.toHaveBeenCalled();
    });

    it("returns early if another lobby countdown is already running", () => {
      const client = makeClient();
      // Start first countdown
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });
      const callCount = (deps.chatSystem.broadcastAnnouncement as any).mock.calls.length;

      // Second interact should be ignored
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby2" });
      expect((deps.chatSystem.broadcastAnnouncement as any).mock.calls.length).toBe(callCount);
    });

    it("returns early if player is out of range", () => {
      // Move player far away from gate at tile (5,5) => world (10,10)
      deps.player1.x = 100;
      deps.player1.z = 100;
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      expect(deps.chatSystem.broadcastAnnouncement).not.toHaveBeenCalled();
    });

    it("allows interaction when player is exactly at interact range boundary", () => {
      // Place player just within range
      const gateWX = 5 * TILE_SIZE;
      const gateWZ = 5 * TILE_SIZE;
      // Place at distance slightly less than INTERACT_RANGE
      deps.player1.x = gateWX + INTERACT_RANGE * 0.99;
      deps.player1.z = gateWZ;
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      expect(deps.chatSystem.broadcastAnnouncement).toHaveBeenCalled();
    });
  });

  // ── handleInteract - non-lobby gate ────────────────────────────────────

  describe("handleInteract - non-lobby gate", () => {
    it("opens immediately", () => {
      // Position player near the door gate at tile (8,8) => world (16,16)
      deps.player1.x = 8 * TILE_SIZE;
      deps.player1.z = 8 * TILE_SIZE;
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "door1" });

      expect(deps.normalGate.open).toBe(true);
    });

    it("unblocks tile via pathfinder", () => {
      deps.player1.x = 8 * TILE_SIZE;
      deps.player1.z = 8 * TILE_SIZE;
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "door1" });

      expect(deps.pathfinder.unblockTile).toHaveBeenCalledWith(8, 8);
    });

    it("does not require player to be leader", () => {
      deps.player1.isLeader = false;
      deps.player1.x = 8 * TILE_SIZE;
      deps.player1.z = 8 * TILE_SIZE;
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "door1" });

      expect(deps.normalGate.open).toBe(true);
    });
  });

  // ── handleInteract - lobby gate ────────────────────────────────────────

  describe("handleInteract - lobby gate", () => {
    it("broadcasts initial announcement with leader name and countdown seconds", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      expect(deps.chatSystem.broadcastAnnouncement).toHaveBeenCalledWith(
        "announce.gateCountdownStart",
        { name: "TestLeader", seconds: GATE_COUNTDOWN_SECONDS },
        expect.any(String),
      );
    });

    it("schedules countdown timers for each intermediate second", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      // Should have (GATE_COUNTDOWN_SECONDS - 1) countdown timers + 1 open timer
      // Total = GATE_COUNTDOWN_SECONDS timers
      expect(deps.timers.length).toBe(GATE_COUNTDOWN_SECONDS);

      // Countdown timers should be at 1s, 2s, ..., (COUNTDOWN-1)s intervals
      const countdownTimers = deps.timers.slice(0, GATE_COUNTDOWN_SECONDS - 1);
      for (let i = 0; i < countdownTimers.length; i++) {
        expect(countdownTimers[i].ms).toBe((i + 1) * 1000);
      }
    });

    it("countdown timer broadcasts announcement when fired", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      // Reset to count only countdown-triggered calls
      (deps.chatSystem.broadcastAnnouncement as any).mockClear();

      // Fire the first countdown timer (should announce COUNTDOWN - 1 seconds)
      deps.timers[0].fn();

      expect(deps.chatSystem.broadcastAnnouncement).toHaveBeenCalledWith(
        "announce.gateCountdownStart",
        { name: "TestLeader", seconds: GATE_COUNTDOWN_SECONDS - 1 },
        expect.any(String),
      );
    });

    it("countdown timer skips if gate already open", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      // Force the gate open (simulates reset or external open)
      deps.lobbyGate.open = true;
      (deps.chatSystem.broadcastAnnouncement as any).mockClear();

      // Fire a countdown timer — should bail out
      deps.timers[0].fn();
      expect(deps.chatSystem.broadcastAnnouncement).not.toHaveBeenCalled();
    });

    it("open timer opens all lobby gates and unblocks tiles", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      // The last timer is the open timer
      const openTimer = deps.timers[deps.timers.length - 1];
      expect(openTimer.ms).toBe(GATE_COUNTDOWN_SECONDS * 1000);

      openTimer.fn();

      expect(deps.lobbyGate.open).toBe(true);
      expect(deps.lobbyGate2.open).toBe(true);
      expect(deps.pathfinder.unblockTile).toHaveBeenCalledWith(5, 5);
      expect(deps.pathfinder.unblockTile).toHaveBeenCalledWith(6, 6);
    });

    it("open timer does not open non-lobby gates", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      const openTimer = deps.timers[deps.timers.length - 1];
      openTimer.fn();

      expect(deps.normalGate.open).toBe(false);
    });

    it("open timer calls onLobbyGatesOpened callback", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      const openTimer = deps.timers[deps.timers.length - 1];
      openTimer.fn();

      expect(deps.onLobbyGatesOpened).toHaveBeenCalled();
    });

    it("open timer skips if gate already open", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      deps.lobbyGate.open = true;
      (deps.chatSystem.broadcastAnnouncement as any).mockClear();

      const openTimer = deps.timers[deps.timers.length - 1];
      openTimer.fn();

      // Should not broadcast "gate opened" announcement
      expect(deps.chatSystem.broadcastAnnouncement).not.toHaveBeenCalled();
      expect(deps.onLobbyGatesOpened).not.toHaveBeenCalled();
    });

    it("sends sprint tutorial to online players who have not completed it", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      const timerCountBefore = deps.timers.length;

      // Fire the open timer (last one before opening)
      const openTimer = deps.timers[timerCountBefore - 1];
      openTimer.fn();

      // After openAllLobbyGates, a tutorial timer is appended
      const tutorialTimer = deps.timers[deps.timers.length - 1];
      expect(tutorialTimer).toBeDefined();
      expect(tutorialTimer.ms).toBe(5000);

      tutorialTimer.fn();

      expect(deps.sendToClient).toHaveBeenCalledWith("session-abc123", MessageType.TUTORIAL_HINT, {
        step: TutorialStep.SPRINT,
        i18nKey: "tutorial.sprint",
      });
    });

    it("skips sprint tutorial for players who already completed it", () => {
      deps.player1.tutorialsCompleted.add(TutorialStep.SPRINT);
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      const timerCountBefore = deps.timers.length;
      const openTimer = deps.timers[timerCountBefore - 1];
      openTimer.fn();
      const tutorialTimer = deps.timers[deps.timers.length - 1];
      tutorialTimer.fn();

      expect(deps.sendToClient).not.toHaveBeenCalled();
    });

    it("skips sprint tutorial for offline or dead players", () => {
      deps.player1.online = false;
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      const timerCountBefore = deps.timers.length;
      const openTimer = deps.timers[timerCountBefore - 1];
      openTimer.fn();
      const tutorialTimer = deps.timers[deps.timers.length - 1];
      tutorialTimer.fn();

      expect(deps.sendToClient).not.toHaveBeenCalled();

      // Also test dead player (health <= 0)
      deps.player1.online = true;
      deps.player1.health = 0;
      tutorialTimer.fn();
      expect(deps.sendToClient).not.toHaveBeenCalled();
    });

    it("uses sessionId prefix as fallback when characterName is empty", () => {
      deps.player1.characterName = "";
      const client = makeClient("session-abc123");
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      expect(deps.chatSystem.broadcastAnnouncement).toHaveBeenCalledWith(
        "announce.gateCountdownStart",
        { name: "sessio", seconds: GATE_COUNTDOWN_SECONDS },
        expect.any(String),
      );
    });

    it("broadcasts gate opened announcement after countdown completes", () => {
      const client = makeClient();
      system.handleInteract(client, deps.player1 as any, { gateId: "lobby1" });

      const openTimer = deps.timers[deps.timers.length - 1];
      openTimer.fn();

      expect(deps.chatSystem.broadcastAnnouncement).toHaveBeenCalledWith(
        "announce.gateOpened",
        {},
        expect.any(String),
      );
    });
  });
});
