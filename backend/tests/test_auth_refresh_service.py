from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.auth_service import AuthService, _hash_refresh_token


class FakeAuthRepo:
    def __init__(self, stored, user):
        self.stored = stored
        self.user = user
        self.revoked = False

    async def get_refresh_token(self, token_hash):
        return self.stored if self.stored.token_hash == token_hash else None

    async def get_by_id(self, user_id):
        return self.user if str(self.user.id) == str(user_id) else None

    async def revoke_refresh_token(self, token_hash, revoked_at, replaced_by_hash=None):
        self.revoked = True


@pytest.mark.asyncio
async def test_refresh_rejects_token_from_previous_token_version():
    raw_token = "refresh-token-value"
    user_id = uuid4()
    stored = SimpleNamespace(
        user_id=user_id,
        token_hash=_hash_refresh_token(raw_token),
        token_version=1,
        expires_at=None,
        revoked_at=None,
    )
    user = SimpleNamespace(id=user_id, token_version=2, email="user@example.com")
    service = AuthService(db=object())
    fake_repo = FakeAuthRepo(stored, user)
    service.auth_repo = fake_repo

    with pytest.raises(HTTPException) as exc:
        await service.refresh_session(raw_token)

    assert exc.value.status_code == 401
    assert fake_repo.revoked is True
