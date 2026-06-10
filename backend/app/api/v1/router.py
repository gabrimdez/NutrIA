from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    auth_google,
    profile,
    avatar,
    onboarding,
    foods,
    meals,
    diary,
    progress,
    plans,
    chat,
    nutrition,
    badges,
    workouts,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(auth_google.router)
api_router.include_router(profile.router)
api_router.include_router(avatar.router)
api_router.include_router(onboarding.router)
api_router.include_router(foods.router)
api_router.include_router(meals.router)
api_router.include_router(diary.router)
api_router.include_router(progress.router)
api_router.include_router(plans.router)
api_router.include_router(chat.router)
api_router.include_router(nutrition.router)
api_router.include_router(badges.router_user)
api_router.include_router(badges.router_admin)
api_router.include_router(workouts.router)
