-- Quita variantes cocinadas de carne/pescado del catálogo genérico (búsqueda manual = crudo).
DELETE FROM food_catalog
WHERE name IN ('Chicken breast, cooked', 'Salmon, cooked')
   OR name_es IN ('Pechuga de pollo cocinada', 'Salmón cocinado');
