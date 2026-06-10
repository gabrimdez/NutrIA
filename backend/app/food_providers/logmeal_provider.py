"""LogMeal API provider for food photo analysis."""
import logging
from typing import List, Optional

import httpx

from app.core.config import get_settings
from app.food_providers.mappers.logmeal_mapper import map_logmeal_recognition
from app.schemas.food import PhotoCandidate

logger = logging.getLogger(__name__)

_LOGMEAL_BASE = "https://api.logmeal.com/v2"


async def logmeal_analyze(image_bytes: bytes, mime_type: str = "image/jpeg") -> Optional[List[PhotoCandidate]]:
    settings = get_settings()
    api_key = (settings.logmeal_api_key or "").strip()
    if not api_key:
        return None

    timeout = settings.nutrition_timeout_ms / 1000.0
    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            ext = "jpg" if "jpeg" in mime_type else mime_type.split("/")[-1]
            files = {"image": (f"photo.{ext}", image_bytes, mime_type)}

            recog_resp = await client.post(
                f"{_LOGMEAL_BASE}/image/segmentation/complete",
                headers=headers,
                files=files,
            )
            if recog_resp.status_code == 429:
                logger.warning("LogMeal rate-limited (429)")
                return None
            recog_resp.raise_for_status()
            recog_data = recog_resp.json()

            image_id = recog_data.get("imageId")
            nutrition_data: Optional[dict] = None
            if image_id:
                try:
                    nut_resp = await client.post(
                        f"{_LOGMEAL_BASE}/recipe/nutritionalInfo",
                        headers=headers,
                        json={"imageId": image_id},
                    )
                    if nut_resp.status_code == 200:
                        nutrition_data = nut_resp.json()
                except Exception as e:
                    logger.warning("LogMeal nutrition info failed: %s", e)

            candidates = map_logmeal_recognition(recog_data, nutrition_data)
            return candidates if candidates else None

    except Exception as e:
        logger.warning("LogMeal analysis failed: %s", e)
        return None
