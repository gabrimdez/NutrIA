-- 010: Tablas para recetas de usuario (ingredientes compuestos reutilizables)

CREATE TABLE IF NOT EXISTS recipes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  servings        INTEGER NOT NULL DEFAULT 1,
  total_weight_g  FLOAT NOT NULL DEFAULT 0,
  total_kcal      FLOAT NOT NULL DEFAULT 0,
  total_protein_g FLOAT NOT NULL DEFAULT 0,
  total_carbs_g   FLOAT NOT NULL DEFAULT 0,
  total_fat_g     FLOAT NOT NULL DEFAULT 0,
  icon            VARCHAR(10),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_recipes_user_id ON recipes(user_id);

CREATE TABLE IF NOT EXISTS recipe_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  food_catalog_id UUID REFERENCES food_catalog(id),
  custom_name     VARCHAR(200),
  grams           FLOAT NOT NULL,
  kcal            FLOAT NOT NULL,
  protein_g       FLOAT NOT NULL,
  carbs_g         FLOAT NOT NULL,
  fat_g           FLOAT NOT NULL
);
