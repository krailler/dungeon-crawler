/** Client → Server message types */
export const MessageType = {
  MOVE: "move",
  ADMIN_RESTART: "admin:restart",
  COMBAT_LOG: "combat:log",
} as const;

/** Custom WebSocket close codes (4xxx range) */
export const CloseCode = {
  KICKED_DUPLICATE: 4100,
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/** Payload for MOVE message */
export interface MoveMessage {
  x: number;
  z: number;
}

/** Payload for ADMIN_RESTART message */
export interface AdminRestartMessage {
  seed?: number | null;
}

/** Payload for COMBAT_LOG message (Server → Client) */
export interface CombatLogMessage {
  /** "p2e" = player hit enemy, "e2p" = enemy hit player */
  dir: "p2e" | "e2p";
  /** Attacker display name */
  src: string;
  /** Target display name */
  tgt: string;
  /** Raw attack damage */
  atk: number;
  /** Target defense */
  def: number;
  /** Final damage applied */
  dmg: number;
  /** Target HP after hit */
  hp: number;
  /** Target max HP */
  maxHp: number;
  /** Target died from this hit */
  kill: boolean;
}
