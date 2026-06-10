from app.main import _is_allowed_cors_origin


def test_allowed_cors_origin_accepts_localhost():
    assert _is_allowed_cors_origin("http://localhost:8080")


def test_allowed_cors_origin_rejects_untrusted_origin():
    assert not _is_allowed_cors_origin("https://evil.example.com")
