CREATE TABLE IF NOT EXISTS custom_foods (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    name        VARCHAR(200) NOT NULL,
    kcal_per_100g   DOUBLE PRECISION NOT NULL,
    protein_per_100g DOUBLE PRECISION NOT NULL,
    carbs_per_100g  DOUBLE PRECISION NOT NULL,
    fat_per_100g    DOUBLE PRECISION NOT NULL,
    icon        VARCHAR(10),
    created_at  TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_foods_user_id ON custom_foods(user_id);

-- retrocompat: add icon if table already existed
ALTER TABLE custom_foods ADD COLUMN IF NOT EXISTS icon VARCHAR(10);
