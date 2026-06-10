"""Abstract base for food data providers."""
from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID


class FoodResult:
    def __init__(self, id: Optional[UUID], name: str, name_es: Optional[str],
                 category: Optional[str], provider: str, external_id: Optional[str],
                 barcode: Optional[str], kcal_per_100g: float, protein_per_100g: float,
                 carbs_per_100g: float, fat_per_100g: float,
                 fiber_per_100g: Optional[float] = None,
                 serving_size_g: Optional[float] = None,
                 serving_description: Optional[str] = None,
                 is_verified: bool = False):
        self.id = id
        self.name = name
        self.name_es = name_es
        self.category = category
        self.provider = provider
        self.external_id = external_id
        self.barcode = barcode
        self.kcal_per_100g = kcal_per_100g
        self.protein_per_100g = protein_per_100g
        self.carbs_per_100g = carbs_per_100g
        self.fat_per_100g = fat_per_100g
        self.fiber_per_100g = fiber_per_100g
        self.serving_size_g = serving_size_g
        self.serving_description = serving_description
        self.is_verified = is_verified

    def to_dict(self) -> dict:
        return {
            "id": str(self.id) if self.id else None,
            "name": self.name,
            "name_es": self.name_es,
            "category": self.category,
            "provider": self.provider,
            "kcal_per_100g": round(self.kcal_per_100g, 1),
            "protein_per_100g": round(self.protein_per_100g, 1),
            "carbs_per_100g": round(self.carbs_per_100g, 1),
            "fat_per_100g": round(self.fat_per_100g, 1),
            "fiber_per_100g": round(self.fiber_per_100g, 1) if self.fiber_per_100g is not None else None,
            "serving_size_g": self.serving_size_g,
        }


class FoodProvider(ABC):
    @abstractmethod
    async def search(self, query: str, limit: int = 20) -> List[FoodResult]:
        ...

    @abstractmethod
    async def get_by_id(self, food_id: str) -> Optional[FoodResult]:
        ...


class BarcodeFoodProvider(FoodProvider):
    @abstractmethod
    async def search_by_barcode(self, barcode: str) -> Optional[FoodResult]:
        ...
