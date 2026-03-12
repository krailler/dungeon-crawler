/** Client → Server message types */
export const MessageType = {
  MOVE: "move",
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/** Payload for MOVE message */
export interface MoveMessage {
  x: number;
  z: number;
}
