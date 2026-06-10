import base64

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Literal, Optional, List
from uuid import UUID
from datetime import datetime

from app.core.image_uploads import normalize_image_mime, sniff_image_mime

# Tamaño máximo decodificado (~2.5 MB) para no saturar Groq ni el JSON.
_MAX_CHAT_IMAGE_DECODED_BYTES = 2_500_000
_ALLOWED_IMAGE_MIMES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/gif"}
)


class PhotoCorrectionItem(BaseModel):
    name: str = ""
    grams: float = 0
    kcal: float = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0


class PhotoCorrectionContext(BaseModel):
    meal_name: str = ""
    items: List[PhotoCorrectionItem] = []


class ChatMessageRequest(BaseModel):
    session_id: Optional[UUID] = None
    message: str = Field(min_length=1, max_length=2000)
    photo_context: Optional[PhotoCorrectionContext] = None
    image_base64: Optional[str] = Field(default=None, max_length=3_600_000)
    image_mime_type: Optional[str] = Field(default=None, max_length=64)

    @field_validator("message")
    @classmethod
    def validate_message_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("El mensaje no puede estar vacío.")
        return v

    @field_validator("image_base64")
    @classmethod
    def validate_image_size(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        raw = str(v).strip()
        try:
            decoded = base64.b64decode(raw, validate=True)
        except Exception:
            raise ValueError("image_base64 no es base64 válido") from None
        if len(decoded) > _MAX_CHAT_IMAGE_DECODED_BYTES:
            raise ValueError(
                f"La imagen supera el máximo permitido ({_MAX_CHAT_IMAGE_DECODED_BYTES // 1_000_000} MB aprox.)"
            )
        return raw

    @model_validator(mode="after")
    def image_mime_consistent(self):
        if self.image_base64:
            mt = (self.image_mime_type or "image/jpeg").split(";")[0].strip().lower()
            mt = normalize_image_mime(mt) or mt
            if mt not in _ALLOWED_IMAGE_MIMES:
                raise ValueError("Tipo MIME de imagen no permitido (usa JPEG, PNG, WebP o GIF)")
            detected = sniff_image_mime(base64.b64decode(self.image_base64, validate=True))
            if detected != mt:
                raise ValueError("El tipo MIME no coincide con el contenido de la imagen")
            object.__setattr__(self, "image_mime_type", mt)
        elif self.image_mime_type:
            raise ValueError("image_mime_type sin image_base64")
        return self


class ChatMessageResponse(BaseModel):
    id: UUID
    session_id: UUID
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CorrectedItem(BaseModel):
    name: str
    grams: float
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float


class TrainingExercise(BaseModel):
    name: str
    sets: int = 0
    reps: str = ""


class TrainingDay(BaseModel):
    name: str
    exercises: List[TrainingExercise] = []


class TrainingPlan(BaseModel):
    kind: Literal["training", "rehab"] = "training"
    name: str
    split: str = ""
    focus_note: str = ""
    disclaimer: str = ""
    days: List[TrainingDay] = []


class ChatResponse(BaseModel):
    message: ChatMessageResponse
    session_id: UUID
    actions_taken: List[str] = []
    corrected_items: Optional[List[CorrectedItem]] = None
    training_plan: Optional[TrainingPlan] = None


class ChatSessionResponse(BaseModel):
    id: UUID
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_message: Optional[str] = None

    model_config = {"from_attributes": True}


class ChatSessionDetailResponse(BaseModel):
    id: UUID
    title: Optional[str] = None
    messages: List[ChatMessageResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class CoachSavedInsightCreateDTO(BaseModel):
    body: str = Field(..., min_length=3, max_length=8000)
    source_chat_message_id: Optional[UUID] = None


class CoachSavedInsightResponse(BaseModel):
    id: UUID
    body: str
    source_chat_message_id: Optional[UUID] = None
    created_at: datetime

    model_config = {"from_attributes": True}
