from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_async_session_maker
from app.models.models import AccountRateLimit


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def check_account_rate_limit(
    db: AsyncSession,
    key: str,
    *,
    limit: int,
    window_seconds: int,
) -> None:
    """DB-backed fixed-window limiter for account/email scoped auth attempts."""
    factory = get_async_session_maker()
    async with factory() as rate_db:
        try:
            await _check_account_rate_limit_in_session(rate_db, key, limit=limit, window_seconds=window_seconds)
            await rate_db.commit()
        except Exception:
            await rate_db.rollback()
            raise


async def _check_account_rate_limit_in_session(
    db: AsyncSession,
    key: str,
    *,
    limit: int,
    window_seconds: int,
) -> None:
    """Internal implementation. Kept separate so auth attempts cannot rollback limiter writes."""

    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=window_seconds)
    await db.execute(delete(AccountRateLimit).where(AccountRateLimit.updated_at < window_start - timedelta(minutes=5)))

    stmt = select(AccountRateLimit).where(AccountRateLimit.key == key).with_for_update()
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if not row or _as_utc(row.window_start) < window_start:
        if row:
            row.window_start = now
            row.count = 1
            row.updated_at = now
        else:
            db.add(AccountRateLimit(key=key, window_start=now, count=1, updated_at=now))
        await db.flush()
        return

    if row.count >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiadas peticiones. Intentalo mas tarde.",
        )
    row.count += 1
    row.updated_at = now
    await db.flush()
