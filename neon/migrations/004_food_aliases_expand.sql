-- Alias sin acentos y variantes de arroz/pasta (idempotente).
WITH one AS (SELECT id FROM food_catalog WHERE name_es = 'Plátano' LIMIT 1)
INSERT INTO food_aliases (food_id, alias, language)
SELECT one.id, v.alias, v.lang
FROM one
CROSS JOIN (VALUES ('platano', 'es'), ('banana', 'es')) AS v(alias, lang)
WHERE NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = one.id AND fa.alias = v.alias);

WITH one AS (SELECT id FROM food_catalog WHERE name_es = 'Arroz blanco cocido' LIMIT 1)
INSERT INTO food_aliases (food_id, alias, language)
SELECT one.id, 'arroz cocido', 'es'
FROM one
WHERE NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = one.id AND fa.alias = 'arroz cocido');

WITH one AS (SELECT id FROM food_catalog WHERE name_es = 'Pasta cocida' LIMIT 1)
INSERT INTO food_aliases (food_id, alias, language)
SELECT one.id, 'pasta cocida', 'es'
FROM one
WHERE NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = one.id AND fa.alias = 'pasta cocida');
