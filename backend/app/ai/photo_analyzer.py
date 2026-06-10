"""Analiza fotos de comida con Groq (modelo multimodal) y devuelve datos estructurados."""
import logging
from typing import Optional
from app.ai.groq_client import vision_analysis
from app.schemas.food import PhotoAnalysisAIResponse

logger = logging.getLogger(__name__)

PHOTO_ANALYSIS_PROMPT = """Eres un experto en estimación visual de porciones para registro dietético (no clínico).
Analiza esta foto de comida y devuelve información estructurada sobre los alimentos que ves.

Para cada alimento detectado:
1. Identifica el nombre del alimento
2. Normaliza el nombre (sin marcas, genérico)
3. Estima los gramos basándote en el tamaño visual
4. Estima las kcal, proteínas (g), carbohidratos (g) y grasas (g) para la porción estimada
5. Indica tu nivel de confianza: "high", "medium" o "low"
6. Lista cualquier suposición que hagas

Reglas:
- Sé conservador con las estimaciones de gramos
- Los macros deben ser coherentes con los gramos: usa valores por 100g típicos del alimento y multiplica por (gramos/100)
- Ejemplo: 150g de pechuga de pollo ≈ 165 kcal, 31g proteína, 0g carbos, 3.6g grasa
- Si no estás seguro de un alimento, indica confidence "low"
- Si ves un plato compuesto, intenta descomponer los ingredientes principales
- Usa nombres de alimentos en español
- No inventes alimentos que no veas claramente
- Si la imagen no es de comida o no es clara, indica overall_confidence "low"

Devuelve un nombre descriptivo para la comida completa en meal_name."""


async def analyze_food_photo(image_url: str) -> Optional[PhotoAnalysisAIResponse]:
    try:
        result = await vision_analysis(
            image_url=image_url,
            prompt=PHOTO_ANALYSIS_PROMPT,
            response_model=PhotoAnalysisAIResponse,
            temperature=0.2,
            max_tokens=2000,
        )
        logger.info("Photo analysis completed: items=%d confidence=%s", len(result.items), result.overall_confidence)
        return result
    except Exception as e:
        logger.error("Photo analysis failed: %s", type(e).__name__)
        return None
