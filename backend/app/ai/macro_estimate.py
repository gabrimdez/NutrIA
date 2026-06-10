"""Estimación aproximada de macros de un alimento por nombre y cantidad (no clínico)."""

from __future__ import annotations

import logging
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.ai.groq_client import structured_output

logger = logging.getLogger(__name__)


class FoodMacroEstimateAIResponse(BaseModel):
    kcal: float = Field(ge=0, le=10000)
    protein_g: float = Field(ge=0, le=2000)
    carbs_g: float = Field(ge=0, le=2000)
    fat_g: float = Field(ge=0, le=2000)
    confidence: Optional[Literal["high", "medium", "low"]] = None
    notes: str = Field("", max_length=300)

    @model_validator(mode="after")
    def _enforce_energy_coherence(self) -> "FoodMacroEstimateAIResponse":
        # kcal ≈ P*4 + C*4 + F*9 (±10%). Si todos los macros son ~0 saltamos la comprobación.
        expected = self.protein_g * 4 + self.carbs_g * 4 + self.fat_g * 9
        if expected < 1 and self.kcal < 1:
            return self
        if expected < 1:
            raise ValueError("kcal incoherente con macros (macros ~0)")
        ratio = self.kcal / expected
        if ratio < 0.9 or ratio > 1.1:
            raise ValueError(
                f"kcal incoherente con macros: kcal={self.kcal} esperado≈{expected:.1f}"
            )
        return self


MACRO_SYSTEM = """Eres un nutricionista que estima los macros aproximados de un alimento descrito por el usuario.
La estimación es orientativa (orden de magnitud), basada en valores medios de tablas de composición de alimentos.
Reglas:
- Responde solo con el JSON pedido; notes en español, máximo 1-2 frases.
- Los macros (kcal, protein_g, carbs_g, fat_g) deben corresponder a la CANTIDAD y UNIDAD indicadas, no a 100 g.
- Coherencia energética: kcal ≈ protein_g*4 + carbs_g*4 + fat_g*9 (margen ±10%).
- Si el alimento es ambiguo (p. ej. "pan"), asume la versión más común y marca confidence medium o low.
- Si el nombre no corresponde a un alimento real o es absurdo, devuelve todos los macros a 0 y confidence low.
"""


async def estimate_macros_from_text(
    name: str,
    quantity: float,
    unit: str,
) -> Optional[FoodMacroEstimateAIResponse]:
    name = (name or "").strip()
    if len(name) < 2 or quantity <= 0:
        return None
    user_msg = (
        f"Alimento: {name}\n"
        f"Cantidad: {quantity} {unit}\n"
        "Devuelve los macros estimados para esa cantidad exacta."
    )
    messages = [{"role": "user", "content": user_msg}]
    try:
        return await structured_output(
            messages=messages,
            response_model=FoodMacroEstimateAIResponse,
            temperature=0.2,
            max_tokens=500,
            system_prompt=MACRO_SYSTEM,
        )
    except Exception as e:
        logger.exception("estimate_macros_from_text failed: %s", e)
        return None
