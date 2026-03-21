/**
 * StateSync — Bridges Colyseus server state to Babylon.js entities + React UI stores.
 *
 * Data flow:
 *
 *   Colyseus Room State (binary sync)
 *     │
 *     ├─ players.onAdd/onChange/onRemove
 *     │    ├─▶ ClientPlayer          (3D: model, interpolation, animations, life state)
 *     │    ├─▶ hudStore              (React: health, party list, stats, effects)
 *     │    ├─▶ deathStore            (React: death overlay, bleed/respawn timers)
 *     │    └─▶ effectDefStore        (lazy-fetch effect defs for buff icons)
 *     │
 *     ├─ creatures.onAdd/onChange/onRemove
 *     │    ├─▶ ClientCreature        (3D: model, health bar, hit flash, aggro)
 *     │    └─▶ creatureStore         (React: TargetFrame data)
 *     │
 *     ├─ lootBags.onAdd/onRemove
 *     │    ├─▶ ClientLootBag         (3D: golden sphere, bobbing animation)
 *     │    └─▶ itemDefStore          (lazy-fetch item defs for loot panel)
 *     │
 *     ├─ gates.onAdd/onChange/onRemove
 *     │    ├─▶ gateStore             (React: gate interaction prompts)
 *     │    └─▶ DungeonRenderer       (3D: gate mesh placement/removal)
 *     │
 *     └─ dungeonVersion (listen)
 *          └─▶ Full dungeon rebuild: render → input → wall occlusion → fog of war
 *
 * Private state (@view):
 *   player.secret is only visible to the owning client (Colyseus @view).
 *   Contains: gold, xp, inventory, stats, skills, stamina.
 *
 * Lifecycle:
 *   setup(room) → registers all Colyseus listeners
 *   dispose()   → cleans up 3D entities + unsubscribes all listeners
 *   On dungeon restart: dungeonVersion listener triggers full re-render.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { PropRegistry } from "../entities/PropRegistry";
import type { Room } from "@colyseus/sdk";
import { getStateCallbacks } from "@colyseus/sdk";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";

import { IsometricCamera } from "../camera/IsometricCamera";
import { DungeonRenderer } from "../dungeon/DungeonRenderer";
import { ClientPlayer } from "../entities/ClientPlayer";
import { ClientCreature } from "../entities/ClientCreature";
import { ClientLootBag } from "../entities/ClientLootBag";
import { CharacterLoaderRegistry } from "../entities/CharacterLoaderRegistry";
import { InputManager } from "./InputManager";
import { WallOcclusionSystem } from "../systems/WallOcclusionSystem";
import { DistanceCullSystem } from "../systems/DistanceCullSystem";
import { FogOfWarSystem } from "../systems/FogOfWarSystem";
import type { SoundManager } from "../audio/SoundManager";
import { hudStore } from "../ui/stores/hudStore";
import { levelUpStore } from "../ui/stores/levelUpStore";
import { itemDefStore } from "../ui/stores/itemDefStore";
import { itemInstanceStore } from "../ui/stores/itemInstanceStore";
import { skillDefStore } from "../ui/stores/skillDefStore";
import { effectDefStore } from "../ui/stores/effectDefStore";
import { classDefStore } from "../ui/stores/classDefStore";
import { talentDefStore } from "../ui/stores/talentDefStore";
import { talentStore } from "../ui/stores/talentStore";
import { adminStore } from "../ui/stores/adminStore";
import { authStore } from "../ui/stores/authStore";
import { gateStore } from "../ui/stores/gateStore";
import { questStore } from "../ui/stores/questStore";
import { lootBagStore } from "../ui/stores/lootBagStore";
import { targetStore } from "../ui/stores/targetStore";
import { creatureStore } from "../ui/stores/creatureStore";
import { deathStore } from "../ui/stores/deathStore";
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
  LifeState,
  REVIVE_RANGE,
} from "@dungeon/shared";
import { t } from "../i18n/i18n";
import type { SkillCooldownMessage, AdminDebugInfoMessage } from "@dungeon/shared";

export interface StateSyncDeps {
  readonly scene: Scene;
  readonly isoCamera: IsometricCamera;
  readonly dungeonRenderer: DungeonRenderer;
  readonly loaderRegistry: CharacterLoaderRegistry;
  readonly soundManager: SoundManager;
  readonly fogOfWar: FogOfWarSystem;
  readonly guiTexture: AdvancedDynamicTexture;
  readonly propRegistry: PropRegistry;
  addShadowCaster(mesh: AbstractMesh): void;
  onDungeonReady(): void;
}

export class StateSync {
  players: Map<string, ClientPlayer> = new Map();
  creatures: Map<string, ClientCreature> = new Map();
  lootBags: Map<string, ClientLootBag> = new Map();
  inputManager: InputManager | null = null;
  wallOcclusion: WallOcclusionSystem | null = null;
  distanceCull: DistanceCullSystem | null = null;
  localSessionId: string = "";

  private deps: StateSyncDeps;
  /** Colyseus state listener unsubscribe callbacks — cleaned up on dispose/restart */
  private stateListeners: (() => void)[] = [];

  constructor(deps: StateSyncDeps) {
    this.deps = deps;
  }

  /**
   * Register message-based stores early (before asset loading) so server
   * messages sent during handleJoin (e.g. TALENT_STATE) are not missed.
   */
  connectMessageStores(room: Room): void {
    skillDefStore.connect(room);
    effectDefStore.connect(room);
    classDefStore.connect(room);
    talentDefStore.connect(room);
    talentStore.connect(room);
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

    // Auto-target: server tells us a creature hit us and we had no target
    room.onMessage(MessageType.AUTO_TARGET, (data: { creatureId: string }) => {
      targetStore.selectCreature(data.creatureId);
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

    // Quest state listeners (MapSchema<QuestState>)
    track(
      state$.quests.onAdd((quest: any, questId: string) => {
        const sync = (): void =>
          questStore.setQuest(questId, {
            id: questId,
            questType: quest.questType,
            i18nKey: quest.i18nKey,
            target: quest.target,
            progress: quest.progress,
            status: quest.status,
          });
        sync();
        $(quest).onChange(sync);
      }),
    );
    track(
      state$.quests.onRemove((_quest: any, questId: string) => {
        questStore.removeQuest(questId);
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
          this.distanceCull?.dispose();
          this.distanceCull = null;
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
          this.deps.dungeonRenderer
            .loadAssets(floorSetNames, wallSetNames)
            .then(async () => {
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
                onEntityPicked: (pickType, pickId) => {
                  if (pickType === "creature") {
                    const creatureState = (room.state as any).creatures.get(pickId);
                    if (!creatureState || creatureState.isDead) return;
                    targetStore.selectCreature(pickId);
                  } else if (pickType === "player") {
                    const playerState = (room.state as any).players.get(pickId);
                    if (!playerState) return;
                    targetStore.selectPlayer(pickId);
                  }
                },
                onNothingPicked: () => targetStore.clear(),
                onTabTarget: () => {
                  const local = this.players.get(room.sessionId);
                  if (!local) return;
                  const pPos = local.getWorldPosition();
                  const { targetId: currentId, targetType: currentType } =
                    targetStore.getSnapshot();

                  // Collect all targetable entities (creatures + players) sorted by distance
                  const targets: {
                    id: string;
                    type: "creature" | "player";
                    dist: number;
                  }[] = [];

                  for (const [id, creature] of this.creatures) {
                    if (creature.isDead) continue;
                    const cPos = creature.getWorldPosition();
                    const dx = cPos.x - pPos.x;
                    const dz = cPos.z - pPos.z;
                    targets.push({ id, type: "creature", dist: dx * dx + dz * dz });
                  }

                  for (const [id, player] of this.players) {
                    if (id === room.sessionId) continue; // skip self
                    const oPos = player.getWorldPosition();
                    const dx = oPos.x - pPos.x;
                    const dz = oPos.z - pPos.z;
                    targets.push({ id, type: "player", dist: dx * dx + dz * dz });
                  }

                  if (targets.length === 0) return;
                  targets.sort((a, b) => a.dist - b.dist);

                  let nextIdx = 0;
                  if (currentId) {
                    const curIdx = targets.findIndex(
                      (e) => e.id === currentId && e.type === (currentType ?? "creature"),
                    );
                    if (curIdx >= 0) nextIdx = (curIdx + 1) % targets.length;
                  }

                  const next = targets[nextIdx];
                  if (next.type === "creature") {
                    targetStore.selectCreature(next.id);
                  } else {
                    targetStore.selectPlayer(next.id);
                  }
                },
              });

              // Setup wall occlusion (with wall decoration map for toggling)
              this.wallOcclusion = new WallOcclusionSystem(
                this.deps.scene,
                this.deps.isoCamera.camera,
                this.deps.dungeonRenderer.getWallMeshes(),
                this.deps.dungeonRenderer.getWallDecoMap(),
              );

              // Distance-based geometry culling (disable far floor/wall meshes)
              const spawnPos = this.deps.dungeonRenderer.getSpawnWorldPosition(tileMap);
              const initPos = spawnPos ?? new Vector3(0, 0, 0);
              this.distanceCull = new DistanceCullSystem(
                this.deps.dungeonRenderer.getFloorRoots(),
                this.deps.dungeonRenderer.getWallDecoRoots(),
                initPos.x,
                initPos.z,
              );

              // Tell fog of war where spawn is (expanded visibility near spawn)
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
            })
            .catch((err) => {
              console.error("[StateSync] Failed to load/render dungeon:", err);
              loadingStore.setPhase(LoadingPhase.COMPLETE);
              loadingStore.startFadeOut();
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

        // Attach GLB character model (use classId to pick the right model)
        const classId = (player.classId as string) || "player";
        const charInstance = this.deps.loaderRegistry.get(classId).instantiate(`char_${sessionId}`);
        const modelScale = this.deps.loaderRegistry.getConfig(classId).scale;
        clientPlayer.attachModel(charInstance, modelScale);

        // Add model meshes as shadow casters for local player's torch
        for (const m of clientPlayer.modelMeshes) {
          this.deps.addShadowCaster(m);
        }

        // Private data lives in player.secret (only visible to the owning client via @view)
        const secret = isLocal ? player.secret : undefined;
        const localStats = secret
          ? {
              strength: secret.strength,
              vitality: secret.vitality,
              agility: secret.agility,
              attackDamage: secret.attackDamage,
              defense: secret.defense,
              speed: secret.speed,
              attackCooldown: secret.attackCooldown,
            }
          : undefined;
        // Prefetch class definition for UI
        if (player.classId) {
          classDefStore.ensureLoaded([player.classId as string]);
        }

        hudStore.setMember({
          id: sessionId,
          name: displayName,
          health: player.health,
          maxHealth: player.maxHealth,
          isLocal,
          online: player.online,
          isLeader: player.isLeader,
          level: player.level,
          classId: (player.classId as string) || undefined,
          lifeState: player.lifeState ?? LifeState.ALIVE,
          // Private fields — only for local player
          ...(secret && {
            gold: secret.gold,
            xp: secret.xp,
            xpToNext: secret.xpToNext,
            statPoints: secret.statPoints,
            talentPoints: secret.talentPoints,
            stamina: secret.stamina,
            skills: Array.from(secret.skills as Iterable<string>),
            autoAttackEnabled: secret.autoAttackEnabled ?? true,
            consumableBar: Array.from(secret.consumableBar as Iterable<string>),
            stats: localStats,
          }),
        });

        // Local-only listeners: skills, gold, xp/level-up from secret state
        if (isLocal && secret) {
          // Sync skills array — onAdd/onRemove fire when server modifies the ArraySchema
          const syncSkills = (): void => {
            const skillIds = Array.from(secret.skills as Iterable<string>);
            hudStore.updateMember(sessionId, { skills: skillIds });
            // Prefetch skill definitions from server
            if (skillIds.length > 0) skillDefStore.ensureLoaded(skillIds);
          };
          $(secret).skills.onAdd(syncSkills);
          $(secret).skills.onRemove(syncSkills);

          // Sync consumable bar array
          const syncConsumableBar = (): void => {
            const bar = Array.from(secret.consumableBar as Iterable<string>);
            hudStore.updateMember(sessionId, { consumableBar: bar });
          };
          $(secret).consumableBar.onAdd(syncConsumableBar);
          $(secret).consumableBar.onChange(syncConsumableBar);
          $(secret).consumableBar.onRemove(syncConsumableBar);

          // Sync inventory MapSchema + lazy-fetch unknown item defs
          // Also handles initial inventory on join (onAdd fires for existing items)
          const rebuildInv = this.rebuildInventory.bind(this, sessionId, secret);

          $(secret).inventory.onAdd((slot: any, _key: string) => {
            $(slot).onChange(rebuildInv);
            rebuildInv();
          });
          $(secret).inventory.onRemove(rebuildInv);

          // Sync equipment MapSchema
          const rebuildEquip = this.rebuildEquipment.bind(this, sessionId, secret);
          $(secret).equipment.onAdd((eqSlot: any, _key: string) => {
            $(eqSlot).onChange(rebuildEquip);
            rebuildEquip();
          });
          $(secret).equipment.onRemove(rebuildEquip);

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
              talentPoints: secret.talentPoints,
              stamina: secret.stamina,
              autoAttackEnabled: secret.autoAttackEnabled ?? true,
              stats: {
                strength: secret.strength,
                vitality: secret.vitality,
                agility: secret.agility,
                attackDamage: secret.attackDamage,
                defense: secret.defense,
                speed: secret.speed,
                attackCooldown: secret.attackCooldown,
              },
            });
          });
        }

        // Sync active effects (buffs/debuffs) — visible to all players
        const syncEffects = (): void => {
          const effects: {
            effectId: string;
            remaining: number;
            duration: number;
            stacks: number;
            modValue: number;
          }[] = [];
          player.effects?.forEach((effect: any, effectId: string) => {
            effects.push({
              effectId,
              remaining: effect.remaining,
              duration: effect.duration,
              stacks: effect.stacks,
              modValue: effect.modValue ?? 0,
            });
          });
          hudStore.updateMember(sessionId, { effects });
          // Prefetch effect definitions for UI
          if (effects.length > 0) {
            effectDefStore.ensureLoaded(effects.map((e) => e.effectId));
          }
        };
        if (player.effects) {
          // Throttle onChange syncs to avoid 32Hz re-renders from remaining ticking
          let lastEffectChangeSync = 0;
          const throttledSyncEffects = (): void => {
            const now = performance.now();
            if (now - lastEffectChangeSync < 100) return; // max 10Hz
            lastEffectChangeSync = now;
            syncEffects();
          };

          $(player).effects.onAdd((effect: any, _effectId: string) => {
            // Listen for changes within each ActiveEffectState (e.g. remaining ticking down)
            $(effect).onChange(() => {
              throttledSyncEffects();
            });
            syncEffects(); // immediate on add
          });
          $(player).effects.onRemove(() => {
            syncEffects(); // immediate on remove
          });
        }

        // Track health to detect healing (for particle effect)
        let prevHealth = player.health as number;
        // Track level to detect level-up (level is public, visible to all)
        let prevLevel = player.level as number;
        // Track life state changes to switch death audio loops (local player only)
        let prevLifeState: string = player.lifeState ?? LifeState.ALIVE;

        // Listen to changes on public player state
        $(player).onChange(() => {
          clientPlayer.setServerState(
            player.x,
            player.z,
            player.rotY,
            player.animState,
            player.isSprinting,
          );

          // Update visual life state (downed = semi-transparent, dead = very transparent)
          if (player.lifeState) {
            clientPlayer.setLifeState(player.lifeState);
          }

          // Heal effect: green particles when health increases (skip revive/respawn full heals)
          if (
            player.health > prevHealth &&
            prevHealth > 0 &&
            player.lifeState === LifeState.ALIVE
          ) {
            clientPlayer.playHealEffect();
          }
          prevHealth = player.health;

          // Level-up: UI overlay (local only) + particle aura (all players)
          if (player.level > prevLevel) {
            if (isLocal) {
              levelUpStore.show(player.level);
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
            lifeState: player.lifeState ?? LifeState.ALIVE,
            bleedTimer: player.bleedTimer ?? 0,
            respawnTimer: player.respawnTimer ?? 0,
            reviveProgress: player.reviveProgress ?? 0,
          });
          // Update revive range flag only if targeting a downed player
          const tSnap = targetStore.getSnapshot();
          if (
            tSnap.targetId === sessionId &&
            tSnap.targetType === "player" &&
            player.lifeState === LifeState.DOWNED
          ) {
            let inRange = false;
            const localPlayer = (room.state as any).players.get(this.localSessionId);
            if (localPlayer) {
              const dx = localPlayer.x - player.x;
              const dz = localPlayer.z - player.z;
              inRange = dx * dx + dz * dz <= REVIVE_RANGE * REVIVE_RANGE;
            }
            targetStore.setInReviveRange(inRange);
          }
          // Sync death store for the local player
          if (isLocal) {
            let reviverName = "";
            if (player.reviverSessionId) {
              const reviverState = (room.state as any).players.get(player.reviverSessionId);
              reviverName = reviverState?.characterName || player.reviverSessionId.slice(0, 6);
            }
            deathStore.update(
              player.lifeState ?? LifeState.ALIVE,
              player.bleedTimer ?? 0,
              player.respawnTimer ?? 0,
              player.reviveProgress ?? 0,
              reviverName,
            );

            // Switch death audio loop when life state changes
            const curLife = player.lifeState ?? LifeState.ALIVE;
            if (curLife !== prevLifeState) {
              if (curLife === LifeState.DOWNED) {
                this.deps.soundManager.setDeathLoop("downed");
              } else if (curLife === LifeState.DEAD) {
                this.deps.soundManager.setDeathLoop("dead");
              } else {
                this.deps.soundManager.setDeathLoop("none");
                // Play revive/respawn sound when coming back alive
                if (prevLifeState !== LifeState.ALIVE) {
                  this.deps.soundManager.playSfx("revive");
                }
              }
              prevLifeState = curLife;
            }
          }
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
        // Clear target if the removed player was selected
        if (targetStore.getSnapshot().targetId === sessionId) {
          targetStore.clear();
        }
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
          creature.isAggro,
          creature.isMoving,
          creature.isWalking,
        );
        // Attach creature GLB model (use creatureType to pick the right model)
        const cType = (creature.creatureType as string) || "zombie";
        const creatureInstance = this.deps.loaderRegistry.get(cType).instantiate(`creature_${id}`);
        const creatureScale = this.deps.loaderRegistry.getConfig(cType).scale;
        clientCreature.attachModel(creatureInstance, creatureScale);

        this.creatures.set(id, clientCreature);
        for (const m of clientCreature.modelMeshes) {
          this.deps.addShadowCaster(m);
        }

        // Sync creature effects (buffs/debuffs) — visible to all players
        const syncCreatureEffects = (): void => {
          const effects: {
            effectId: string;
            remaining: number;
            duration: number;
            stacks: number;
            modValue: number;
          }[] = [];
          creature.effects?.forEach((effect: any, effectId: string) => {
            effects.push({
              effectId,
              remaining: effect.remaining,
              duration: effect.duration,
              stacks: effect.stacks,
              modValue: effect.modValue ?? 0,
            });
          });
          creatureStore.update(id, { effects });
          if (effects.length > 0) {
            effectDefStore.ensureLoaded(effects.map((e) => e.effectId));
          }
        };
        if (creature.effects) {
          let lastCreatureEffectSync = 0;
          const throttledSyncCreatureEffects = (): void => {
            const now = performance.now();
            if (now - lastCreatureEffectSync < 100) return;
            lastCreatureEffectSync = now;
            syncCreatureEffects();
          };

          $(creature).effects.onAdd((effect: any) => {
            $(effect).onChange(() => throttledSyncCreatureEffects());
            syncCreatureEffects();
          });
          $(creature).effects.onRemove(() => {
            syncCreatureEffects();
          });
        }

        // Populate creature store for UI (TargetFrame reads from here)
        creatureStore.set(id, {
          id,
          name: t(creature.nameKey || `creatures.${creature.creatureType}`),
          health: creature.health,
          maxHealth: creature.maxHealth,
          level: creature.level,
          isDead: creature.isDead,
          effects: [],
        });

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
            creature.isAggro,
            creature.isMoving,
            creature.isWalking,
          );
          // Update creature store
          creatureStore.update(id, {
            health: creature.health,
            maxHealth: creature.maxHealth,
            isDead: creature.isDead,
          });
          // Auto-clear target when creature dies
          if (creature.isDead && targetStore.getSnapshot().targetId === id) {
            targetStore.clear();
          }
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
        creatureStore.remove(id);
        // Clear target if the removed creature was selected
        if (targetStore.getSnapshot().targetId === id) {
          targetStore.clear();
        }
      }),
    );

    // ── Targeting ──────────────────────────────────────────────────────────
    targetStore.setRoom(room);
    deathStore.setRoom(room);

    // Update selection rings reactively (only when target changes, not every frame)
    let prevTargetId: string | null = null;
    const unsubTarget = targetStore.subscribe(() => {
      const snap = targetStore.getSnapshot();
      // Deselect previous target
      if (prevTargetId && prevTargetId !== snap.targetId) {
        this.creatures.get(prevTargetId)?.setSelected(false);
        this.players.get(prevTargetId)?.setSelected(false);
      }
      // Select new target
      if (snap.targetId) {
        if (snap.targetType === "creature") {
          this.creatures.get(snap.targetId)?.setSelected(true);
        } else if (snap.targetType === "player") {
          this.players.get(snap.targetId)?.setSelected(true);
        }
      }
      prevTargetId = snap.targetId;
    });
    this.stateListeners.push(unsubTarget);

    // ── Loot bags ──────────────────────────────────────────────────────────
    lootBagStore.setRoom(room);

    track(
      state$.lootBags.onAdd((bag: any, bagId: string) => {
        const drop = new ClientLootBag(
          this.deps.scene,
          bagId,
          bag.x,
          bag.z,
          this.deps.propRegistry.get("chest"),
        );
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
      case "exit": {
        promptStore.show({
          title: t("exit.promptTitle"),
          message: t("exit.promptMessage"),
          confirmLabel: t("exit.promptAccept"),
          cancelLabel: t("exit.promptCancel"),
          onConfirm: () => {
            room.send(MessageType.EXIT_INTERACT, {});
          },
        });
        break;
      }
    }
  }

  /** Sync inventory from secret state to hudStore + lazy-fetch unknown item defs. */
  private rebuildInventory(sessionId: string, secret: any): void {
    const inv: { slot: number; itemId: string; quantity: number; instanceId?: string }[] = [];
    secret.inventory.forEach((slot: any, key: string) => {
      if (slot.quantity > 0) {
        inv.push({
          slot: Number(key),
          itemId: slot.itemId,
          quantity: slot.quantity,
          instanceId: slot.instanceId || undefined,
        });
      }
    });
    hudStore.updateMember(sessionId, { inventory: inv });
    if (inv.length > 0) {
      itemDefStore.ensureLoaded(inv.map((s) => s.itemId));
      // Lazy-load instance data for equipment items
      const instanceIds = inv.map((s) => s.instanceId).filter(Boolean) as string[];
      if (instanceIds.length > 0) {
        itemInstanceStore.ensureLoaded(instanceIds);
      }
    }
  }

  /** Extract item ids from local player's inventory (for preloading defs). */
  /** Sync equipment from secret state to hudStore + lazy-fetch instance data. */
  private rebuildEquipment(sessionId: string, secret: any): void {
    const equipment: Record<string, { instanceId: string }> = {};
    secret.equipment.forEach((eqSlot: any, slotName: string) => {
      if (eqSlot.instanceId) {
        equipment[slotName] = { instanceId: eqSlot.instanceId };
      }
    });
    hudStore.updateMember(sessionId, { equipment });

    // Lazy-load instance data for equipped items
    const instanceIds = Object.values(equipment).map((e) => e.instanceId);
    if (instanceIds.length > 0) {
      itemInstanceStore.ensureLoaded(instanceIds);
    }
  }

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
    targetStore.reset();
    creatureStore.reset();
    deathStore.reset();
    skillDefStore.reset();
    effectDefStore.reset();
    classDefStore.reset();
    talentDefStore.reset();
    talentStore.reset();
    questStore.reset();
    this.inputManager?.dispose();
    this.inputManager = null;
    this.wallOcclusion?.dispose();
    this.wallOcclusion = null;
    this.distanceCull?.dispose();
    this.distanceCull = null;
  }
}
