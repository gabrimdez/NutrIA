"""
Adapter stub for BEDCA (Base de Datos Española de Composición de Alimentos).

BEDCA provides nutritional data for Spanish foods. This adapter is prepared
for future integration but NOT coupled to the core system.

To connect BEDCA:
1. Obtain access to BEDCA data (https://www.bedca.net/)
2. Implement the search and get_by_id methods
3. Register this provider in the CompositeFoodProvider
4. Run the import script to populate food_catalog with BEDCA data

Legal note: BEDCA data may have usage restrictions. Review their terms
before importing data into production.
"""
from typing import List, Optional
from app.food_providers.base import FoodProvider, FoodResult


class BEDCAProvider(FoodProvider):
    async def search(self, query: str, limit: int = 20) -> List[FoodResult]:
        # Future: implement BEDCA API search or local DB query
        return []

    async def get_by_id(self, food_id: str) -> Optional[FoodResult]:
        # Future: implement BEDCA lookup
        return None
