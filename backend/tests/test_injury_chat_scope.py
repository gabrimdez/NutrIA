"""Tests for injury-aware chat scope rules."""

from app.rules.chat_scope_rules import check_message_safety, get_system_prompt, _format_injuries_block


class TestInjuryMessageSafety:
    """Verify minor sports injuries pass through while clinical injuries are blocked."""

    def test_minor_injury_allowed(self):
        is_safe, _ = check_message_safety("Tengo una molestia en el hombro, ¿cómo adapto la rutina?")
        assert is_safe

    def test_tendinitis_allowed(self):
        is_safe, _ = check_message_safety("Creo que tengo tendinitis en el codo")
        assert is_safe

    def test_contractura_allowed(self):
        is_safe, _ = check_message_safety("Me he hecho una contractura en el trapecio")
        assert is_safe

    def test_hernia_discal_blocked(self):
        is_safe, _ = check_message_safety("Tengo hernia discal L5-S1")
        assert not is_safe

    def test_rotura_ligamento_blocked(self):
        is_safe, _ = check_message_safety("Tengo rotura de ligamento cruzado")
        assert not is_safe

    def test_esteroides_still_blocked(self):
        is_safe, _ = check_message_safety("¿Qué esteroides me recomiendas?")
        assert not is_safe

    def test_generic_lesion_word_allowed(self):
        is_safe, _ = check_message_safety("Tengo una lesión leve en la rodilla")
        assert is_safe

    def test_sobrecarga_allowed(self):
        is_safe, _ = check_message_safety("Creo que tengo sobrecarga muscular en la espalda")
        assert is_safe


class TestFormatInjuriesBlock:
    def test_empty_injuries(self):
        assert _format_injuries_block([]) == ""

    def test_single_injury(self):
        injuries = [
            {
                "zone": "Hombro derecho",
                "severity": "leve",
                "notes": "Molesta al empujar por encima de la cabeza",
            }
        ]
        result = _format_injuries_block(injuries)
        assert "Hombro derecho" in result
        assert "leve" in result
        assert "Molesta al empujar por encima de la cabeza" in result
        assert "IMPORTANTE" in result

    def test_multiple_injuries(self):
        injuries = [
            {"zone": "Rodilla", "severity": "leve"},
            {"zone": "Lumbar", "severity": "moderada", "notes": "Evitar cargar demasiado mientras mejora"},
        ]
        result = _format_injuries_block(injuries)
        assert "Rodilla" in result
        assert "Lumbar" in result

    def test_structured_custom_injury_context(self):
        injuries = [
            {
                "bodyZone": "other",
                "customBodyZoneLabel": "Ingle / pubis",
                "diagnosisLabel": "Pubalgia",
                "customAvoidMovements": ["sprints", "abrir mucho la cadera"],
            }
        ]
        result = _format_injuries_block(injuries)
        assert "other (Ingle / pubis)" in result
        assert "Pubalgia" in result
        assert "sprints" in result
        assert "abrir mucho la cadera" in result


class TestSystemPromptWithInjuries:
    def test_prompt_includes_injuries(self):
        ctx = {
            "display_name": "Test",
            "active_injuries": [
                {
                    "zone": "Hombro",
                    "severity": "leve",
                    "notes": "Molestia al elevar el brazo",
                }
            ],
        }
        prompt = get_system_prompt(ctx)
        assert "Hombro" in prompt
        assert "leve" in prompt
        assert "Molestia al elevar el brazo" in prompt

    def test_prompt_without_injuries(self):
        ctx = {"display_name": "Test", "active_injuries": []}
        prompt = get_system_prompt(ctx)
        assert "LESIONES/LIMITACIONES ACTIVAS" not in prompt

    def test_prompt_includes_multisport_identity(self):
        ctx = {"display_name": "Test", "active_injuries": []}
        prompt = get_system_prompt(ctx)
        assert "NutriCoach" in prompt
        assert "running" in prompt.lower()

    def test_prompt_includes_sport_profile(self):
        ctx = {
            "display_name": "Test",
            "active_injuries": [],
            "sport_profile": {"deporte_principal": "running", "nivel": "intermedio"},
        }
        prompt = get_system_prompt(ctx)
        assert "running" in prompt
        assert "intermedio" in prompt

    def test_prompt_no_internal_function_names_by_default(self):
        ctx = {"display_name": "Test", "active_injuries": []}
        prompt = get_system_prompt(ctx)
        assert "create_training_suggestion" not in prompt
        assert "get_user_context" not in prompt
        assert "CONFIDENCIALIDAD" in prompt

    def test_prompt_includes_coach_quota_when_passed(self):
        ctx = {"display_name": "Test", "active_injuries": []}
        quota = {
            "chat_messages_limit": 40,
            "chat_messages_used": 5,
            "chat_messages_period": "month",
        }
        prompt = get_system_prompt(ctx, coach_quota=quota, is_premium=False)
        assert "5 de 40" in prompt
        assert "Aproximados restantes" in prompt
        assert "35" in prompt
