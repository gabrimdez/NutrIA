from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rate_limit import limit_if_enabled
from app.core.security import get_current_user_id
from app.db.session import get_db
from app.services.onboarding_service import OnboardingService
from app.schemas.profile import (
    OnboardingRequest,
    OnboardingResponse,
    ProfileResponse,
    DailyTargetResponse,
    ActiveGoalResponse,
)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


@router.post("/complete", response_model=OnboardingResponse)
@limit_if_enabled("10/minute")
async def complete_onboarding(
    request: Request,
    data: OnboardingRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    service = OnboardingService(db)
    result = await service.complete_onboarding(user_id, data)
    return OnboardingResponse(
        profile=ProfileResponse.model_validate(result["profile"]),
        daily_targets=DailyTargetResponse(**result["daily_targets"]),
        summary=result["summary"],
        active_goal=ActiveGoalResponse.model_validate(result["goal"]),
    )
