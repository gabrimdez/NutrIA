"""Generic food provider backed by the local food_catalog table."""
from typing import List, Optional
from uuid import UUID
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.food_providers.base import FoodProvider, FoodResult
from app.food_providers.search_normalize import fold_accents
from app.models.models import FoodCatalog, FoodAlias

_ACCENT_PAIRS = (
    ("á", "a"),
    ("é", "e"),
    ("í", "i"),
    ("ó", "o"),
    ("ú", "u"),
    ("à", "a"),
    ("è", "e"),
    ("ì", "i"),
    ("ò", "o"),
    ("ù", "u"),
    ("ä", "a"),
    ("ë", "e"),
    ("ï", "i"),
    ("ö", "o"),
    ("ü", "u"),
    ("â", "a"),
    ("ê", "e"),
    ("î", "i"),
    ("ô", "o"),
    ("û", "u"),
    ("ñ", "n"),
    ("ç", "c"),
)


def _sql_fold(column):
    c = func.lower(column)
    for a, b in _ACCENT_PAIRS:
        c = func.replace(c, a, b)
    return c


def _catalog_display_name():
    """name_es si tiene texto; si no, name (evita coalesce('', name) → '')."""
    return func.coalesce(
        func.nullif(func.trim(FoodCatalog.name_es), ""),
        FoodCatalog.name,
    )


class GenericFoodProvider(FoodProvider):
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search(self, query: str, limit: int = 20) -> List[FoodResult]:
        raw = query.strip()
        query_lower = f"%{raw.lower()}%"
        folded = fold_accents(raw)
        like_folded = f"%{folded}%"

        display_fold = _sql_fold(_catalog_display_name())
        name_only_fold = _sql_fold(FoodCatalog.name)
        name_es_fold = _sql_fold(FoodCatalog.name_es)
        alias_fold = _sql_fold(FoodAlias.alias)

        alias_subq = select(FoodAlias.food_id).where(
            or_(func.lower(FoodAlias.alias).like(query_lower), alias_fold.like(like_folded))
        )

        stmt = (
            select(FoodCatalog)
            .where(
                or_(
                    func.lower(FoodCatalog.name).like(query_lower),
                    func.lower(FoodCatalog.name_es).like(query_lower),
                    display_fold.like(like_folded),
                    name_only_fold.like(like_folded),
                    name_es_fold.like(like_folded),
                    FoodCatalog.id.in_(alias_subq),
                )
            )
            .order_by(FoodCatalog.is_verified.desc(), FoodCatalog.name)
            .limit(limit)
        )
        
        result = await self.db.execute(stmt)
        foods = result.scalars().all()
        
        return [self._to_result(f) for f in foods]

    async def get_by_id(self, food_id: str) -> Optional[FoodResult]:
        stmt = select(FoodCatalog).where(FoodCatalog.id == UUID(food_id))
        result = await self.db.execute(stmt)
        food = result.scalar_one_or_none()
        if food:
            return self._to_result(food)
        return None

    async def search_by_name_exact(self, name: str) -> Optional[FoodResult]:
        name_lower = name.lower().strip()
        folded = fold_accents(name)
        display_fold = _sql_fold(_catalog_display_name())
        name_fold = _sql_fold(FoodCatalog.name)
        name_es_fold = _sql_fold(FoodCatalog.name_es)
        alias_fold = _sql_fold(FoodAlias.alias)

        stmt = select(FoodCatalog).where(
            or_(
                func.lower(FoodCatalog.name) == name_lower,
                func.lower(FoodCatalog.name_es) == name_lower,
                display_fold == folded,
                name_fold == folded,
                name_es_fold == folded,
            )
        ).limit(1)
        result = await self.db.execute(stmt)
        food = result.scalar_one_or_none()
        
        if not food:
            alias_stmt = (
                select(FoodCatalog)
                .join(FoodAlias, FoodAlias.food_id == FoodCatalog.id)
                .where(
                    or_(
                        func.lower(FoodAlias.alias) == name_lower,
                        alias_fold == folded,
                    )
                )
                .limit(1)
            )
            result = await self.db.execute(alias_stmt)
            food = result.scalar_one_or_none()
        
        if food:
            return self._to_result(food)
        return None

    def _to_result(self, food: FoodCatalog) -> FoodResult:
        return FoodResult(
            id=food.id,
            name=food.name,
            name_es=food.name_es,
            category=food.category,
            provider=food.provider or "generic",
            external_id=food.external_id,
            barcode=food.barcode,
            kcal_per_100g=round(float(food.kcal_per_100g or 0), 1),
            protein_per_100g=round(float(food.protein_per_100g or 0), 1),
            carbs_per_100g=round(float(food.carbs_per_100g or 0), 1),
            fat_per_100g=round(float(food.fat_per_100g or 0), 1),
            fiber_per_100g=round(float(food.fiber_per_100g), 1) if food.fiber_per_100g is not None else None,
            serving_size_g=food.serving_size_g,
            serving_description=food.serving_description,
            is_verified=food.is_verified,
        )
