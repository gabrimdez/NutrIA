-- Auditoría macros food_catalog: corrige filas ya insertadas con valores antiguos de la migración 005.
-- Idempotente: volver a aplicar deja los mismos valores.
-- Ver data/food_catalog_reference.json y backend/scripts/validate_food_catalog.py

UPDATE food_catalog SET
  kcal_per_100g = 559,
  protein_per_100g = 30.2,
  carbs_per_100g = 10.7,
  fat_per_100g = 49.0,
  fiber_per_100g = 6.0,
  updated_at = NOW()
WHERE provider = 'generic' AND name = 'Pumpkin seeds';

UPDATE food_catalog SET
  kcal_per_100g = 617,
  updated_at = NOW()
WHERE provider = 'generic' AND name = 'Sunflower seeds';

UPDATE food_catalog SET
  fiber_per_100g = 5.1,
  updated_at = NOW()
WHERE provider = 'generic' AND name = 'Tempeh';

UPDATE food_catalog SET
  is_verified = false,
  updated_at = NOW()
WHERE provider = 'generic' AND name IN ('Ham serrano lean', 'Blood sausage cooked', 'Chorizo extra');
