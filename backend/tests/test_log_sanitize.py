"""Enmascarado de cuerpos en logs."""
import json

from app.core.log_sanitize import mask_json_bytes_for_log


def test_mask_json_masks_password():
    raw = json.dumps({"email": "a@b.c", "password": "secret123"}).encode()
    out = mask_json_bytes_for_log(raw)
    assert "secret123" not in out
    assert "***" in out or "password" in out


def test_mask_json_truncates_long_body():
    raw = json.dumps({"x": "y" * 5000}).encode()
    out = mask_json_bytes_for_log(raw, max_len=100)
    assert len(out) <= 101
    assert out.endswith("…")
