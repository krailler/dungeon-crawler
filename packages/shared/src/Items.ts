/** Item definition loaded from the database at server startup */
export type ItemDef = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly maxStack: number;
  readonly consumable: boolean;
  readonly cooldown: number;
  readonly effectType: string;
  readonly effectParams: Record<string, unknown>;
  readonly dropWeight: number;
};
