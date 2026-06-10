import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.public_errors import detail_503_upstream
from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.services.chat_service import ChatService
from app.schemas.chat import (
    ChatMessageRequest,
    ChatResponse,
    ChatMessageResponse,
    ChatSessionResponse,
    ChatSessionDetailResponse,
    CorrectedItem,
    TrainingPlan,
    CoachSavedInsightCreateDTO,
    CoachSavedInsightResponse,
)

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)


@router.post("/message", response_model=ChatResponse)
@limit_if_enabled("60/minute")
async def send_message(
    request: Request,
    data: ChatMessageRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    try:
        result = await service.send_message(
            user_id,
            data.message,
            data.session_id,
            photo_context=data.photo_context,
            image_base64=data.image_base64,
            image_mime_type=data.image_mime_type,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error en chat IA: %s", e)
        raise HTTPException(status_code=503, detail=detail_503_upstream(e)) from e

    corrected = None
    raw_corrected = result.get("corrected_items")
    if raw_corrected:
        corrected = [CorrectedItem(**ci) for ci in raw_corrected]

    tp = None
    raw_tp = result.get("training_plan")
    if raw_tp:
        tp = TrainingPlan(**raw_tp)

    return ChatResponse(
        message=ChatMessageResponse.model_validate(result["message"]),
        session_id=result["session_id"],
        actions_taken=result["actions_taken"],
        corrected_items=corrected,
        training_plan=tp,
    )


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def get_sessions(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    sessions = await service.get_sessions(user_id)
    return [ChatSessionResponse.model_validate(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailResponse)
async def get_session_detail(
    session_id: UUID,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    session = await service.get_session_detail(session_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return ChatSessionDetailResponse(
        id=session.id,
        title=session.title,
        messages=[ChatMessageResponse.model_validate(m) for m in session.messages],
        created_at=session.created_at,
    )


@router.post("/insights", response_model=CoachSavedInsightResponse)
@limit_if_enabled("30/minute")
async def save_coach_insight(
    request: Request,
    data: CoachSavedInsightCreateDTO,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    row = await service.save_coach_insight(
        user_id, data.body, data.source_chat_message_id
    )
    return CoachSavedInsightResponse.model_validate(row)


@router.get("/insights", response_model=list[CoachSavedInsightResponse])
async def list_coach_insights(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    rows = await service.list_coach_insights(user_id)
    return [CoachSavedInsightResponse.model_validate(r) for r in rows]


@router.delete("/insights/{insight_id}", status_code=204)
async def delete_coach_insight(
    insight_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    deleted = await service.delete_coach_insight(insight_id, user_id)
    if not deleted:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Insight not found")
