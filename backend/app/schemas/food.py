import base64
import ipaddress
import socket
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List, Literal, Any
from uuid import UUID

from app.core.image_uploads import normalize_image_mime, sniff_image_mime


class FoodSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=200)
    limit: int = Field(default=20, ge=1, le=50)


_MACRO_ESTIMATE_UNITS = {"g", "ml", "oz", "lb", "cup", "tbsp", "tsp"}


class FoodMacroEstimateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    quantity: float = Field(gt=0, le=10000)
    unit: str = Field(min_length=1, max_length=8)

    @field_validator("unit")
    @classmethod
    def validate_unit(cls, v: str) -> str:
        u = (v or "").strip().lower()
        if u not in _MACRO_ESTIMATE_UNITS:
            raise ValueError(f"unit debe ser una de: {sorted(_MACRO_ESTIMATE_UNITS)}")
        return u


class FoodMacroEstimateResponse(BaseModel):
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: Optional[Literal["high", "medium", "low"]] = None
    notes: str = ""


class FoodItem(BaseModel):
    id: Optional[UUID] = None
    name: str
    name_es: Optional[str] = None
    category: Optional[str] = None
    provider: str
    external_id: Optional[str] = None
    barcode: Optional[str] = None
    kcal_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    fiber_per_100g: Optional[float] = None
    serving_size_g: Optional[float] = None
    serving_description: Optional[str] = None

    model_config = {"from_attributes": True}


class FoodSearchResponse(BaseModel):
    results: List[FoodItem]
    total: int


_MAX_PHOTO_IMAGE_DECODED_BYTES = 2_500_000
_ALLOWED_PHOTO_IMAGE_MIMES = frozenset({"image/jpeg", "image/png", "image/webp"})
_BLOCKED_IMAGE_URL_HOSTS = frozenset({"localhost", "localhost.localdomain"})
_BLOCKED_IMAGE_URL_SUFFIXES = (".localhost", ".local", ".internal", ".lan")


def _is_public_image_host(hostname: str | None) -> bool:
    host = (hostname or "").strip().strip("[]").lower()
    if not host or host in _BLOCKED_IMAGE_URL_HOSTS or host.endswith(_BLOCKED_IMAGE_URL_SUFFIXES):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        try:
            resolved = {
                info[4][0]
                for info in socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
                if info and info[4]
            }
        except socket.gaierror:
            return True
        return all(_is_public_image_host(addr) for addr in resolved)
    return not (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


class PhotoAnalyzeRequest(BaseModel):
    """URL publica accesible desde internet o base64 (sin prefijo data:) para analisis con Groq."""

    image_url: Optional[str] = Field(default=None, max_length=2048)
    image_base64: Optional[str] = Field(default=None, max_length=3_600_000)
    mime_type: str = Field(default="image/jpeg", max_length=64)

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        raw = str(v).strip()
        parsed = urlparse(raw)
        if parsed.scheme != "https" or not parsed.netloc or not _is_public_image_host(parsed.hostname):
            raise ValueError("image_url debe ser una URL https publica")
        return raw

    @field_validator("image_base64")
    @classmethod
    def validate_image_base64(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        raw = str(v).strip()
        if raw.startswith("data:"):
            try:
                _, raw = raw.split(",", 1)
            except ValueError:
                raise ValueError("image_base64 data URL no valida") from None
        try:
            decoded = base64.b64decode(raw, validate=True)
        except Exception:
            raise ValueError("image_base64 no es base64 valido") from None
        if len(decoded) > _MAX_PHOTO_IMAGE_DECODED_BYTES:
            raise ValueError(
                f"La imagen supera el maximo permitido ({_MAX_PHOTO_IMAGE_DECODED_BYTES // 1_000_000} MB aprox.)"
            )
        if sniff_image_mime(decoded) not in _ALLOWED_PHOTO_IMAGE_MIMES:
            raise ValueError("image_base64 no contiene una imagen JPEG, PNG o WebP valida")
        return raw

    @model_validator(mode="after")
    def one_source(self):
        u, b = (self.image_url or "").strip(), (self.image_base64 or "").strip()
        if not u and not b:
            raise ValueError("Indica image_url o image_base64")
        if u and b:
            raise ValueError("Indica solo image_url o image_base64, no ambos")
        mt = normalize_image_mime((self.mime_type or "image/jpeg").split(";")[0].strip().lower()) or "image/jpeg"
        if mt not in _ALLOWED_PHOTO_IMAGE_MIMES:
            raise ValueError("Tipo MIME de imagen no permitido (usa JPEG, PNG o WebP)")
        if b:
            detected = sniff_image_mime(base64.b64decode(b, validate=True))
            if detected != mt:
                raise ValueError("mime_type no coincide con el contenido de image_base64")
        object.__setattr__(self, "mime_type", mt)
        return self


class PhotoAnalysisDetectedItem(BaseModel):
    detected_name: str
    normalized_name: str
    estimated_grams: float = Field(ge=0)
    estimated_kcal: float = Field(default=0, ge=0)
    estimated_protein_g: float = Field(default=0, ge=0)
    estimated_carbs_g: float = Field(default=0, ge=0)
    estimated_fat_g: float = Field(default=0, ge=0)
    confidence: str  # high, medium, low
    assumptions: List[str] = []


class PhotoAnalysisAIResponse(BaseModel):
    meal_name: str
    items: List[PhotoAnalysisDetectedItem]
    overall_confidence: str
    notes: List[str] = []


class EnrichedFoodItem(BaseModel):
    detected_name: str
    normalized_name: str
    matched_food_id: Optional[UUID] = None
    provider: Optional[str] = None
    estimated_grams: float
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: str
    assumptions: List[str] = []


class PhotoAnalysisResponse(BaseModel):
    meal_name: str
    items: List[EnrichedFoodItem]
    total_kcal: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    overall_confidence: str
    notes: List[str] = []
    photo_url: Optional[str] = None


# ---------------------------------------------------------------------------
# Normalized nutrition model
# ---------------------------------------------------------------------------

class MacroBlock(BaseModel):
    calories: Optional[float] = None
    protein: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    fiber: Optional[float] = None


class ServingInfo(BaseModel):
    amount: Optional[float] = None
    unit: Optional[str] = None
    grams: Optional[float] = None


class NutritionFoodItem(BaseModel):
    id: Optional[str] = None
    source: Literal["fatsecret", "logmeal", "openfoodfacts", "generic", "groq"] = "generic"
    source_id: Optional[str] = None
    type: Literal["generic", "branded", "packaged", "meal"] = "generic"
    name: str
    normalized_name: str
    brand: Optional[str] = None
    barcode: Optional[str] = None
    language: Optional[str] = None
    image_url: Optional[str] = None
    serving: Optional[ServingInfo] = None
    per_100g: Optional[MacroBlock] = None
    per_serving: Optional[MacroBlock] = None
    confidence: Optional[float] = None
    requires_confirmation: bool = False
    raw_summary: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None

    model_config = {"from_attributes": True}


class NutritionSearchResponse(BaseModel):
    results: List[NutritionFoodItem]
    total: int
    query: str
    normalized_query: str


class NutritionBarcodeResponse(BaseModel):
    found: bool
    item: Optional[NutritionFoodItem] = None
    message: Optional[str] = None


class PhotoCandidate(BaseModel):
    name: str
    normalized_name: str
    estimated_grams: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    per_100g: Optional[MacroBlock] = None
    per_serving: Optional[MacroBlock] = None
    source: str = "logmeal"
    source_id: Optional[str] = None
    requires_confirmation: bool = True
    image_url: Optional[str] = None


class NutritionPhotoResponse(BaseModel):
    candidates: List[PhotoCandidate]
    overall_confidence: float = Field(ge=0, le=1)
    source: str = "logmeal"
    notes: List[str] = []


class NutritionConfirmItem(BaseModel):
    source: Optional[str] = None
    source_id: Optional[str] = None
    food_catalog_id: Optional[UUID] = None
    custom_name: Optional[str] = Field(default=None, max_length=200)
    grams: float = Field(ge=0, le=5000)
    kcal: float = Field(ge=0, le=20000)
    protein_g: float = Field(ge=0, le=2000)
    carbs_g: float = Field(ge=0, le=2000)
    fat_g: float = Field(ge=0, le=2000)
    eaten: bool = True


class NutritionConfirmRequest(BaseModel):
    date: str
    meal_type: str
    title: Optional[str] = Field(default=None, max_length=200)
    photo_url: Optional[str] = Field(default=None, max_length=2048)
    items: List[NutritionConfirmItem] = Field(min_length=1, max_length=80)
    ai_confidence: Optional[str] = Field(default=None, max_length=40)
    notes: Optional[str] = Field(default=None, max_length=2000)
