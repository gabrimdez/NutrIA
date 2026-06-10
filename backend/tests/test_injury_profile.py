import pytest
from pydantic import ValidationError

from app.rules.injury_defaults import default_exclude_tags_for_zone_phase
from app.schemas.injury_profile import InjuryProfile, injury_profile_from_dict


def test_injury_profile_accepts_other_zone_with_custom_fields():
    injury = InjuryProfile(
        bodyZone="other",
        customBodyZoneLabel="Ingle / pubis",
        diagnosisLabel="Pubalgia",
        customAvoidMovements=["sprints", "abrir mucho la cadera"],
    )

    assert injury.body_zone == "other"
    assert injury.custom_body_zone_label == "Ingle / pubis"
    assert injury.custom_avoid_movements == ["sprints", "abrir mucho la cadera"]
    dumped = injury.model_dump(by_alias=True, mode="json")
    assert dumped["customBodyZoneLabel"] == "Ingle / pubis"
    assert dumped["customAvoidMovements"] == ["sprints", "abrir mucho la cadera"]


def test_other_zone_requires_custom_body_zone_label():
    with pytest.raises(ValidationError):
        InjuryProfile(bodyZone="other", diagnosisLabel="Molestia rara")


def test_other_zone_defaults_have_no_deterministic_excludes():
    assert default_exclude_tags_for_zone_phase("other", "acute") == []
    assert default_exclude_tags_for_zone_phase("other", "trainable_low_pain") == []


def test_legacy_unknown_zone_becomes_other_with_custom_label():
    injury = injury_profile_from_dict(
        {"zone": "Pubalgia", "severity": "leve", "notes": "Molesta en sprints"}
    )

    assert injury is not None
    assert injury.body_zone == "other"
    assert injury.custom_body_zone_label == "Pubalgia"
    assert injury.diagnosis_label == "Pubalgia"
    assert injury.notes == "Molesta en sprints"


def test_legacy_known_zone_still_maps_to_structured_zone():
    injury = injury_profile_from_dict({"zone": "Hombro derecho", "severity": "leve"})

    assert injury is not None
    assert injury.body_zone == "shoulder"
    assert injury.custom_body_zone_label is None
