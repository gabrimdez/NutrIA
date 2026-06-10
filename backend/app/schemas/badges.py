from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.models import BadgeCategory, BadgeRarity


class BadgeProgressDTO(BaseModel):
    current: int
    target: Optional[int] = None
    unit: str = ""


class BadgeCatalogItemDTO(BaseModel):
    badge_id: str
    name: str
    description: str
    unlock_criteria_text: str
    image_url: Optional[str] = None
    rarity: str
    category: str
    is_active: bool
    unlocked: bool
    unlocked_at: Optional[str] = None
    revoked_at: Optional[str] = None
    progress: Optional[BadgeProgressDTO] = None
    source: Optional[str] = None


class FeaturedBadgeSlotDTO(BaseModel):
    position: int
    badge_id: Optional[str] = None
    name: Optional[str] = None
    image_url: Optional[str] = None


class FeaturedBadgesUpdateDTO(BaseModel):
    badge_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def max_three(self) -> FeaturedBadgesUpdateDTO:
        if len(self.badge_ids) > 3:
            raise ValueError("Máximo 3 insignias destacadas")
        return self


class AdminBadgeCreateDTO(BaseModel):
    badge_id: str = Field(..., min_length=2, max_length=80)
    name: str = Field(..., max_length=200)
    description: str
    unlock_criteria_text: str = Field(..., min_length=1)
    image_url: Optional[str] = Field(default=None, max_length=500)
    rarity: str
    category: str
    unlock_rule: Optional[dict[str, Any]] = None
    is_active: bool = True

    @field_validator("rarity")
    @classmethod
    def rarity_ok(cls, v: str) -> str:
        allowed = {e.value for e in BadgeRarity}
        if v not in allowed:
            raise ValueError(f"rarity debe ser uno de: {sorted(allowed)}")
        return v

    @field_validator("category")
    @classmethod
    def category_ok(cls, v: str) -> str:
        allowed = {e.value for e in BadgeCategory}
        if v not in allowed:
            raise ValueError(f"category debe ser uno de: {sorted(allowed)}")
        return v


class AdminBadgePatchDTO(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    unlock_criteria_text: Optional[str] = None
    image_url: Optional[str] = None
    rarity: Optional[str] = None
    category: Optional[str] = None
    unlock_rule: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class AdminRecomputeDTO(BaseModel):
    user_id: Optional[str] = None


class AdminGrantDTO(BaseModel):
    user_id: str


class AdminRevokeDTO(BaseModel):
    user_id: str
    reason: str = Field(..., min_length=1, max_length=500)
