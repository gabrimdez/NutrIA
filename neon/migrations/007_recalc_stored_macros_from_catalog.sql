-- Recalcula macros almacenados a partir de food_catalog (por 100 g) y los gramos guardados.
-- Cubre: diet_plan_meals.foods (JSON), meal_entry_items, saved_meal_items; luego re-suma totales de comidas.
-- Idempotente: repetir la migración con los mismos gramos produce los mismos valores.
-- Nota: si el nombre del alimento no empareja con el catálogo (nombre, alias), la fila no se modifica.

CREATE OR REPLACE FUNCTION nf_norm_food_label(p_food_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        lower(trim(regexp_replace(coalesce(p_food_name, ''), '\s+', ' ', 'g'))),
        '^([0-9]+[\s,\.]*|una?\s+)',
        '',
        'i'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION nf_lookup_catalog_macros(p_food_name text)
RETURNS TABLE (
  kcal_per_100g double precision,
  protein_per_100g double precision,
  carbs_per_100g double precision,
  fat_per_100g double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH n AS (
    SELECT nf_norm_food_label(p_food_name) AS v
  ),
  exact_es AS (
    SELECT fc.kcal_per_100g, fc.protein_per_100g, fc.carbs_per_100g, fc.fat_per_100g, 0 AS tier,
      length(trim(fc.name_es)) AS w
    FROM food_catalog fc, n
    WHERE fc.provider = 'generic' AND n.v <> '' AND lower(trim(fc.name_es)) = n.v
  ),
  exact_en AS (
    SELECT fc.kcal_per_100g, fc.protein_per_100g, fc.carbs_per_100g, fc.fat_per_100g, 0 AS tier,
      length(trim(fc.name)) AS w
    FROM food_catalog fc, n
    WHERE fc.provider = 'generic' AND n.v <> '' AND lower(trim(fc.name)) = n.v
  ),
  exact_alias AS (
    SELECT fc.kcal_per_100g, fc.protein_per_100g, fc.carbs_per_100g, fc.fat_per_100g, 1 AS tier,
      length(trim(fa.alias)) AS w
    FROM food_catalog fc
    INNER JOIN food_aliases fa ON fa.food_id = fc.id
    CROSS JOIN n
    WHERE fc.provider = 'generic' AND n.v <> '' AND lower(trim(fa.alias)) = n.v
  ),
  sub_es AS (
    SELECT fc.kcal_per_100g, fc.protein_per_100g, fc.carbs_per_100g, fc.fat_per_100g, 2 AS tier,
      length(trim(fc.name_es)) AS w
    FROM food_catalog fc, n
    WHERE fc.provider = 'generic'
      AND n.v <> ''
      AND length(trim(fc.name_es)) >= 3
      AND n.v LIKE '%' || lower(trim(fc.name_es)) || '%'
  ),
  sub_en AS (
    SELECT fc.kcal_per_100g, fc.protein_per_100g, fc.carbs_per_100g, fc.fat_per_100g, 2 AS tier,
      length(trim(fc.name)) AS w
    FROM food_catalog fc, n
    WHERE fc.provider = 'generic'
      AND n.v <> ''
      AND length(trim(fc.name)) >= 3
      AND n.v LIKE '%' || lower(trim(fc.name)) || '%'
  ),
  sub_alias AS (
    SELECT fc.kcal_per_100g, fc.protein_per_100g, fc.carbs_per_100g, fc.fat_per_100g, 3 AS tier,
      length(trim(fa.alias)) AS w
    FROM food_catalog fc
    INNER JOIN food_aliases fa ON fa.food_id = fc.id
    CROSS JOIN n
    WHERE fc.provider = 'generic'
      AND n.v <> ''
      AND length(trim(fa.alias)) >= 3
      AND n.v LIKE '%' || lower(trim(fa.alias)) || '%'
  ),
  u AS (
    SELECT * FROM exact_es
    UNION ALL SELECT * FROM exact_en
    UNION ALL SELECT * FROM exact_alias
    UNION ALL SELECT * FROM sub_es
    UNION ALL SELECT * FROM sub_en
    UNION ALL SELECT * FROM sub_alias
  )
  SELECT u.kcal_per_100g, u.protein_per_100g, u.carbs_per_100g, u.fat_per_100g
  FROM u
  ORDER BY u.tier ASC, u.w DESC
  LIMIT 1;
$$;

-- --- diet_plan_meals: recalcular cada elemento del array foods y totales de la comida ---
DO $$
DECLARE
  r RECORD;
  i int;
  elem jsonb;
  arr jsonb;
  new_arr jsonb;
  g double precision;
  fname text;
  k100 double precision;
  p100 double precision;
  c100 double precision;
  f100 double precision;
  tk double precision;
  tp double precision;
  tc double precision;
  tf double precision;
  nk double precision;
  np double precision;
  nc double precision;
  nf double precision;
BEGIN
  FOR r IN SELECT id, foods FROM diet_plan_meals
  LOOP
    arr := r.foods;
    IF arr IS NULL OR jsonb_typeof(arr) <> 'array' THEN
      CONTINUE;
    END IF;

    new_arr := '[]'::jsonb;
    tk := 0;
    tp := 0;
    tc := 0;
    tf := 0;

    FOR i IN 0..COALESCE(jsonb_array_length(arr), 0) - 1 LOOP
      k100 := NULL;
      p100 := NULL;
      c100 := NULL;
      f100 := NULL;
      elem := arr -> i;
      fname := COALESCE(elem ->> 'name', '');
      BEGIN
        g := NULLIF(trim(elem ->> 'grams'), '')::double precision;
      EXCEPTION WHEN OTHERS THEN
        g := NULL;
      END;
      IF g IS NULL OR g <= 0 THEN
        new_arr := new_arr || jsonb_build_array(elem);
        tk := tk + COALESCE(NULLIF(trim(elem ->> 'kcal'), '')::double precision, 0);
        tp := tp + COALESCE(NULLIF(trim(elem ->> 'protein_g'), '')::double precision, 0);
        tc := tc + COALESCE(NULLIF(trim(elem ->> 'carbs_g'), '')::double precision, 0);
        tf := tf + COALESCE(NULLIF(trim(elem ->> 'fat_g'), '')::double precision, 0);
        CONTINUE;
      END IF;

      SELECT m.kcal_per_100g, m.protein_per_100g, m.carbs_per_100g, m.fat_per_100g
      INTO k100, p100, c100, f100
      FROM nf_lookup_catalog_macros(fname) AS m
      LIMIT 1;

      IF k100 IS NULL THEN
        new_arr := new_arr || jsonb_build_array(elem);
        tk := tk + COALESCE(NULLIF(trim(elem ->> 'kcal'), '')::double precision, 0);
        tp := tp + COALESCE(NULLIF(trim(elem ->> 'protein_g'), '')::double precision, 0);
        tc := tc + COALESCE(NULLIF(trim(elem ->> 'carbs_g'), '')::double precision, 0);
        tf := tf + COALESCE(NULLIF(trim(elem ->> 'fat_g'), '')::double precision, 0);
      ELSE
        nk := round((k100 * g / 100.0)::numeric, 0);
        np := round((p100 * g / 100.0)::numeric, 1);
        nc := round((c100 * g / 100.0)::numeric, 1);
        nf := round((f100 * g / 100.0)::numeric, 1);
        elem := elem || jsonb_build_object(
          'grams', g,
          'kcal', nk,
          'protein_g', np,
          'carbs_g', nc,
          'fat_g', nf
        );
        new_arr := new_arr || jsonb_build_array(elem);
        tk := tk + nk;
        tp := tp + np;
        tc := tc + nc;
        tf := tf + nf;
      END IF;
    END LOOP;

    UPDATE diet_plan_meals
    SET
      foods = new_arr,
      total_kcal = tk,
      total_protein_g = tp,
      total_carbs_g = tc,
      total_fat_g = tf
    WHERE id = r.id;
  END LOOP;
END $$;

-- --- meal_entry_items: por food_catalog_id ---
UPDATE meal_entry_items mei
SET
  kcal = round((fc.kcal_per_100g * mei.grams / 100.0)::numeric, 0),
  protein_g = round((fc.protein_per_100g * mei.grams / 100.0)::numeric, 1),
  carbs_g = round((fc.carbs_per_100g * mei.grams / 100.0)::numeric, 1),
  fat_g = round((fc.fat_per_100g * mei.grams / 100.0)::numeric, 1)
FROM food_catalog fc
WHERE mei.food_catalog_id = fc.id
  AND mei.grams > 0;

-- --- meal_entry_items: sin catálogo, por nombre ---
UPDATE meal_entry_items mei
SET
  kcal = round((m.kcal_per_100g * mei.grams / 100.0)::numeric, 0),
  protein_g = round((m.protein_per_100g * mei.grams / 100.0)::numeric, 1),
  carbs_g = round((m.carbs_per_100g * mei.grams / 100.0)::numeric, 1),
  fat_g = round((m.fat_per_100g * mei.grams / 100.0)::numeric, 1)
FROM LATERAL nf_lookup_catalog_macros(COALESCE(mei.custom_name, '')) AS m
WHERE mei.food_catalog_id IS NULL
  AND mei.grams > 0;

UPDATE meal_entries me
SET
  total_kcal = agg.sk,
  total_protein_g = agg.sp,
  total_carbs_g = agg.sc,
  total_fat_g = agg.sf
FROM (
  SELECT
    meal_entry_id,
    COALESCE(sum(kcal), 0) AS sk,
    COALESCE(sum(protein_g), 0) AS sp,
    COALESCE(sum(carbs_g), 0) AS sc,
    COALESCE(sum(fat_g), 0) AS sf
  FROM meal_entry_items
  GROUP BY meal_entry_id
) AS agg
WHERE me.id = agg.meal_entry_id;

-- --- saved_meal_items ---
UPDATE saved_meal_items smi
SET
  kcal = round((fc.kcal_per_100g * smi.grams / 100.0)::numeric, 0),
  protein_g = round((fc.protein_per_100g * smi.grams / 100.0)::numeric, 1),
  carbs_g = round((fc.carbs_per_100g * smi.grams / 100.0)::numeric, 1),
  fat_g = round((fc.fat_per_100g * smi.grams / 100.0)::numeric, 1)
FROM food_catalog fc
WHERE smi.food_catalog_id = fc.id
  AND smi.grams > 0;

UPDATE saved_meal_items smi
SET
  kcal = round((m.kcal_per_100g * smi.grams / 100.0)::numeric, 0),
  protein_g = round((m.protein_per_100g * smi.grams / 100.0)::numeric, 1),
  carbs_g = round((m.carbs_per_100g * smi.grams / 100.0)::numeric, 1),
  fat_g = round((m.fat_per_100g * smi.grams / 100.0)::numeric, 1)
FROM LATERAL nf_lookup_catalog_macros(COALESCE(smi.custom_name, '')) AS m
WHERE smi.food_catalog_id IS NULL
  AND smi.grams > 0;

UPDATE saved_meals sm
SET
  total_kcal = agg.sk,
  total_protein_g = agg.sp,
  total_carbs_g = agg.sc,
  total_fat_g = agg.sf
FROM (
  SELECT
    saved_meal_id,
    COALESCE(sum(kcal), 0) AS sk,
    COALESCE(sum(protein_g), 0) AS sp,
    COALESCE(sum(carbs_g), 0) AS sc,
    COALESCE(sum(fat_g), 0) AS sf
  FROM saved_meal_items
  GROUP BY saved_meal_id
) AS agg
WHERE sm.id = agg.saved_meal_id;
