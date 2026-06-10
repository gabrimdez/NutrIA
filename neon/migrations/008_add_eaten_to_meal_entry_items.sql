-- Add 'eaten' column to meal_entry_items.
-- When false the item stays listed but does not count toward daily totals.
ALTER TABLE meal_entry_items
    ADD COLUMN IF NOT EXISTS eaten BOOLEAN NOT NULL DEFAULT TRUE;
