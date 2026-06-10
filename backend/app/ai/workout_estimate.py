"""Estimación de gasto calórico por descripción libre de entrenamiento (no clínico)."""

from __future__ import annotations

import logging
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.ai.groq_client import structured_output

logger = logging.getLogger(__name__)


class WorkoutEstimateAIResponse(BaseModel):
    estimated_kcal: float = Field(ge=0, le=20000)
    duration_min: Optional[int] = Field(None, ge=0, le=600)
    summary_es: str = Field("", max_length=500)
    confidence: Optional[Literal["high", "medium", "low"]] = None


WORKOUT_SYSTEM = """Eres un entrenador que estima el gasto calórico aproximado de una sesión descrita por el usuario.
No eres médico: la estimación es orientativa (orden de magnitud), no sustituye medición indirecta ni wearables.
Reglas:
- Responde solo en el JSON pedido; summary_es en español, 1-3 frases, sin alarmismo.
- kcal coherentes con duración e intensidad declaradas (p. ej. fuerza pesada ~4-8 kcal/min persona media; cardio moderado ~8-12).
- Si falta duración, infiere una duración plausible en duration_min y marca confidence medium o low.
- Si el texto es ambiguo, sube un poco la incertidumbre (confidence low) y mantén kcal conservadoras.
"""


async def estimate_workout_from_text(text: str) -> Optional[WorkoutEstimateAIResponse]:
    text = (text or "").strip()
    if len(text) < 3:
        return None
    messages = [{"role": "user", "content": text}]
    try:
        return await structured_output(
            messages=messages,
            response_model=WorkoutEstimateAIResponse,
            temperature=0.25,
            max_tokens=800,
            system_prompt=WORKOUT_SYSTEM,
        )
    except Exception as e:
        logger.exception("estimate_workout_from_text failed: %s", e)
        return None
