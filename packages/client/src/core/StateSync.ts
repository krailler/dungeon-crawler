import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Room } from "@colyseus/sdk";
import { getStateCallbacks } from "@colyseus/sdk";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";

import { IsometricCamera } from "../camera/IsometricCamera";
import { DungeonRenderer } from "../dungeon/DungeonRenderer";
import { ClientPlayer } from "../entities/ClientPlayer";
import { ClientCreature } from "../entities/ClientCreature";
import { ClientLootBag } from "../entities/ClientLootBag";
import { CharacterAssetLoader } from "../entities/CharacterAssetLoader";
import { InputManager } from "./InputManager";
import { WallOcclusionSystem } from "../systems/WallOcclusionSystem";
import { FogOfWarSystem } from "../systems/FogOfWarSystem";
import type { SoundManager } from "../audio/SoundManager";
import { hudStore } from "../ui/stores/hudStore";
import { itemDefStore } from "../ui/stores/itemDefStore";
import { adminStore } from "../ui/stores/adminStore";
import { authStore } from "../ui/stores/authStore";
import { gateStore } from "../ui/stores/gateStore";
import { lootBagStore } from "../ui/stores/lootBagStore";
import { tutorialStore } from "../ui/stores/tutorialStore";
import { promptStore } from "../ui/stores/promptStore";
import { minimapStore } from "../ui/stores/minimapStore";
import { loadingStore, LoadingPhase } from "../ui/stores/loadingStore";
import {
  TileMap,
  unpackSetId,
  tileSetNameFromId,
  MessageType,
  GateType,
  INTERACT_RANGE,
  TutorialStep,
} from "@dungeon/shared";
import { t } from "../i18n/i18n";
import type { SkillCooldownMessage, AdminDebugInfoMessage } from "@dungeon/shared";

export interface StateSyncDeps {
  readonly scene: Scene;
  readonly isoCamera: IsometricCamera;
  readonly dungeonRenderer: DungeonRenderer;
  readonly playerLoader: CharacterAssetLoader;
  readonly creatureLoader: CharacterAssetLoader;
  readonly soundManager: SoundManager;
  readonly fogOfWar: FogOfWarSystem;
  readonly guiTexture: AdvancedDynamicTexture;
  addShadowCaster(mesh: AbstractMesh): void;
  onDungeonReady(): void;
}

export class StateSync {
  players: Map<string, ClientPlayer> = new Map();
  creatures: Map<string, ClientCreature> = new Map();
  lootBags: Map<string, ClientLootBag> = new Map();
  inputManager: InputManager | null = null;
  wallOcclusion: WallOcclusionSystem | null = null;
  localSessionId: string = "";

  private deps: StateSyncDeps;
  /** Colyseus state listener unsubscribe callbacks — cleaned up on dispose/restart */
  private stateListeners: (() => void)[] = [];

  constructor(deps: StateSyncDeps) {
    this.deps = deps;
  }

  setup(room: Room, localSessionId: string): void {
    this.localSessionId = localSessionId;

    // Clean up any previous state listeners (e.g. from a prior setup before full dispose)
    this.cleanupStateListeners();

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const $ = getStateCallbacks(room as any) as any;
    const state$ = $(room.state);
    /** Helper to track listener unsubscribe callbacks */
    const track = <T>(unsub: T): T => {
      if (typeof unsub === "function") this.stateListeners.push(unsub as () => void);
      return unsub;
    };

    // Listen for skill cooldown messages from server
    room.onMessage(MessageType.SKILL_COOLDOWN, (data: SkillCooldownMessage) => {
      hudStore.setSkillCooldown(data.skillId, data.duration);
    });

    // Admin debug info (seed, tick rate, runtime) — sent only to admin clients
    room.onMessage(MessageType.ADMIN_DEBUG_INFO, (data: AdminDebugInfoMessage) => {
      adminStore.setDebugInfo(data);
    });

    // Gate state listeners (MapSchema<GateState>)
    // NOTE: onAdd fires for initial state BEFORE the async dungeon render completes,
    // so we only track data in stores here. Mesh placement happens after render()
    // inside the dungeonVersion listener, which iterates room.state.gates explicitly.
    track(
      state$.gates.onAdd((gate: any, gateId: string) => {
        const tileX = gate.tileX as number;
        const tileY = gate.tileY as number;
        const open = gate.open as boolean;
        const gateType = (gate.gateType as string) || GateType.LOBBY;

        gateStore.addGate(gateId, gateType, tileX, tileY, open);
        minimapStore.addGatePosition(gateId, tileX, tileY);

        // Listen for changes on this gate (open/close)
        $(gate).onChange(() => {
          const nowOpen = gate.open as boolean;
          gateStore.setGateOpen(gateId, nowOpen);
          if (nowOpen) {
            this.deps.dungeonRenderer.openGateById(gateId);
            this.deps.soundManager.playSfx("gate_open");
          }
        });
      }),
    );

    track(
      state$.gates.onRemove((_gate: any, gateId: string) => {
        gateStore.removeGate(gateId);
        minimapStore.removeGatePosition(gateId);
        this.deps.dungeonRenderer.removeGate(gateId);
      }),
    );

    // Listen for room name / dungeon level changes (fires on join and every restart)
    track(
      state$.listen("roomName", (name: string) => {
        hudStore.setRoomName(name);
      }),
    );
    track(
      state$.listen("dungeonLevel", (level: number) => {
        hudStore.setDungeonLevel(level);
      }),
    );

    // Seed current values (listen may not fire if already set before registration)
    const state = room.state as any;
    if (state.roomName) hudStore.setRoomName(state.roomName);
    if (state.dungeonLevel) hudStore.setDungeonLevel(state.dungeonLevel);

    // Listen for dungeon version (fires on join and every restart, even same-seed)
    track(
      state$.listen("dungeonVersion", () => {
        const tileMapData = (room.state as any).tileMapData as string;
        if (!tileMapData) return;

        // If loading screen already dismissed, this is a restart — re-show it
        const isRestart = !loadingStore.getSnapshot().visible;
        if (isRestart) {
          loadingStore.reset();
          loadingStore.setPhase(LoadingPhase.DUNGEON_ASSETS);
          // Dispose subsystems that will be recreated after render
          this.inputManager?.dispose();
          this.inputManager = null;
          this.wallOcclusion?.dispose();
          this.wallOcclusion = null;
          // Clean up loot bags (server clears them on restart)
          for (const bag of this.lootBags.values()) bag.dispose();
          this.lootBags.clear();
          lootBagStore.close();
        }

        // Rebuild dungeon — wrapped in a function so we can defer it on restart
        // to let React paint the loading screen before the heavy work blocks the thread
        const rebuildDungeon = (): void => {
          const flat = JSON.parse(tileMapData) as number[];
          const width = (room.state as any).mapWidth;
          const height = (room.state as any).mapHeight;
          const tileMap = TileMap.fromSerialized(width, height, flat);
          minimapStore.setTileMap(tileMap);

          // Parse packed floor variant data from server
          const variantRaw = (room.state as any).floorVariantData;
          const floorVariants: number[] = variantRaw ? JSON.parse(variantRaw) : [];

          // Parse packed wall variant data from server
          const wallVariantRaw = (room.state as any).wallVariantData;
          const wallVariants: number[] = wallVariantRaw ? JSON.parse(wallVariantRaw) : [];

          // Scan packed values to find which tile sets are actually used (floors)
          const usedFloorSets = new Set<string>();
          for (const packed of floorVariants) {
            if (packed === 0) continue;
            const setId = unpackSetId(packed);
            const name = tileSetNameFromId(setId);
            if (name) usedFloorSets.add(name);
          }

          // Scan packed values to find which wall tile sets are used
          const usedWallSets = new Set<string>();
          for (const packed of wallVariants) {
            if (packed === 0) continue;
            const setId = unpackSetId(packed);
            const name = tileSetNameFromId(setId);
            if (name) usedWallSets.add(name);
          }

          // Load only the sets this dungeon needs, then render
          const floorSetNames = Array.from(usedFloorSets);
          const wallSetNames = Array.from(usedWallSets);
          console.log("[Client] Loading floor tile sets:", floorSetNames);
          console.log("[Client] Loading wall tile sets:", wallSetNames);
          this.deps.dungeonRenderer.loadAssets(floorSetNames, wallSetNames).then(async () => {
            loadingStore.setPhase(LoadingPhase.DUNGEON_RENDER);
            console.log("[Client] Assets loaded, rendering dungeon");
            this.deps.dungeonRenderer.render(tileMap, floorVariants, wallVariants);

            // Place gate meshes from current state (onAdd already tracked data in stores,
            // but mesh placement must happen after render since render() disposes everything)
            const gates = (room.state as any).gates;
            if (gates) {
              gates.forEach((gate: any, gateId: string) => {
                const open = gate.open as boolean;
                if (!open && gate.tileX >= 0 && gate.tileY >= 0) {
                  this.deps.dungeonRenderer.placeGate(
                    gateId,
                    gate.tileX,
                    gate.tileY,
                    gate.isNS,
                    gate.dir,
                  );
                }
              });
            }

            // Setup input after dungeon renders (sends move commands to server)
            this.inputManager = new InputManager({
              scene: this.deps.scene,
              floorMeshes: this.deps.dungeonRenderer.getFloorMeshes(),
              room,
              interactable: {
                getMeshes: () => [
                  ...this.deps.dungeonRenderer.getInteractableMeshes(),
                  ...Array.from(this.lootBags.values()).map((d) => d.getMesh()),
                ],
                getPlayerPosition: () => {
                  const local = this.players.get(room.sessionId);
                  if (!local) return null;
                  const pos = local.getWorldPosition();
                  return { x: pos.x, z: pos.z };
                },
                range: INTERACT_RANGE,
                onClick: (type, id) => this.handleInteractableClick(room, type, id),
              },
            });

            // Setup wall occlusion (with wall decoration map for toggling)
            this.wallOcclusion = new WallOcclusionSystem(
              this.deps.scene,
              this.deps.isoCamera.camera,
              this.deps.dungeonRenderer.getWallMeshes(),
              this.deps.dungeonRenderer.getWallDecoMap(),
            );

            // Tell fog of war where spawn is (expanded visibility near spawn)
            const spawnPos = this.deps.dungeonRenderer.getSpawnWorldPosition(tileMap);
            if (spawnPos) {
              this.deps.fogOfWar.setSpawnPosition(spawnPos.x, spawnPos.z);
            }

            // Enable shadow receiving on floor meshes
            for (const mesh of this.deps.dungeonRenderer.getFloorMeshes()) {
              mesh.receiveShadows = true;
            }

            // Wait for any pending item def requests before completing load (5s timeout)
            const pendingItemIds = this.getLocalInventoryItemIds(room);
            await Promise.race([
              itemDefStore.ensureLoadedAsync(pendingItemIds).catch((err) => {
                console.error("[StateSync] Failed to load item defs:", err);
              }),
              new Promise<void>((r) => setTimeout(r, 5_000)),
            ]);

            // Loading complete — fade out loading screen
            loadingStore.setPhase(LoadingPhase.COMPLETE);
            loadingStore.startFadeOut();

            this.deps.onDungeonReady();
          });
        };

        if (isRestart) {
          // Yield two frames so React can paint the loading screen before heavy work
          requestAnimationFrame(() => requestAnimationFrame(rebuildDungeon));
        } else {
          rebuildDungeon();
        }
      }),
    );

    // Players added
    track(
      state$.players.onAdd((player: any, sessionId: string) => {
        const isLocal = sessionId === this.localSessionId;
        if (!isLocal) this.deps.soundManager.playSfx("player_join");
        const displayName = player.characterName || sessionId.slice(0, 4).toUpperCase();
        const clientPlayer = new ClientPlayer(
          this.deps.scene,
          isLocal,
          sessionId,
          displayName,
          this.deps.guiTexture,
          this.deps.soundManager,
        );
        clientPlayer.snapToPosition(player.x, player.z);
        clientPlayer.setServerState(player.x, player.z, player.rotY);
        this.players.set(sessionId, clientPlayer);

        if (isLocal) {
          this.deps.isoCamera.camera.target = new Vector3(player.x, 0, player.z);
          // Role is in the private secret state (only visible to owning client)
          if (player.secret) {
            authStore.setRole(player.secret.role);
          }
        }

        // Attach GLB character model
        const charInstance = this.deps.playerLoader.instantiate(`char_${sessionId}`);
        clientPlayer.attachModel(charInstance);

        // Add model meshes as shadow casters for local player's torch
        for (const m of clientPlayer.modelMeshes) {
          this.deps.addShadowCaster(m);
        }

        const name = player.characterName || sessionId.slice(0, 4).toUpperCase();

        // Private data lives in player.secret (only visible to the owning client via @view)
        const secret = isLocal ? player.secret : undefined;
        const localStats = secret
          ? {
              strength: secret.strength,
              vitality: secret.vitality,
              agility: secret.agility,
              attackDamage: secret.attackDamage,
              defense: secret.defense,
            }
          : undefined;
        hudStore.setMember({
          id: sessionId,
          name,
          health: player.health,
          maxHealth: player.maxHealth,
          isLocal,
          online: player.online,
          isLeader: player.isLeader,
          level: player.level,
          // Private fields — only for local player
          ...(secret && {
            gold: secret.gold,
            xp: secret.xp,
            xpToNext: secret.xpToNext,
            statPoints: secret.statPoints,
            stamina: secret.stamina,
            skills: Array.from(secret.skills as Iterable<string>),
            autoAttackEnabled: secret.autoAttackEnabled ?? true,
            stats: localStats,
          }),
        });

        // Local-only listeners: skills, gold, xp/level-up from secret state
        if (isLocal && secret) {
          // Sync skills array — onAdd/onRemove fire when server modifies the ArraySchema
          const syncSkills = (): void => {
            hudStore.updateMember(sessionId, {
              skills: Array.from(secret.skills as Iterable<string>),
            });
          };
          $(secret).skills.onAdd(syncSkills);
          $(secret).skills.onRemove(syncSkills);

          // Sync inventory MapSchema + lazy-fetch unknown item defs
          // Also handles initial inventory on join (onAdd fires for existing items)
          const rebuildInv = this.rebuildInventory.bind(this, sessionId, secret);

          $(secret).inventory.onAdd((slot: any, _key: string) => {
            $(slot).onChange(rebuildInv);
            rebuildInv();
          });
          $(secret).inventory.onRemove(rebuildInv);

          // Track gold changes for pickup sound
          let prevGold = secret.gold as number;

          // Listen to changes on the secret (private) state
          $(secret).onChange(() => {
            // Play gold pickup sound when local player earns gold
            if (secret.gold > prevGold) {
              this.deps.soundManager.playSfx("gold_pickup");
            }
            prevGold = secret.gold;

            hudStore.updateMember(sessionId, {
              gold: secret.gold,
              xp: secret.xp,
              xpToNext: secret.xpToNext,
              statPoints: secret.statPoints,
              stamina: secret.stamina,
              autoAttackEnabled: secret.autoAttackEnabled ?? true,
              stats: {
                strength: secret.strength,
                vitality: secret.vitality,
                agility: secret.agility,
                attackDamage: secret.attackDamage,
                defense: secret.defense,
              },
            });
          });
        }

        // Track level to detect level-up (level is public, visible to all)
        let prevLevel = player.level as number;

        // Listen to changes on public player state
        $(player).onChange(() => {
          clientPlayer.setServerState(
            player.x,
            player.z,
            player.rotY,
            player.animState,
            player.isSprinting,
          );

          // Level-up: sound (local only) + particle aura (all players)
          if (player.level > prevLevel) {
            if (isLocal) {
              this.deps.soundManager.playSfx("level_up");
            }
            clientPlayer.playLevelUpEffect();
          }
          prevLevel = player.level;

          hudStore.updateMember(sessionId, {
            health: player.health,
            maxHealth: player.maxHealth,
            online: player.online,
            isLeader: player.isLeader,
            level: player.level,
          });
        });
      }),
    );

    // Players removed
    track(
      state$.players.onRemove((_player: any, sessionId: string) => {
        if (sessionId !== this.localSessionId) this.deps.soundManager.playSfx("player_leave");
        const clientPlayer = this.players.get(sessionId);
        if (clientPlayer) {
          clientPlayer.dispose();
          this.players.delete(sessionId);
        }
        hudStore.removeMember(sessionId);
        minimapStore.removePlayer(sessionId);
      }),
    );

    // Creatures added
    track(
      state$.creatures.onAdd((creature: any, id: string) => {
        const clientCreature = new ClientCreature(
          this.deps.scene,
          id,
          creature.health,
          this.deps.guiTexture,
          this.deps.soundManager,
        );
        clientCreature.snapToPosition(creature.x, creature.z);
        clientCreature.setLevel(creature.level);
        clientCreature.setServerState(
          creature.x,
          creature.z,
          creature.rotY,
          creature.health,
          creature.maxHealth,
          creature.isDead,
          creature.animState,
        );
        // Attach creature GLB model
        const creatureInstance = this.deps.creatureLoader.instantiate(`creature_${id}`);
        clientCreature.attachModel(creatureInstance);

        this.creatures.set(id, clientCreature);
        for (const m of clientCreature.modelMeshes) {
          this.deps.addShadowCaster(m);
        }

        // Listen to changes on this creature
        $(creature).onChange(() => {
          clientCreature.setServerState(
            creature.x,
            creature.z,
            creature.rotY,
            creature.health,
            creature.maxHealth,
            creature.isDead,
            creature.animState,
          );
        });
      }),
    );

    // Creatures removed
    track(
      state$.creatures.onRemove((_creature: any, id: string) => {
        const clientCreature = this.creatures.get(id);
        if (clientCreature) {
          clientCreature.dispose();
          this.creatures.delete(id);
        }
      }),
    );

    // ── Loot bags ──────────────────────────────────────────────────────────
    lootBagStore.setRoom(room);

    track(
      state$.lootBags.onAdd((bag: any, bagId: string) => {
        const drop = new ClientLootBag(this.deps.scene, bagId, bag.x, bag.z);
        this.lootBags.set(bagId, drop);
        // Pre-fetch item defs for loot panel
        const itemIds: string[] = [];
        bag.items.forEach((item: any) => {
          if (item.itemId && !itemIds.includes(item.itemId)) itemIds.push(item.itemId);
        });
        if (itemIds.length > 0) itemDefStore.ensureLoaded(itemIds);

        // Refresh loot panel when items are removed from this bag
        const bag$ = $(bag);
        bag$.items.onRemove(() => {
          lootBagStore.refresh();
        });
      }),
    );

    track(
      state$.lootBags.onRemove((_bag: any, bagId: string) => {
        const drop = this.lootBags.get(bagId);
        if (drop) {
          drop.dispose();
          this.lootBags.delete(bagId);
        }
        // Auto-close panel if this was the open bag
        if (lootBagStore.getSnapshot().lootBagId === bagId) {
          lootBagStore.close();
        }
      }),
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }

  /**
   * Handle click on an interactable mesh.
   * Dispatches by type — extend this switch for future interactables (chests, NPCs…).
   */
  private handleInteractableClick(room: Room, type: string, id: string): void {
    switch (type) {
      case "gate": {
        const snap = gateStore.getSnapshot();
        const info = snap.gates.get(id);
        if (!info || info.isOpen) return;
        // Only leader can open lobby gates
        if (info.gateType === GateType.LOBBY) {
          const player = room.state.players.get(room.sessionId);
          if (!player?.isLeader) return;
        }
        promptStore.show({
          title: t("gate.promptTitle"),
          message: t("gate.promptMessage"),
          confirmLabel: t("gate.promptAccept"),
          cancelLabel: t("gate.promptCancel"),
          onConfirm: () => {
            tutorialStore.dismiss(TutorialStep.START_DUNGEON);
            gateStore.confirmOpenGate(id);
          },
        });
        break;
      }
      case "loot": {
        lootBagStore.open(id);
        break;
      }
    }
  }

  /** Sync inventory from secret state to hudStore + lazy-fetch unknown item defs. */
  private rebuildInventory(sessionId: string, secret: any): void {
    const inv: { slot: number; itemId: string; quantity: number }[] = [];
    secret.inventory.forEach((slot: any, key: string) => {
      if (slot.quantity > 0) {
        inv.push({ slot: Number(key), itemId: slot.itemId, quantity: slot.quantity });
      }
    });
    hudStore.updateMember(sessionId, { inventory: inv });
    if (inv.length > 0) {
      itemDefStore.ensureLoaded(inv.map((s) => s.itemId));
    }
  }

  /** Extract item ids from local player's inventory (for preloading defs). */
  private getLocalInventoryItemIds(room: Room): string[] {
    const player = room.state.players.get(room.sessionId) as any;
    if (!player?.secret?.inventory) return [];
    const ids: string[] = [];
    player.secret.inventory.forEach((slot: any) => {
      if (slot.itemId && !ids.includes(slot.itemId)) ids.push(slot.itemId);
    });
    return ids;
  }

  /** Unsubscribe all tracked Colyseus state listeners. */
  private cleanupStateListeners(): void {
    for (const unsub of this.stateListeners) unsub();
    this.stateListeners = [];
  }

  dispose(): void {
    this.cleanupStateListeners();
    for (const [, player] of this.players) {
      player.dispose();
    }
    this.players.clear();
    for (const [, creature] of this.creatures) {
      creature.dispose();
    }
    this.creatures.clear();
    for (const [, drop] of this.lootBags) {
      drop.dispose();
    }
    this.lootBags.clear();
    lootBagStore.reset();
    this.inputManager?.dispose();
    this.inputManager = null;
    this.wallOcclusion?.dispose();
    this.wallOcclusion = null;
  }
}
