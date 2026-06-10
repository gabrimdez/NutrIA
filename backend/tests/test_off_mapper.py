"""Tests for OpenFoodFacts mapper."""
from app.food_providers.mappers.openfoodfacts_mapper import map_off_product


SAMPLE_PRODUCT = {
    "code": "8410076472588",
    "product_name": "Leche Entera",
    "product_name_es": "Leche Entera",
    "brands": "Hacendado",
    "image_front_url": "https://images.openfoodfacts.org/test.jpg",
    "nutriments": {
        "energy-kcal_100g": 64,
        "proteins_100g": 3.1,
        "carbohydrates_100g": 4.7,
        "fat_100g": 3.6,
        "fiber_100g": 0,
        "energy-kcal_serving": 128,
        "proteins_serving": 6.2,
        "carbohydrates_serving": 9.4,
        "fat_serving": 7.2,
    },
    "serving_quantity": 200,
    "serving_size": "200 ml",
    "categories_tags": ["en:milks"],
}


class TestOFFMapper:
    def test_basic_mapping(self):
        item = map_off_product(SAMPLE_PRODUCT)
        assert item is not None
        assert item.source == "openfoodfacts"
        assert item.barcode == "8410076472588"
        assert item.brand == "Hacendado"
        assert item.name == "Leche Entera"

    def test_per_100g(self):
        item = map_off_product(SAMPLE_PRODUCT)
        assert item.per_100g is not None
        assert item.per_100g.calories == 64.0
        assert item.per_100g.protein == 3.1

    def test_per_serving(self):
        item = map_off_product(SAMPLE_PRODUCT)
        assert item.per_serving is not None
        assert item.per_serving.calories == 128.0

    def test_serving_info(self):
        item = map_off_product(SAMPLE_PRODUCT)
        assert item.serving is not None
        assert item.serving.grams == 200.0

    def test_empty_name_returns_none(self):
        product = {"product_name": "", "nutriments": {}}
        assert map_off_product(product) is None

    def test_numeric_name_returns_none(self):
        product = {"product_name": "84100764725", "nutriments": {}}
        assert map_off_product(product) is None

    def test_type_branded(self):
        item = map_off_product(SAMPLE_PRODUCT)
        assert item.type == "packaged"

    def test_type_generic_without_brand(self):
        product = {**SAMPLE_PRODUCT, "brands": ""}
        item = map_off_product(product)
        assert item.type == "generic"

    def test_image_url(self):
        item = map_off_product(SAMPLE_PRODUCT)
        assert item.image_url == "https://images.openfoodfacts.org/test.jpg"

    def test_image_url_falls_back_to_selected_images_display_es(self):
        product = {
            **SAMPLE_PRODUCT,
            "image_front_url": "",
            "selected_images": {
                "front": {
                    "display": {
                        "es": "https://images.openfoodfacts.org/front-es.jpg",
                        "en": "https://images.openfoodfacts.org/front-en.jpg",
                    }
                }
            },
        }
        item = map_off_product(product)
        assert item is not None
        assert item.image_url == "https://images.openfoodfacts.org/front-es.jpg"

    def test_image_url_falls_back_to_selected_images_display_en(self):
        product = {
            **SAMPLE_PRODUCT,
            "image_front_url": None,
            "selected_images": {
                "front": {
                    "display": {
                        "en": "https://images.openfoodfacts.org/front-en.jpg",
                    }
                }
            },
        }
        item = map_off_product(product)
        assert item is not None
        assert item.image_url == "https://images.openfoodfacts.org/front-en.jpg"

    def test_image_url_falls_back_to_other_front_variants(self):
        product = {
            **SAMPLE_PRODUCT,
            "image_front_url": None,
            "selected_images": {},
            "image_url": None,
            "image_front_small_url": "https://images.openfoodfacts.org/front-small.jpg",
        }
        item = map_off_product(product)
        assert item is not None
        assert item.image_url == "https://images.openfoodfacts.org/front-small.jpg"
