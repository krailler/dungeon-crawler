CREATE TABLE characters.character_consumable_bar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters.characters(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  CONSTRAINT idx_char_cbar_slot UNIQUE (character_id, slot_index)
);
--> statement-breakpoint
CREATE INDEX idx_char_cbar_char ON characters.character_consumable_bar(character_id);
