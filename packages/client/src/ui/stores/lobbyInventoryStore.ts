import type { ItemDefClient } from "@dungeon/shared";
import { SERVER_URL } from "./authStore";

type InventorySlot = {
  slotIndex: number;
  itemId: string;
  quantity: number;
  instanceId: string | null;
};

type EquipmentSlot = {
  slot: string;
  instanceId: string;
};

type ItemInstance = {
  id: string;
  itemId: string;
  rolledStats: Record<string, number>;
  itemLevel: number;
};

export type LobbyInventorySnapshot = {
  loading: boolean;
  gold: number;
  inventory: InventorySlot[];
  equipment: EquipmentSlot[];
  instances: ItemInstance[];
  itemDefs: ItemDefClient[];
  error: string | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: LobbyInventorySnapshot = {
  loading: false,
  gold: 0,
  inventory: [],
  equipment: [],
  instances: [],
  itemDefs: [],
  error: null,
};

function emit(): void {
  for (const fn of listeners) fn();
}

function update(partial: Partial<LobbyInventorySnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emit();
}

function getToken(): string | null {
  return localStorage.getItem("authToken");
}

async function apiFetch(path: string, method: string = "GET", body?: unknown): Promise<unknown> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return res.json();
}

function applyResponse(data: unknown): void {
  const d = data as LobbyInventorySnapshot;
  update({
    loading: false,
    gold: d.gold,
    inventory: d.inventory,
    equipment: d.equipment,
    instances: d.instances,
    itemDefs: d.itemDefs ?? [],
    error: null,
  });
}

export const lobbyInventoryStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): LobbyInventorySnapshot {
    return snapshot;
  },

  async load(characterId: string): Promise<void> {
    update({ loading: true, error: null });
    try {
      const data = await apiFetch(`/api/inventory/${characterId}`);
      applyResponse(data);
    } catch (err) {
      update({ loading: false, error: err instanceof Error ? err.message : "Failed to load" });
    }
  },

  async swap(characterId: string, from: number, to: number): Promise<void> {
    try {
      const data = await apiFetch(`/api/inventory/${characterId}/swap`, "POST", { from, to });
      applyResponse(data);
    } catch (err) {
      update({ error: err instanceof Error ? err.message : "Failed to swap" });
    }
  },

  async equip(characterId: string, slotIndex: number, equipSlot: string): Promise<void> {
    try {
      const data = await apiFetch(`/api/inventory/${characterId}/equip`, "POST", {
        slotIndex,
        equipSlot,
      });
      applyResponse(data);
    } catch (err) {
      update({ error: err instanceof Error ? err.message : "Failed to equip" });
    }
  },

  async unequip(characterId: string, equipSlot: string): Promise<void> {
    try {
      const data = await apiFetch(`/api/inventory/${characterId}/unequip`, "POST", { equipSlot });
      applyResponse(data);
    } catch (err) {
      update({ error: err instanceof Error ? err.message : "Failed to unequip" });
    }
  },

  async destroy(characterId: string, slotIndex: number): Promise<void> {
    try {
      const data = await apiFetch(`/api/inventory/${characterId}/destroy`, "DELETE", { slotIndex });
      applyResponse(data);
    } catch (err) {
      update({ error: err instanceof Error ? err.message : "Failed to destroy" });
    }
  },

  reset(): void {
    snapshot = {
      loading: false,
      gold: 0,
      inventory: [],
      equipment: [],
      instances: [],
      itemDefs: [],
      error: null,
    };
    emit();
  },
};
