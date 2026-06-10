from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services import auth_service
from app.services.auth_service import AuthService, verify_password


class FakeAuthRepo:
    def __init__(self, user=None):
        self.user = user
        self.tokens_by_hash = {}
        self.email_tokens_by_hash = {}
        self.updated_password_hash = None
        self.revoked_for = []
        self.refresh_revoked_for = []
        self.email_revoked_for = []
        self.email_verified_at = None

    async def get_by_email(self, email):
        if self.user and self.user.email == email.lower().strip():
            return self.user
        return None

    async def revoke_password_reset_tokens(self, user_id, used_at):
        self.revoked_for.append(user_id)

    async def revoke_refresh_tokens_for_user(self, user_id, revoked_at):
        self.refresh_revoked_for.append(user_id)

    async def revoke_email_verification_tokens(self, user_id, used_at):
        self.email_revoked_for.append(user_id)

    async def create_password_reset_token(self, user_id, token_hash, expires_at):
        token = SimpleNamespace(
            id=uuid4(),
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            used_at=None,
        )
        self.tokens_by_hash[token_hash] = token
        return token

    async def create_email_verification_token(self, user_id, token_hash, expires_at):
        token = SimpleNamespace(
            id=uuid4(),
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            used_at=None,
        )
        self.email_tokens_by_hash[token_hash] = token
        return token

    async def get_password_reset_token(self, token_hash):
        return self.tokens_by_hash.get(token_hash)

    async def update_password_hash(self, user_id, password_hash):
        self.updated_password_hash = password_hash

    async def update_password_hash_and_bump_token_version(self, user_id, password_hash):
        self.updated_password_hash = password_hash
        if self.user and self.user.id == user_id:
            self.user.token_version = getattr(self.user, "token_version", 0) + 1

    async def mark_password_reset_used(self, token_id, used_at):
        for token in self.tokens_by_hash.values():
            if token.id == token_id:
                token.used_at = used_at
                return

    async def consume_password_reset_token(self, token_hash, used_at):
        token = self.tokens_by_hash.get(token_hash)
        if not token:
            return None
        expires_at = token.expires_at if token.expires_at.tzinfo else token.expires_at.replace(tzinfo=timezone.utc)
        if token.used_at is not None or expires_at <= used_at:
            return None
        token.used_at = used_at
        return token

    async def consume_email_verification_token(self, token_hash, used_at):
        token = self.email_tokens_by_hash.get(token_hash)
        if not token:
            return None
        expires_at = token.expires_at if token.expires_at.tzinfo else token.expires_at.replace(tzinfo=timezone.utc)
        if token.used_at is not None or expires_at <= used_at:
            return None
        token.used_at = used_at
        return token

    async def mark_email_verified(self, user_id, verified_at):
        self.email_verified_at = verified_at
        if self.user and self.user.id == user_id:
            self.user.email_verified_at = verified_at


def make_service(repo: FakeAuthRepo) -> AuthService:
    service = AuthService.__new__(AuthService)
    service.db = None
    service.auth_repo = repo
    service.profile_repo = None
    return service


@pytest.mark.asyncio
async def test_password_reset_request_creates_hashed_token_and_sends_link(monkeypatch):
    sent = {}

    async def fake_send_email(recipient, reset_url, expires_minutes):
        sent.update(recipient=recipient, reset_url=reset_url, expires_minutes=expires_minutes)
        return True

    monkeypatch.setattr(auth_service, "send_password_reset_email", fake_send_email)
    user = SimpleNamespace(id=uuid4(), email="user@example.com", token_version=0)
    repo = FakeAuthRepo(user)

    await make_service(repo).request_password_reset("user@example.com")

    assert sent["recipient"] == "user@example.com"
    token = parse_qs(urlparse(sent["reset_url"]).query)["token"][0]
    assert len(token) >= 32
    assert len(repo.tokens_by_hash) == 1
    stored_hash = next(iter(repo.tokens_by_hash))
    assert stored_hash != token
    assert len(stored_hash) == 64
    assert repo.revoked_for == [user.id]


@pytest.mark.asyncio
async def test_password_reset_request_for_unknown_email_does_not_send(monkeypatch):
    sent = []

    async def fake_send_email(*args, **kwargs):
        sent.append(args)

    monkeypatch.setattr(auth_service, "send_password_reset_email", fake_send_email)

    await make_service(FakeAuthRepo()).request_password_reset("missing@example.com")

    assert sent == []


@pytest.mark.asyncio
async def test_reset_password_updates_hash_and_consumes_token(monkeypatch):
    sent = {}

    async def fake_send_email(recipient, reset_url, expires_minutes):
        sent["token"] = parse_qs(urlparse(reset_url).query)["token"][0]
        return True

    monkeypatch.setattr(auth_service, "send_password_reset_email", fake_send_email)
    user = SimpleNamespace(id=uuid4(), email="user@example.com", token_version=0)
    repo = FakeAuthRepo(user)
    service = make_service(repo)

    await service.request_password_reset("user@example.com")
    await service.reset_password(sent["token"], "new-secret-123")

    assert repo.updated_password_hash
    assert verify_password("new-secret-123", repo.updated_password_hash)
    assert next(iter(repo.tokens_by_hash.values())).used_at is not None
    assert user.token_version == 1
    assert repo.refresh_revoked_for == [user.id]


@pytest.mark.asyncio
async def test_reset_password_rejects_used_or_expired_tokens(monkeypatch):
    sent = {}

    async def fake_send_email(recipient, reset_url, expires_minutes):
        sent["token"] = parse_qs(urlparse(reset_url).query)["token"][0]
        return True

    monkeypatch.setattr(auth_service, "send_password_reset_email", fake_send_email)
    user = SimpleNamespace(id=uuid4(), email="user@example.com", token_version=0)
    repo = FakeAuthRepo(user)
    service = make_service(repo)

    await service.request_password_reset("user@example.com")
    token = next(iter(repo.tokens_by_hash.values()))
    token.used_at = datetime.now(timezone.utc)
    with pytest.raises(HTTPException):
        await service.reset_password(sent["token"], "new-secret-123")

    token.used_at = None
    token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    with pytest.raises(HTTPException):
        await service.reset_password(sent["token"], "new-secret-123")


@pytest.mark.asyncio
async def test_email_verification_request_creates_hashed_token_and_sends_link(monkeypatch):
    sent = {}

    async def fake_send_email(recipient, verify_url, expires_minutes):
        sent.update(recipient=recipient, verify_url=verify_url, expires_minutes=expires_minutes)
        return True

    monkeypatch.setattr(auth_service, "send_email_verification_email", fake_send_email)
    user = SimpleNamespace(id=uuid4(), email="user@example.com", token_version=0, email_verified_at=None)
    repo = FakeAuthRepo(user)

    await make_service(repo).request_email_verification("user@example.com")

    assert sent["recipient"] == "user@example.com"
    token = parse_qs(urlparse(sent["verify_url"]).query)["token"][0]
    assert len(token) >= 32
    assert len(repo.email_tokens_by_hash) == 1
    stored_hash = next(iter(repo.email_tokens_by_hash))
    assert stored_hash != token
    assert len(stored_hash) == 64
    assert repo.email_revoked_for == [user.id]


@pytest.mark.asyncio
async def test_email_verification_request_for_unknown_or_verified_email_does_not_send(monkeypatch):
    sent = []

    async def fake_send_email(*args, **kwargs):
        sent.append(args)

    monkeypatch.setattr(auth_service, "send_email_verification_email", fake_send_email)

    await make_service(FakeAuthRepo()).request_email_verification("missing@example.com")

    verified_user = SimpleNamespace(
        id=uuid4(),
        email="verified@example.com",
        token_version=0,
        email_verified_at=datetime.now(timezone.utc),
    )
    await make_service(FakeAuthRepo(verified_user)).request_email_verification("verified@example.com")

    assert sent == []


@pytest.mark.asyncio
async def test_verify_email_marks_user_verified_and_consumes_token(monkeypatch):
    sent = {}

    async def fake_send_email(recipient, verify_url, expires_minutes):
        sent["token"] = parse_qs(urlparse(verify_url).query)["token"][0]
        return True

    monkeypatch.setattr(auth_service, "send_email_verification_email", fake_send_email)
    user = SimpleNamespace(id=uuid4(), email="user@example.com", token_version=0, email_verified_at=None)
    repo = FakeAuthRepo(user)
    service = make_service(repo)

    await service.request_email_verification("user@example.com")
    await service.verify_email(sent["token"])

    assert user.email_verified_at is not None
    assert next(iter(repo.email_tokens_by_hash.values())).used_at is not None
    assert repo.email_revoked_for == [user.id, user.id]


@pytest.mark.asyncio
async def test_verify_email_rejects_used_or_expired_tokens(monkeypatch):
    sent = {}

    async def fake_send_email(recipient, verify_url, expires_minutes):
        sent["token"] = parse_qs(urlparse(verify_url).query)["token"][0]
        return True

    monkeypatch.setattr(auth_service, "send_email_verification_email", fake_send_email)
    user = SimpleNamespace(id=uuid4(), email="user@example.com", token_version=0, email_verified_at=None)
    repo = FakeAuthRepo(user)
    service = make_service(repo)

    await service.request_email_verification("user@example.com")
    token = next(iter(repo.email_tokens_by_hash.values()))
    token.used_at = datetime.now(timezone.utc)
    with pytest.raises(HTTPException):
        await service.verify_email(sent["token"])

    token.used_at = None
    token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    with pytest.raises(HTTPException):
        await service.verify_email(sent["token"])
