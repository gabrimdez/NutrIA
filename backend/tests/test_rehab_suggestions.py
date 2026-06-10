"""Tests del bloque determinista de readaptación (chat tool)."""

from __future__ import annotations

from app.ai.rehab_suggestions import SUPPORTED_REHAB_ZONES, build_rehab_suggestion
from app.schemas.injury_profile import InjuryProfile


def test_build_rehab_saved_injury_allows_red_flags_none():
    saved = InjuryProfile(
        bodyZone="knee",
        phase="trainable_low_pain",
        painAtRest=1,
        painWithMovement=4,
        redFlagsReported=False,
    )
    out = build_rehab_suggestion(
        body_zone="knee",
        onset_type="gradual_overuse",
        pain_at_rest=None,
        pain_with_movement=None,
        red_flags=None,
        saved_injury=saved,
    )
    assert "error" not in out
    assert out.get("structured_days")
    assert out.get("catalog_version") == "rehab_v1"


def test_build_rehab_unsupported_zone():
    out = build_rehab_suggestion(
        body_zone="hip",
        onset_type="gradual_overuse",
        pain_at_rest=1,
        pain_with_movement=3,
        red_flags=[],
    )
    assert out.get("error") == "unsupported_zone"
    assert "supported_zones_hint_es" in out


def test_build_rehab_missing_without_saved():
    out = build_rehab_suggestion(
        body_zone="knee",
        onset_type=None,
        pain_at_rest=2,
        pain_with_movement=3,
        red_flags=[],
        saved_injury=None,
    )
    assert out.get("error") == "missing_inputs"
    assert "onset_type" in (out.get("missing_fields") or [])


def test_supported_zones_include_knee():
    assert "knee" in SUPPORTED_REHAB_ZONES
