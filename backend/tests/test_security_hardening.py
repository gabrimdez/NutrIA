import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient
from types import SimpleNamespace
import logging

from app.api.v1.endpoints import auth as auth_endpoint
from app.api.v1.endpoints import avatar as avatar_endpoint
from app.core import account_rate_limit
from app.core import admin_badges
from app.core.config import get_settings
from app.core.image_uploads import sniff_image_mime
from app.core.log_sanitize import sanitize_validation_log_line
from app.core.security import get_current_user_id
from app.db.session import _build_connect_args, get_db
from app.main import app, _docs_kwargs, _unhandled_exception_handler
from app.schemas.chat import ChatMessageRequest
from app.schemas.auth import PasswordResetConfirmRequest, RegisterRequest
from app.schemas.food import NutritionConfirmRequest, PhotoAnalyzeRequest
from app.schemas.meal import CustomFoodCreate
from app.schemas.profile import FoodRestrictionsUpdate, OnboardingRequest, ProfileUpdate
from app.schemas.progress import ActivityLogCreate, WeightLogCreate
from app.schemas.settings import PlanPreferencesUpdate
from app.services import badge_integration
from app.services.chat_service import ChatService


def test_photo_analyze_rejects_local_or_non_https_urls():
    for url in (
        "http://example.com/image.jpg",
        "https://localhost/image.jpg",
        "https://127.0.0.1/image.jpg",
        "https://10.0.0.5/image.jpg",
        "https://service.local/image.jpg",
    ):
        with pytest.raises(ValidationError):
            PhotoAnalyzeRequest(image_url=url)


def test_photo_analyze_accepts_public_https_url():
    req = PhotoAnalyzeRequest(image_url="https://cdn.example.com/image.jpg")
    assert req.image_url == "https://cdn.example.com/image.jpg"


def test_image_magic_byte_detection():
    assert sniff_image_mime(b"\xff\xd8\xff\xe0data") == "image/jpeg"
    assert sniff_image_mime(b"\x89PNG\r\n\x1a\ndata") == "image/png"
    assert sniff_image_mime(b"RIFF1234WEBPdata") == "image/webp"
    assert sniff_image_mime(b"<script>alert(1)</script>") is None


def test_photo_analyze_base64_requires_real_image_magic():
    with pytest.raises(ValidationError):
        PhotoAnalyzeRequest(image_base64="PHNjcmlwdD5hPC9zY3JpcHQ=", mime_type="image/png")


def test_chat_base64_mime_must_match_magic():
    with pytest.raises(ValidationError):
        ChatMessageRequest(
            message="analiza esta imagen",
            image_base64="/9j/4GRhdGE=",
            image_mime_type="image/png",
        )


def test_auth_rejects_passwords_shorter_than_testing_minimum():
    with pytest.raises(ValidationError):
        RegisterRequest(email="user@example.com", password="abcde")
    with pytest.raises(ValidationError):
        PasswordResetConfirmRequest(token="x" * 40, new_password="abcde")


def test_auth_accepts_six_character_testing_passwords():
    req = RegisterRequest(email="user@example.com", password="abcdef")
    assert req.password == "abcdef"


def test_validation_log_masks_sensitive_inputs():
    line = sanitize_validation_log_line(
        "/api/v1/auth/password/reset",
        "POST",
        [
            {
                "type": "string_too_short",
                "loc": ("body", "new_password"),
                "msg": "String should have at least 6 characters",
                "input": "secret-password",
            },
            {
                "type": "value_error",
                "loc": ("body", "token"),
                "msg": "Invalid token",
                "input": "reset-token-value",
            },
        ],
    )
    assert "secret-password" not in line
    assert "reset-token-value" not in line
    assert "'input': '***'" in line


def test_validation_response_masks_sensitive_inputs():
    response = TestClient(app).post(
        "/api/v1/auth/password/reset",
        json={"token": "reset-token-value", "new_password": "abcde"},
    )
    assert response.status_code == 422
    body = response.json()
    assert "reset-token-value" not in str(body)
    assert "abcde" not in str(body)
    assert any(error.get("input") == "***" for error in body["detail"])


def test_account_rate_limit_email_key_does_not_store_plain_email():
    key = auth_endpoint._email_key("login", "User@Example.com")
    assert key.startswith("login:")
    assert "User@Example.com" not in key
    assert "user@example.com" not in key
    assert key == auth_endpoint._email_key("login", " user@example.com ")
    assert key != auth_endpoint._email_key("register", "user@example.com")


@pytest.mark.asyncio
async def test_badges_admin_key_supports_rotatable_actor_keys(monkeypatch):
    secret = "s" * 40
    monkeypatch.setenv("BADGES_ADMIN_API_KEY", f"ops:{secret},support:{'t' * 40}")
    get_settings.cache_clear()
    try:
        principal = await admin_badges.require_badges_admin_key(x_admin_key=secret)
    finally:
        get_settings.cache_clear()
    assert principal.actor == "ops"
    assert principal.key_fingerprint
    assert secret not in principal.key_fingerprint


@pytest.mark.asyncio
async def test_chat_tool_errors_are_not_returned_raw():
    class BrokenProfileRepo:
        async def get_by_user_id(self, user_id):
            raise RuntimeError("db password=secret internal detail")

    service = ChatService.__new__(ChatService)
    service.profile_repo = BrokenProfileRepo()
    result = await service._execute_tool("user-1", "get_user_context", {})
    assert result == {"error": "tool_failed"}


def test_production_docs_are_disabled():
    assert _docs_kwargs(True) == {"docs_url": None, "redoc_url": None, "openapi_url": None}
    assert _docs_kwargs(False)["openapi_url"] == "/openapi.json"


def test_nutrition_confirm_rejects_unbounded_item_values():
    with pytest.raises(ValidationError):
        NutritionConfirmRequest(
            date="2026-04-28",
            meal_type="lunch",
            items=[
                {
                    "custom_name": "Impossible food",
                    "grams": 999999,
                    "kcal": 10,
                    "protein_g": 1,
                    "carbs_g": 1,
                    "fat_g": 1,
                }
            ],
        )


def test_custom_food_rejects_unrealistic_per_100g_macros():
    with pytest.raises(ValidationError):
        CustomFoodCreate(
            name="Impossible food",
            kcal_per_100g=1200,
            protein_per_100g=101,
            carbs_per_100g=101,
            fat_per_100g=101,
        )


def test_nutrition_barcode_rejects_oversized_path_before_lookup():
    async def fake_user():
        return "user-1"

    async def fake_db():
        yield object()

    app.dependency_overrides[get_current_user_id] = fake_user
    app.dependency_overrides[get_db] = fake_db
    client = TestClient(app)
    try:
        response = client.get("/api/v1/nutrition/barcode/" + "1" * 200)
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user_id, None)
        app.dependency_overrides.pop(get_db, None)


def test_avatar_media_requires_valid_signature(monkeypatch, tmp_path):
    asset_id = "a" * 32
    asset = tmp_path / f"{asset_id}.png"
    asset.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(avatar_endpoint, "AVATARS_DIR", tmp_path)

    client = TestClient(app)
    missing_sig = client.get(f"/api/v1/me/avatar/{asset_id}")
    assert missing_sig.status_code == 403

    signed_url = avatar_endpoint._signed_avatar_url(asset_id, "test")
    signed = client.get(signed_url)
    assert signed.status_code == 200
    assert signed.headers.get("content-type", "").startswith("image/png")


@pytest.mark.asyncio
async def test_badge_search_ledger_uses_fingerprint_without_plain_query(monkeypatch):
    captured = {}

    class FakeOrchestrator:
        def __init__(self, db):
            self.db = db

        async def on_user_action(self, user_id, ctx):
            captured["ctx"] = ctx

    monkeypatch.setattr(badge_integration, "BadgeOrchestrator", FakeOrchestrator)

    await badge_integration.fire_food_search(object(), "user-1", "sensitive food query")

    ctx = captured["ctx"]
    assert ctx.fingerprint
    assert ctx.meta == {"query_len": len("sensitive food query")}


@pytest.mark.asyncio
async def test_account_rate_limit_uses_independent_committed_session(monkeypatch):
    calls = {}

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def commit(self):
            calls["committed"] = True

        async def rollback(self):
            calls["rolled_back"] = True

    fake_session = FakeSession()

    async def fake_inner(db, key, *, limit, window_seconds):
        calls["db"] = db
        calls["key"] = key
        calls["limit"] = limit
        calls["window_seconds"] = window_seconds

    monkeypatch.setattr(account_rate_limit, "get_async_session_maker", lambda: lambda: fake_session)
    monkeypatch.setattr(account_rate_limit, "_check_account_rate_limit_in_session", fake_inner)

    original_db = object()
    await account_rate_limit.check_account_rate_limit(original_db, "login:user@example.com", limit=2, window_seconds=60)

    assert calls["db"] is fake_session
    assert calls["db"] is not original_db
    assert calls["committed"] is True
    assert calls["key"] == "login:user@example.com"


def test_profile_update_ignores_avatar_url():
    data = ProfileUpdate.model_validate({"avatar_url": "https://evil.example/avatar.png"})
    assert "avatar_url" not in data.model_dump(exclude_unset=True)


def test_profile_preference_payloads_are_bounded():
    with pytest.raises(ValidationError):
        OnboardingRequest(
            sex="male",
            birth_year=1995,
            height_cm=180,
            current_weight_kg=80,
            goal_type="maintain",
            activity_level="moderate",
            training_days_per_week=3,
            dietary_preferences=["x"] * 21,
        )
    with pytest.raises(ValidationError):
        FoodRestrictionsUpdate(disliked_foods=["x" * 81])
    with pytest.raises(ValidationError):
        FoodRestrictionsUpdate(dietary_preferences=["x"] * 21)
    with pytest.raises(ValidationError):
        PlanPreferencesUpdate(sport_profile={f"k{i}": "v" for i in range(31)})


def test_progress_notes_are_bounded():
    with pytest.raises(ValidationError):
        WeightLogCreate(weight_kg=80, date="2026-04-28", notes="x" * 1001)
    with pytest.raises(ValidationError):
        ActivityLogCreate(date="2026-04-28", training_type="x" * 81)
    with pytest.raises(ValidationError):
        ActivityLogCreate(date="2026-04-28", notes="x" * 1001)


def test_asyncpg_connect_args_respect_sslmode_require():
    args = _build_connect_args("postgresql+asyncpg://u:p@db.example.com/app?sslmode=require")
    assert "ssl" in args


@pytest.mark.asyncio
async def test_unhandled_exception_log_omits_query_string(caplog):
    request = SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path="/api/v1/auth/password/reset"),
        headers={},
    )
    with caplog.at_level(logging.ERROR, logger="uvicorn.error"):
        await _unhandled_exception_handler(request, RuntimeError("boom?token=should-not-log"))

    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "should-not-log" not in logged
    assert "/api/v1/auth/password/reset" in logged
