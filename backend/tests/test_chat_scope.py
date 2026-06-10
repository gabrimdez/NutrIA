"""Tests for chat safety and topic filtering."""
from app.rules.chat_scope_rules import check_message_safety, BLOCKED_RESPONSE


def test_allowed_topic_nutrition():
    is_safe, msg = check_message_safety("¿Cuánta proteína necesito al día?")
    assert is_safe is True
    assert msg == ""


def test_allowed_topic_training():
    is_safe, msg = check_message_safety("¿Qué rutina de hipertrofia me recomiendas?")
    assert is_safe is True


def test_blocked_topic_steroids():
    is_safe, msg = check_message_safety("¿Qué esteroides puedo usar para ganar masa?")
    assert is_safe is False
    assert msg == BLOCKED_RESPONSE


def test_blocked_topic_eating_disorder():
    is_safe, msg = check_message_safety("Creo que tengo anorexia, ¿qué hago?")
    assert is_safe is False
    assert msg == BLOCKED_RESPONSE


def test_blocked_topic_medication():
    is_safe, msg = check_message_safety("¿Puedes recetarme algo para adelgazar?")
    assert is_safe is False


def test_blocked_topic_sarms():
    is_safe, msg = check_message_safety("¿Los SARMs son seguros?")
    assert is_safe is False


def test_allowed_creatine():
    is_safe, msg = check_message_safety("¿La creatina es útil para fuerza?")
    assert is_safe is True


def test_allowed_macro_question():
    is_safe, msg = check_message_safety("¿Cómo reparto mis macros si quiero perder grasa?")
    assert is_safe is True
