/** Client → Server message types */
export const MessageType = {
  MOVE: "move",
  ADMIN_RESTART: "admin:restart",
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
