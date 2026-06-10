from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core import security
from app.core.security import AUTH_COOKIE_NAME, CSRF_COOKIE_NAME
from app.services.auth_service import create_access_token


class FakeAuthRepository:
    def __init__(self, user):
        self.user = user

    async def get_by_id(self, user_id):
        if str(self.user.id) == str(user_id):
            return self.user
        return None


@pytest.mark.asyncio
async def test_current_user_rejects_stale_token_version(monkeypatch):
    user = SimpleNamespace(id=uuid4(), token_version=2, email_verified_at=object())
    token = create_access_token(str(user.id), "user@example.com", token_version=1)

    monkeypatch.setattr(security, "AuthRepository", lambda db: FakeAuthRepository(user))

    with pytest.raises(HTTPException) as exc:
        await security.get_current_user_id(
            request=SimpleNamespace(cookies={}),
            credentials=SimpleNamespace(credentials=token),
            db=object(),
        )

    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_current_user_accepts_current_token_version(monkeypatch):
    user = SimpleNamespace(id=uuid4(), token_version=3, email_verified_at=object())
    token = create_access_token(str(user.id), "user@example.com", token_version=3)

    monkeypatch.setattr(security, "AuthRepository", lambda db: FakeAuthRepository(user))

    assert await security.get_current_user_id(
        request=SimpleNamespace(cookies={}),
        credentials=SimpleNamespace(credentials=token),
        db=object(),
    ) == str(user.id)


@pytest.mark.asyncio
async def test_cookie_auth_requires_csrf_for_unsafe_methods(monkeypatch):
    user = SimpleNamespace(id=uuid4(), token_version=1, email_verified_at=object())
    token = create_access_token(str(user.id), "user@example.com", token_version=1)
    monkeypatch.setattr(security, "AuthRepository", lambda db: FakeAuthRepository(user))

    with pytest.raises(HTTPException) as exc:
        await security.get_current_user_id(
            request=SimpleNamespace(method="POST", cookies={AUTH_COOKIE_NAME: token}, headers={}),
            credentials=None,
            db=object(),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_cookie_auth_accepts_matching_csrf_for_unsafe_methods(monkeypatch):
    user = SimpleNamespace(id=uuid4(), token_version=1, email_verified_at=object())
    token = create_access_token(str(user.id), "user@example.com", token_version=1)
    csrf = "csrf-token"
    monkeypatch.setattr(security, "AuthRepository", lambda db: FakeAuthRepository(user))

    assert await security.get_current_user_id(
        request=SimpleNamespace(
            method="POST",
            cookies={AUTH_COOKIE_NAME: token, CSRF_COOKIE_NAME: csrf},
            headers={"x-csrf-token": csrf},
        ),
        credentials=None,
        db=object(),
    ) == str(user.id)
