"""Las imágenes de insignias deben cargarse sin JWT (Image/img no envían Authorization)."""

from pathlib import Path

from fastapi.testclient import TestClient

from app.api.v1.endpoints import badges as badges_endpoint
from app.main import app


def test_badge_media_no_auth_returns_file_or_404_not_401():
    c = TestClient(app)
    r = c.get("/api/v1/me/badges/media/onboarding-complete")
    assert r.status_code != 401
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert r.headers.get("content-type", "").startswith("image/")


def test_badge_media_rejects_invalid_asset_id():
    c = TestClient(app)
    r = c.get("/api/v1/me/badges/media/foo@bar")
    assert r.status_code == 400


def test_badge_media_uses_immutable_cache_headers(monkeypatch):
    test_dir = Path(__file__).resolve().parents[2] / "tmp" / "badge-media-test-assets"
    test_dir.mkdir(parents=True, exist_ok=True)
    asset = test_dir / "cache-test-immutable.png"
    asset.write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(badges_endpoint, "BADGES_DIR", test_dir)
    monkeypatch.setattr(badges_endpoint, "BADGES_ASSETS_FALLBACK", test_dir)

    try:
        c = TestClient(app)
        r = c.get("/api/v1/me/badges/media/cache-test-immutable")

        assert r.status_code == 200
        assert r.headers.get("cache-control") == "public, max-age=31536000, immutable"
    finally:
        asset.unlink(missing_ok=True)
