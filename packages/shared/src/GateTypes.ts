/** Gate types — `as const` object instead of enum (erasableSyntaxOnly) */
export const GateType = {
  LOBBY: "lobby",
} as const;

export type GateTypeValue = (typeof GateType)[keyof typeof GateType];
