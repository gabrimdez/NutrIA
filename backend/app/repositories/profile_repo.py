from typing import Optional
from uuid import UUID
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import DailyTarget, Goal, Profile, ProfileAvatar, UserPreference


class ProfileRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_user_id(self, user_id: str) -> Optional[Profile]:
        stmt = select(Profile).where(Profile.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create(self, user_id: str, **kwargs) -> Profile:
        profile = Profile(user_id=user_id, **kwargs)
        self.db.add(profile)
        await self.db.flush()
        return profile

    async def update_profile(self, user_id: str, **kwargs) -> Optional[Profile]:
        stmt = (
            update(Profile)
            .where(Profile.user_id == user_id)
            .values(**{k: v for k, v in kwargs.items() if v is not None})
            .returning(Profile)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def clear_avatar(self, user_id: str) -> Optional[Profile]:
        stmt = (
            update(Profile)
            .where(Profile.user_id == user_id)
            .values(avatar_url=None)
            .returning(Profile)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def save_avatar(self, user_id: str, *, asset_id: str, mime_type: str, data: bytes) -> ProfileAvatar:
        await self.db.execute(delete(ProfileAvatar).where(ProfileAvatar.user_id == user_id))
        avatar = ProfileAvatar(
            asset_id=asset_id,
            user_id=user_id,
            mime_type=mime_type,
            data=data,
            size_bytes=len(data),
        )
        self.db.add(avatar)
        await self.db.flush()
        return avatar

    async def get_avatar_by_asset_id(self, asset_id: str) -> Optional[ProfileAvatar]:
        stmt = select(ProfileAvatar).where(ProfileAvatar.asset_id == asset_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_avatar_by_asset_id(self, asset_id: str | None) -> None:
        if not asset_id:
            return
        await self.db.execute(delete(ProfileAvatar).where(ProfileAvatar.asset_id == asset_id))

    async def get_preferences(self, profile_id: UUID) -> Optional[UserPreference]:
        stmt = select(UserPreference).where(UserPreference.profile_id == profile_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_preferences(self, profile_id: UUID, **kwargs) -> UserPreference:
        mapped_cols = {c.key for c in UserPreference.__table__.columns}
        safe_kwargs = {k: v for k, v in kwargs.items() if k in mapped_cols}
        existing = await self.get_preferences(profile_id)
        if existing:
            for k, v in safe_kwargs.items():
                if v is not None:
                    setattr(existing, k, v)
            await self.db.flush()
            return existing
        pref = UserPreference(profile_id=profile_id, **safe_kwargs)
        self.db.add(pref)
        await self.db.flush()
        return pref

    async def create_goal(self, profile_id: UUID, **kwargs) -> Goal:
        await self.db.execute(
            update(Goal).where(Goal.profile_id == profile_id).values(is_active=False)
        )
        goal = Goal(profile_id=profile_id, is_active=True, **kwargs)
        self.db.add(goal)
        await self.db.flush()
        return goal

    async def get_active_goal(self, profile_id: UUID) -> Optional[Goal]:
        stmt = select(Goal).where(Goal.profile_id == profile_id, Goal.is_active == True)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_active_goal_by_user_id(self, user_id: str) -> Optional[Goal]:
        profile = await self.get_by_user_id(user_id)
        if not profile:
            return None
        return await self.get_active_goal(profile.id)

    async def update_active_goal(self, user_id: str, **kwargs) -> Optional[Goal]:
        goal = await self.get_active_goal_by_user_id(user_id)
        if not goal:
            return None
        for k, v in kwargs.items():
            if v is not None:
                setattr(goal, k, v)
        await self.db.flush()
        return goal

    async def create_daily_target(self, goal_id: UUID, user_id: str, **kwargs) -> DailyTarget:
        await self.db.execute(
            update(DailyTarget).where(DailyTarget.user_id == user_id).values(is_active=False)
        )
        target = DailyTarget(goal_id=goal_id, user_id=user_id, is_active=True, **kwargs)
        self.db.add(target)
        await self.db.flush()
        return target

    async def get_active_target(self, user_id: str) -> Optional[DailyTarget]:
        stmt = select(DailyTarget).where(DailyTarget.user_id == user_id, DailyTarget.is_active == True)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_active_target(self, user_id: str, **kwargs) -> Optional[DailyTarget]:
        target = await self.get_active_target(user_id)
        if not target:
            return None
        for k, v in kwargs.items():
            if v is not None:
                setattr(target, k, v)
        await self.db.flush()
        return target
