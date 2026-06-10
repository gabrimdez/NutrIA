"""Tests para la resolución de plantillas de entrenamiento."""

import pytest

from app.ai.training_suggestions import (
    TRAINING_TEMPLATES,
    get_training_suggestion,
)
from app.schemas.injury_profile import InjuryProfile


class TestTemplateStructure:
    """Valida que todas las plantillas tengan la estructura correcta."""

    @pytest.mark.parametrize("days", [2, 3, 4, 5, 6])
    def test_template_exists(self, days: int):
        assert days in TRAINING_TEMPLATES

    @pytest.mark.parametrize("days", [2, 4])
    def test_single_template_has_days(self, days: int):
        t = TRAINING_TEMPLATES[days]
        assert "days" in t
        assert len(t["days"]) == days

    @pytest.mark.parametrize("days", [3, 5, 6])
    def test_multi_template_has_options(self, days: int):
        t = TRAINING_TEMPLATES[days]
        assert "options" in t
        assert len(t["options"]) >= 2
        for opt in t["options"]:
            assert "name" in opt
            assert "split" in opt
            assert "days" in opt
            assert len(opt["days"]) == days


class TestResolveSingleSplit:
    """Días sin opciones (2, 4): devuelven rutina directamente."""

    @pytest.mark.parametrize("days", [2, 4])
    def test_returns_routine(self, days: int):
        result = get_training_suggestion(days, focus="hipertrofia")
        assert "days" in result
        assert "error" not in result
        assert result["split"] == TRAINING_TEMPLATES[days]["split"]

    def test_focus_fuerza_note(self):
        result = get_training_suggestion(4, focus="fuerza")
        assert "multiarticulares" in result["focus_note"]

    def test_focus_hipertrofia_note(self):
        result = get_training_suggestion(4, focus="hipertrofia")
        assert "estabilidad" in result["focus_note"]

    def test_disclaimer_present(self):
        result = get_training_suggestion(2, focus="hipertrofia")
        assert "disclaimer" in result
        assert len(result["disclaimer"]) > 20


class TestResolveMultiSplit:
    """Días con opciones (3, 5, 6): requieren split_key."""

    @pytest.mark.parametrize("days", [3, 5, 6])
    def test_without_split_key_returns_error_and_options(self, days: int):
        result = get_training_suggestion(days, focus="hipertrofia")
        assert "error" in result
        assert "available_splits" in result
        assert len(result["available_splits"]) >= 2

    @pytest.mark.parametrize("days", [3, 5, 6])
    def test_with_valid_split_key(self, days: int):
        first_split = TRAINING_TEMPLATES[days]["options"][0]["split"]
        result = get_training_suggestion(days, focus="fuerza", split_key=first_split)
        assert "error" not in result
        assert "days" in result
        assert result["split"] == first_split

    @pytest.mark.parametrize("days", [3, 5, 6])
    def test_with_invalid_split_key(self, days: int):
        result = get_training_suggestion(days, focus="hipertrofia", split_key="nonexistent_split")
        assert "error" in result
        assert "available_splits" in result

    def test_3_days_full_body(self):
        result = get_training_suggestion(3, focus="hipertrofia", split_key="full_body")
        assert result["name"] == "Full Body 3 días"
        assert len(result["days"]) == 3

    def test_3_days_ppl(self):
        result = get_training_suggestion(3, focus="fuerza", split_key="push_pull_leg")
        assert result["name"] == "Push, Pull, Leg (3 días)"
        assert len(result["days"]) == 3

    def test_3_days_torso_pierna_brazo(self):
        result = get_training_suggestion(3, focus="hipertrofia", split_key="torso_pierna_brazo")
        assert result["name"] == "Torso, Pierna, Brazo (3 días)"
        assert len(result["days"]) == 3
        day_names = [d["name"] for d in result["days"]]
        assert "Día 1 - Torso" in day_names
        assert "Día 2 - Pierna" in day_names
        assert "Día 3 - Brazo" in day_names

    def test_3_days_has_three_options(self):
        result = get_training_suggestion(3, focus="hipertrofia")
        assert len(result["available_splits"]) == 3


class TestEdgeCases:
    """Clamp de días y valores por defecto."""

    def test_below_min_clamped_to_2(self):
        result = get_training_suggestion(0, focus="hipertrofia")
        assert "days" in result
        assert len(result["days"]) == 2

    def test_above_max_clamped_to_6(self):
        result = get_training_suggestion(10, focus="hipertrofia")
        assert "error" in result  # 6 tiene opciones → pide split_key

    def test_default_focus(self):
        result = get_training_suggestion(2)
        assert "estabilidad" in result["focus_note"]

    def test_empty_focus_defaults_hipertrofia(self):
        result = get_training_suggestion(4, focus="")
        assert "estabilidad" in result["focus_note"]


class TestInjuryAdaptation:
    """Rutina filtrada en servidor según InjuryProfile."""

    def test_shoulder_acute_avoids_overhead_press_line(self):
        profiles = [
            InjuryProfile(
                bodyZone="shoulder",
                phase="acute",
                goal="prioritize_recovery",
                excludeTags=[
                    "overhead_press",
                    "shoulder_end_range_abduction",
                ],
            )
        ]
        r = get_training_suggestion(2, focus="hipertrofia", injury_profiles=profiles)
        assert "error" not in r
        flat = "\n".join(
            e for d in r["days"] for e in d.get("exercises", [])
        )
        assert "Press militar" not in flat
        assert "adaptation_trace" in r
        assert r["adaptation_trace"][0].get("chosen_exercise_id")

    def test_rehab_only_returns_conservative_block(self):
        profiles = [
            InjuryProfile(
                bodyZone="shoulder",
                phase="rehab_only",
                goal="prioritize_recovery",
                excludeTags=[],
            )
        ]
        r = get_training_suggestion(
            3,
            focus="hipertrofia",
            split_key="full_body",
            injury_profiles=profiles,
        )
        assert r.get("mode") == "conservative_rehab"
        assert r["days"][0]["name"] == "Readaptación conservadora"

    def test_red_flags_safety_stop(self):
        profiles = [
            InjuryProfile(
                bodyZone="knee",
                phase="trainable_low_pain",
                goal="maintain_fitness",
                excludeTags=[],
                redFlagsReported=True,
            )
        ]
        r = get_training_suggestion(2, focus="hipertrofia", injury_profiles=profiles)
        assert r.get("error") == "safety_stop"
        assert "safety_message" in r

    def test_determinism_same_input(self):
        profiles = [
            InjuryProfile(
                bodyZone="shoulder",
                phase="acute",
                goal="prioritize_recovery",
                excludeTags=["overhead_press", "shoulder_end_range_abduction"],
            )
        ]
        a = get_training_suggestion(2, focus="hipertrofia", injury_profiles=profiles)
        b = get_training_suggestion(2, focus="hipertrofia", injury_profiles=profiles)
        assert a["days"] == b["days"]
