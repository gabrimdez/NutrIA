-- Seed: Common foods for demo and initial use
-- All values per 100g, sourced from USDA FoodData Central (public domain)

INSERT INTO food_catalog (name, name_es, category, provider, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, is_verified) VALUES
-- Proteínas animales
('Chicken breast, raw', 'Pechuga de pollo', 'protein_animal', 'generic', 120, 22.5, 0, 2.6, 0, true),
('Turkey breast, raw', 'Pechuga de pavo', 'protein_animal', 'generic', 104, 23.7, 0, 0.7, 0, true),
('Beef sirloin, raw', 'Solomillo de ternera', 'protein_animal', 'generic', 150, 22.3, 0, 6.8, 0, true),
('Pork loin, raw', 'Lomo de cerdo', 'protein_animal', 'generic', 143, 21.4, 0, 6.3, 0, true),
('Salmon, raw', 'Salmón', 'protein_animal', 'generic', 208, 20.4, 0, 13.4, 0, true),
('Tuna, raw', 'Atún fresco', 'protein_animal', 'generic', 130, 28.2, 0, 1.3, 0, true),
('Hake, raw', 'Merluza', 'protein_animal', 'generic', 82, 17.9, 0, 0.8, 0, true),
('Cod, raw', 'Bacalao fresco', 'protein_animal', 'generic', 82, 17.8, 0, 0.7, 0, true),
('Shrimp, raw', 'Gambas', 'protein_animal', 'generic', 85, 20.1, 0.9, 0.5, 0, true),
('Whole egg', 'Huevo entero', 'protein_animal', 'generic', 155, 12.6, 1.1, 11.3, 0, true),
('Egg whites', 'Clara de huevo', 'protein_animal', 'generic', 52, 10.9, 0.7, 0.2, 0, true),
('Squid, raw', 'Calamar', 'protein_animal', 'generic', 92, 15.6, 3.1, 1.4, 0, true),
('Cuttlefish, raw', 'Sepia', 'protein_animal', 'generic', 79, 16.2, 0.8, 0.7, 0, true),

-- Lácteos
('Whole milk', 'Leche entera', 'dairy', 'generic', 61, 3.2, 4.8, 3.3, 0, true),
('Skim milk', 'Leche desnatada', 'dairy', 'generic', 34, 3.4, 5.0, 0.1, 0, true),
('Greek yogurt, plain', 'Yogur griego natural', 'dairy', 'generic', 97, 9.0, 3.6, 5.0, 0, true),
('Skyr', 'Skyr natural', 'dairy', 'generic', 63, 11.0, 4.0, 0.2, 0, true),
('Cottage cheese', 'Requesón', 'dairy', 'generic', 98, 11.1, 3.4, 4.3, 0, true),
('Mozzarella', 'Mozzarella', 'dairy', 'generic', 280, 22.2, 2.2, 20.7, 0, true),
('Cheddar cheese', 'Queso cheddar', 'dairy', 'generic', 403, 24.9, 1.3, 33.1, 0, true),

-- Carbohidratos
('White rice, raw', 'Arroz blanco', 'carbs_grain', 'generic', 360, 6.6, 79.3, 0.6, 1.3, true),
('Brown rice, raw', 'Arroz integral', 'carbs_grain', 'generic', 362, 7.5, 76.2, 2.7, 3.4, true),
('Pasta, raw', 'Pasta', 'carbs_grain', 'generic', 371, 13.0, 74.7, 1.5, 3.2, true),
('Whole wheat pasta, raw', 'Pasta integral', 'carbs_grain', 'generic', 348, 14.6, 68.3, 2.5, 8.0, true),
('White bread', 'Pan blanco', 'carbs_grain', 'generic', 265, 9.4, 49.0, 3.2, 2.7, true),
('Whole wheat bread', 'Pan integral', 'carbs_grain', 'generic', 247, 13.0, 41.3, 3.4, 6.8, true),
('Oats, raw', 'Avena', 'carbs_grain', 'generic', 389, 16.9, 66.3, 6.9, 10.6, true),
('Quinoa, raw', 'Quinoa', 'carbs_grain', 'generic', 368, 14.1, 64.2, 6.1, 7.0, true),
('Potato, raw', 'Patata', 'carbs_grain', 'generic', 77, 2.0, 17.5, 0.1, 2.2, true),
('Sweet potato, raw', 'Boniato', 'carbs_grain', 'generic', 86, 1.6, 20.1, 0.1, 3.0, true),
('Couscous, raw', 'Cuscús', 'carbs_grain', 'generic', 376, 12.8, 77.4, 0.6, 5.0, true),

-- Frutas
('Banana', 'Plátano', 'carbs_fruit', 'generic', 89, 1.1, 22.8, 0.3, 2.6, true),
('Apple', 'Manzana', 'carbs_fruit', 'generic', 52, 0.3, 13.8, 0.2, 2.4, true),
('Orange', 'Naranja', 'carbs_fruit', 'generic', 47, 0.9, 11.8, 0.1, 2.4, true),
('Strawberries', 'Fresas', 'carbs_fruit', 'generic', 32, 0.7, 7.7, 0.3, 2.0, true),
('Blueberries', 'Arándanos', 'carbs_fruit', 'generic', 57, 0.7, 14.5, 0.3, 2.4, true),
('Kiwi', 'Kiwi', 'carbs_fruit', 'generic', 61, 1.1, 14.7, 0.5, 3.0, true),
('Pear', 'Pera', 'carbs_fruit', 'generic', 57, 0.4, 15.2, 0.1, 3.1, true),
('Watermelon', 'Sandía', 'carbs_fruit', 'generic', 30, 0.6, 7.6, 0.2, 0.4, true),
('Pineapple', 'Piña', 'carbs_fruit', 'generic', 50, 0.5, 13.1, 0.1, 1.4, true),

-- Grasas saludables
('Olive oil', 'Aceite de oliva', 'fats_healthy', 'generic', 884, 0, 0, 100, 0, true),
('Avocado', 'Aguacate', 'fats_healthy', 'generic', 160, 2.0, 8.5, 14.7, 6.7, true),
('Almonds', 'Almendras', 'fats_healthy', 'generic', 579, 21.2, 21.7, 49.9, 12.5, true),
('Walnuts', 'Nueces', 'fats_healthy', 'generic', 654, 15.2, 13.7, 65.2, 6.7, true),
('Peanuts', 'Cacahuetes', 'fats_healthy', 'generic', 567, 25.8, 16.1, 49.2, 8.5, true),
('Peanut butter', 'Mantequilla de cacahuete', 'fats_healthy', 'generic', 588, 25.1, 20.0, 50.4, 6.0, true),
('Chia seeds', 'Semillas de chía', 'fats_healthy', 'generic', 486, 16.5, 42.1, 30.7, 34.4, true),
('Flaxseed', 'Semillas de lino', 'fats_healthy', 'generic', 534, 18.3, 28.9, 42.2, 27.3, true),

-- Verduras
('Broccoli', 'Brócoli', 'vegetables', 'generic', 34, 2.8, 6.6, 0.4, 2.6, true),
('Spinach', 'Espinacas', 'vegetables', 'generic', 23, 2.9, 3.6, 0.4, 2.2, true),
('Green beans', 'Judías verdes', 'vegetables', 'generic', 31, 1.8, 7.0, 0.1, 3.4, true),
('Zucchini', 'Calabacín', 'vegetables', 'generic', 17, 1.2, 3.1, 0.3, 1.0, true),
('Bell pepper', 'Pimiento', 'vegetables', 'generic', 26, 1.0, 6.0, 0.3, 2.1, true),
('Tomato', 'Tomate', 'vegetables', 'generic', 18, 0.9, 3.9, 0.2, 1.2, true),
('Carrot', 'Zanahoria', 'vegetables', 'generic', 41, 0.9, 9.6, 0.2, 2.8, true),
('Lettuce', 'Lechuga', 'vegetables', 'generic', 15, 1.4, 2.9, 0.2, 1.3, true),
('Onion', 'Cebolla', 'vegetables', 'generic', 40, 1.1, 9.3, 0.1, 1.7, true),
('Mushrooms', 'Champiñones', 'vegetables', 'generic', 22, 3.1, 3.3, 0.3, 1.0, true),
('Asparagus', 'Espárragos', 'vegetables', 'generic', 20, 2.2, 3.9, 0.1, 2.1, true),
('Cauliflower', 'Coliflor', 'vegetables', 'generic', 25, 1.9, 5.0, 0.3, 2.0, true),

-- Legumbres
('Lentils, raw', 'Lentejas', 'protein_vegetal', 'generic', 352, 24.6, 63.4, 1.1, 10.7, true),
('Chickpeas, raw', 'Garbanzos', 'protein_vegetal', 'generic', 364, 19.3, 60.7, 6.0, 17.4, true),
('Black beans, raw', 'Judías negras', 'protein_vegetal', 'generic', 341, 21.6, 62.4, 1.4, 15.5, true),
('Tofu, firm', 'Tofu firme', 'protein_vegetal', 'generic', 144, 17.3, 2.8, 8.7, 2.3, true),
('Edamame', 'Edamame', 'protein_vegetal', 'generic', 122, 11.9, 8.9, 5.2, 5.2, true),

-- Suplementos comunes
('Whey protein powder', 'Proteína whey', 'supplement', 'generic', 380, 80.0, 8.0, 4.0, 0, true),
('Casein protein powder', 'Proteína caseína', 'supplement', 'generic', 370, 75.0, 10.0, 3.5, 0, true),
('Creatine monohydrate', 'Creatina monohidrato', 'supplement', 'generic', 0, 0, 0, 0, 0, true),

-- Otros
('Honey', 'Miel', 'other', 'generic', 304, 0.3, 82.4, 0, 0.2, true),
('Dark chocolate 85%', 'Chocolate negro 85%', 'other', 'generic', 604, 12.0, 22.0, 52.0, 13.0, true),
('Coconut oil', 'Aceite de coco', 'fats_healthy', 'generic', 862, 0, 0, 100, 0, true),
('White rice, cooked', 'Arroz blanco cocido', 'carbs_grain', 'generic', 130, 2.7, 28.2, 0.3, 0.4, true),
('Pasta, cooked', 'Pasta cocida', 'carbs_grain', 'generic', 131, 5.0, 25.4, 1.1, 1.8, true);

-- Common aliases
INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'pollo', 'es' FROM food_catalog WHERE name_es = 'Pechuga de pollo' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'arroz', 'es' FROM food_catalog WHERE name_es = 'Arroz blanco' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'huevo', 'es' FROM food_catalog WHERE name_es = 'Huevo entero' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'atún', 'es' FROM food_catalog WHERE name_es = 'Atún fresco' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'pan', 'es' FROM food_catalog WHERE name_es = 'Pan blanco' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'leche', 'es' FROM food_catalog WHERE name_es = 'Leche entera' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'yogur', 'es' FROM food_catalog WHERE name_es = 'Yogur griego natural' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'avena', 'es' FROM food_catalog WHERE name_es = 'Avena' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'patata', 'es' FROM food_catalog WHERE name_es = 'Patata' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'whey', 'es' FROM food_catalog WHERE name_es = 'Proteína whey' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'platano', 'es' FROM food_catalog WHERE name_es = 'Plátano' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'banana', 'es' FROM food_catalog WHERE name_es = 'Plátano' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'arroz cocido', 'es' FROM food_catalog WHERE name_es = 'Arroz blanco cocido' LIMIT 1;

INSERT INTO food_aliases (food_id, alias, language) 
SELECT id, 'pasta cocida', 'es' FROM food_catalog WHERE name_es = 'Pasta cocida' LIMIT 1;
