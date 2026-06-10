"""Tests para el routing de peticiones de rutina en el chat.

Cubre:
- Detección multi-músculo (pecho/espalda/pierna en una sola frase).
- "pierna" se mapea a la zona entera (legs), no a cuádriceps.
- Plantilla `legs` de muscle_group_routines existe y es coherente.
"""

from app.ai.muscle_group_routines import get_muscle_group_routine
from app.services.chat_service import (
    _detect_all_muscle_group_keys,
    _detect_muscle_group_key,
    _infer_split_key,
)

# Lista canónica de splits disponibles para 3 días según TRAINING_TEMPLATES.
_SPLITS_3_DAYS = ["full_body", "push_pull_leg", "torso_pierna_brazo"]
_SPLITS_5_DAYS = [
    "push_pull_leg_rest_torso_pierna",
    "torso_pierna_rest_torso_pierna_brazo",
    "torso_brazo_pierna_rest_torso_brazo",
]


def test_detect_single_muscle_chest():
    assert _detect_muscle_group_key("rutina de pecho") == "chest"
    assert _detect_all_muscle_group_keys("rutina de pecho") == ["chest"]


def test_detect_pierna_maps_to_legs_not_quadriceps():
    assert _detect_muscle_group_key("rutina de pierna") == "legs"
    assert _detect_all_muscle_group_keys("rutina de pierna") == ["legs"]
    assert _detect_all_muscle_group_keys("entrenamiento de piernas") == ["legs"]


def test_detect_multi_muscle_split_request():
    keys = _detect_all_muscle_group_keys(
        "dame un entreno de 3 dias, uno de pecho otro de espalda otro de pierna"
    )
    assert "chest" in keys
    assert "back" in keys
    assert "legs" in keys
    assert len(keys) == 3


def test_detect_returns_unique_keys_in_order():
    keys = _detect_all_muscle_group_keys("pecho y más pecho con espalda")
    assert keys == ["chest", "back"]


def test_detect_no_muscle():
    assert _detect_muscle_group_key("hola, ¿qué tal?") is None
    assert _detect_all_muscle_group_keys("hola, ¿qué tal?") == []


def test_legs_template_exists_and_is_full_zone():
    """La plantilla legs debe cubrir cuádriceps + isquios + glúteo + gemelos."""
    result = get_muscle_group_routine("legs", focus="hipertrofia")
    assert "error" not in result
    assert result["muscle_group"] == "legs"
    assert result["label_es"] == "Pierna"
    assert result["structured_days"]
    assert len(result["structured_days"]) == 1

    exercises_text = " ".join(
        ex["name"].lower() for ex in result["structured_days"][0]["exercises"]
    )
    assert "sentadilla" in exercises_text or "hack" in exercises_text or "prensa" in exercises_text
    assert "rumano" in exercises_text or "isquio" in exercises_text or "femoral" in exercises_text
    assert "hip thrust" in exercises_text or "gluteo" in exercises_text or "glúteo" in exercises_text
    assert "gemelos" in exercises_text or "pantorrilla" in exercises_text


def test_legs_template_fuerza_variant():
    result = get_muscle_group_routine("legs", focus="fuerza")
    assert "error" not in result
    assert "fuerza" in result["name"].lower()
    assert result["structured_days"][0]["exercises"]


def test_legs_in_available_groups_when_unknown():
    """Si el usuario pide un grupo inexistente, legs debe aparecer en la lista de disponibles."""
    result = get_muscle_group_routine("inexistente")
    assert "error" in result
    assert any("legs" in g or "Pierna" in g for g in result["available_groups"])


# ---------------------------------------------------------------------------
# _infer_split_key — inferencia de split desde el prompt
# ---------------------------------------------------------------------------

def test_infer_split_pecho_espalda_pierna_3_dias():
    """Caso reportado: 3 días pidiendo pecho/espalda/pierna ⇒ Push-Pull-Legs."""
    msg = "dame una rutina de 3 dias, quiero que uno sea de pecho otro de espalda otro de pierna"
    keys = _detect_all_muscle_group_keys(msg)
    assert _infer_split_key(msg, 3, keys, _SPLITS_3_DAYS) == "push_pull_leg"


def test_infer_split_explicit_ppl_hint():
    msg = "rutina ppl 3 días"
    keys = _detect_all_muscle_group_keys(msg)
    assert _infer_split_key(msg, 3, keys, _SPLITS_3_DAYS) == "push_pull_leg"


def test_infer_split_explicit_push_pull_legs_hint():
    msg = "quiero un split push pull legs de 3 días"
    keys = _detect_all_muscle_group_keys(msg)
    assert _infer_split_key(msg, 3, keys, _SPLITS_3_DAYS) == "push_pull_leg"


def test_infer_split_explicit_full_body_hint():
    msg = "rutina full body 3 días"
    keys = _detect_all_muscle_group_keys(msg)
    assert _infer_split_key(msg, 3, keys, _SPLITS_3_DAYS) == "full_body"


def test_infer_split_explicit_torso_pierna_brazo_hint():
    msg = "torso pierna brazo en 3 días"
    keys = _detect_all_muscle_group_keys(msg)
    assert _infer_split_key(msg, 3, keys, _SPLITS_3_DAYS) == "torso_pierna_brazo"


def test_infer_split_returns_none_without_hints():
    """Sin pistas, el caller decide (típicamente el primer split disponible)."""
    msg = "dame una rutina de 3 días"
    keys = _detect_all_muscle_group_keys(msg)
    assert _infer_split_key(msg, 3, keys, _SPLITS_3_DAYS) is None


def test_infer_split_pierna_brazo_torso_5_dias():
    """5 días con pecho/espalda + pierna + brazos ⇒ torso-brazo-pierna disponible."""
    msg = "rutina de 5 dias con pecho espalda pierna biceps y triceps"
    keys = _detect_all_muscle_group_keys(msg)
    chosen = _infer_split_key(msg, 5, keys, _SPLITS_5_DAYS)
    assert chosen is not None
    assert chosen.startswith("torso_brazo_pierna") or chosen.startswith("torso_pierna_brazo") or chosen.startswith("push_pull_leg")


def test_infer_split_empty_available_returns_none():
    assert _infer_split_key("rutina ppl", 3, ["chest"], []) is None


def test_infer_split_hint_not_in_available_falls_back_to_none():
    """Si el usuario pide PPL pero esa clave no está disponible, devuelve None (caller decide)."""
    # Hipotético: solo full_body disponible.
    msg = "rutina ppl"
    assert _infer_split_key(msg, 3, ["chest", "back", "legs"], ["full_body"]) is None
