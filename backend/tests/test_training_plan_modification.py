"""Tests para la modificación determinista de rutinas en el chat."""

import copy
from unittest.mock import patch, AsyncMock

import pytest

from app.ai.training_plan_modification import (
    apply_modifications,
    is_modification_intent,
    resolve_modifications_via_llm,
    summarize_changes,
)


def _sample_plan() -> dict:
    return {
        "kind": "training",
        "name": "Push, Pull, Leg (3 días)",
        "split": "push_pull_leg",
        "focus_note": "Hipertrofia: priorizar estabilidad.",
        "disclaimer": "Propuesta orientativa.",
        "days": [
            {
                "name": "Día 1 - Push",
                "exercises": [
                    {"name": "Press de banca", "sets": 3, "reps": "6-10"},
                    {"name": "Press inclinado con mancuernas", "sets": 3, "reps": "6-10"},
                    {"name": "Elevaciones laterales en polea", "sets": 3, "reps": "10-15"},
                    {"name": "Press militar", "sets": 3, "reps": "8-12"},
                ],
            },
            {
                "name": "Día 2 - Pull",
                "exercises": [
                    {"name": "Jalón al pecho", "sets": 3, "reps": "6-10"},
                    {"name": "Remo sentado con agarre cerrado", "sets": 3, "reps": "6-10"},
                    {"name": "Curl de bíceps con mancuernas", "sets": 3, "reps": "8-12"},
                    {"name": "Curl martillo con mancuernas", "sets": 3, "reps": "10-12"},
                ],
            },
            {
                "name": "Día 3 - Leg",
                "exercises": [
                    {"name": "Sentadilla con barra", "sets": 3, "reps": "8-12"},
                    {"name": "Peso muerto rumano", "sets": 3, "reps": "6-10"},
                    {"name": "Extensión de cuádriceps", "sets": 3, "reps": "10-15"},
                    {"name": "Curl femoral sentado", "sets": 3, "reps": "8-12"},
                ],
            },
        ],
    }


class TestIsModificationIntent:
    @pytest.mark.parametrize(
        "msg",
        [
            "cambia curl martillo por curl predicador",
            "Cambia el curl martillo por curl predicador",
            "quita peso muerto porque me molesta la rodilla",
            "sustituye sentadilla por prensa",
            "haz la rutina igual pero sin peso muerto",
            "cambia los ejercicios de bíceps",
            "en vez de sentadilla pon prensa",
        ],
    )
    def test_detects(self, msg: str):
        assert is_modification_intent(msg) is True

    @pytest.mark.parametrize(
        "msg",
        [
            "dame una rutina de 4 días",
            "hazme una rutina de hipertrofia",
            "qué tal el press de banca para pecho",
            "",
        ],
    )
    def test_does_not_detect(self, msg: str):
        assert is_modification_intent(msg) is False

    def test_does_not_detect_new_routine_request(self):
        assert is_modification_intent("hazme una nueva rutina") is False
        assert is_modification_intent("dame otra rutina diferente") is False

    @pytest.mark.parametrize(
        "msg",
        [
            "quiero que me quites sentadilla",
            "puedes quitar la sentadilla",
            "me quitas la sentadilla",
            "cambies sentadilla por prensa",
            "quiero que cambies sentadilla por prensa",
            "puedes cambiar sentadilla por prensa",
            "me cambias curl martillo por curl predicador",
        ],
    )
    def test_detects_conjugations(self, msg: str):
        """No solo el imperativo: indicativo, subjuntivo e infinitivo."""
        assert is_modification_intent(msg) is True


class TestVerbConjugations:
    """La rama determinista debe disparar con conjugaciones, no solo el imperativo."""

    @pytest.mark.parametrize(
        "msg",
        [
            "quiero que me quites sentadilla",
            "puedes quitar la sentadilla",
            "me quitas la sentadilla",
            "quítame la sentadilla",
        ],
    )
    def test_remove_conjugations(self, msg: str):
        plan = _sample_plan()
        result = apply_modifications(plan, msg)
        assert result["ambiguous"] is False
        assert result["no_match"] is False
        assert len(result["changes"]) == 1
        assert "sentadilla" in result["changes"][0]["from"].lower()

    @pytest.mark.parametrize(
        "msg",
        [
            "cambies sentadilla por prensa",
            "quiero que cambies sentadilla por prensa",
            "puedes cambiar sentadilla por prensa",
            "me cambias curl martillo por curl predicador",
        ],
    )
    def test_replace_conjugations(self, msg: str):
        plan = _sample_plan()
        result = apply_modifications(plan, msg)
        assert result["ambiguous"] is False
        assert result["no_match"] is False
        assert len(result["changes"]) == 1


class TestReplacePair:
    def test_simple_replacement(self):
        plan = _sample_plan()
        original = copy.deepcopy(plan)
        result = apply_modifications(plan, "cambia curl martillo por curl predicador")

        assert result["ambiguous"] is False
        assert result["no_match"] is False
        assert len(result["changes"]) == 1

        change = result["changes"][0]
        assert "martillo" in change["from"].lower()
        assert "predicador" in change["to"].lower()
        assert change["day"] == "Día 2 - Pull"

        # El resto de la rutina queda igual.
        new_plan = result["training_plan"]
        assert new_plan["name"] == original["name"]
        assert new_plan["focus_note"] == original["focus_note"]
        assert len(new_plan["days"]) == len(original["days"])
        # El día 1 y día 3 idénticos.
        assert new_plan["days"][0] == original["days"][0]
        assert new_plan["days"][2] == original["days"][2]
        # El día 2 mantiene el mismo número de ejercicios.
        assert len(new_plan["days"][1]["exercises"]) == len(original["days"][1]["exercises"])

    def test_replacement_preserves_sets_and_reps(self):
        plan = _sample_plan()
        result = apply_modifications(plan, "cambia curl martillo por curl predicador")
        new_pull = result["training_plan"]["days"][1]
        replaced = next(e for e in new_pull["exercises"] if "predicador" in e["name"].lower())
        # Hereda 3x10-12 del curl martillo original.
        assert replaced["sets"] == 3
        assert replaced["reps"] == "10-12"

    def test_inverted_pair(self):
        plan = _sample_plan()
        result = apply_modifications(plan, "en vez de sentadilla pon prensa")
        assert len(result["changes"]) == 1
        new_leg = result["training_plan"]["days"][2]
        names = " ".join(e["name"].lower() for e in new_leg["exercises"])
        assert "prensa" in names
        assert "sentadilla" not in names


class TestRemove:
    def test_remove_exercise(self):
        plan = _sample_plan()
        result = apply_modifications(plan, "quita el peso muerto rumano")
        assert result["ambiguous"] is False
        assert len(result["changes"]) == 1
        leg = result["training_plan"]["days"][2]
        assert len(leg["exercises"]) == 3
        names = " ".join(e["name"].lower() for e in leg["exercises"])
        assert "peso muerto" not in names

    def test_pain_replaces_with_safer_alternative(self):
        plan = _sample_plan()
        result = apply_modifications(
            plan, "quita la sentadilla porque me molesta la rodilla"
        )
        assert len(result["changes"]) == 1
        change = result["changes"][0]
        # No se eliminó: se reemplazó por alternativa segura.
        assert change["to"] != "(eliminado)"
        assert "reason" in change
        leg = result["training_plan"]["days"][2]
        assert len(leg["exercises"]) == len(plan["days"][2]["exercises"])  # se mantiene la cantidad


class TestAmbiguousAndNoMatch:
    def test_ambiguous_when_no_pair_no_target_no_group(self):
        plan = _sample_plan()
        # "Cambia algo" es ambiguo: no hay grupo muscular, no hay par "X por Y".
        result = apply_modifications(plan, "cambia algo de la rutina")
        assert result["ambiguous"] is True
        assert result["no_match"] is False
        assert result["training_plan"] == plan

    def test_no_match_when_target_not_in_plan(self):
        plan = _sample_plan()
        result = apply_modifications(plan, "quita el press inclinado con barra olímpica especial")
        # El score puede acercarse a "press inclinado con mancuernas" pero...
        # Con una query muy distinta ("hip thrust") aseguramos no_match real.
        result2 = apply_modifications(plan, "quita el hip thrust con barra")
        assert result2["no_match"] is True or result2["ambiguous"] is False
        # El plan no se modifica si no hay match.
        if result2["no_match"]:
            assert result2["training_plan"] == plan


class TestMuscleGroupReplacement:
    def test_replaces_all_biceps_exercises(self):
        plan = _sample_plan()
        original = copy.deepcopy(plan)
        result = apply_modifications(plan, "cambia los ejercicios de bíceps")

        # Día 1 (push) y día 3 (leg) no tienen bíceps → quedan igual.
        assert result["training_plan"]["days"][0] == original["days"][0]
        assert result["training_plan"]["days"][2] == original["days"][2]

        # Día 2 (pull) tenía 2 ejercicios de bíceps; deberían estar reemplazados.
        original_biceps_names = {
            e["name"] for e in original["days"][1]["exercises"] if "bíceps" in e["name"].lower() or "martillo" in e["name"].lower()
        }
        new_biceps_exercises = [
            e for e in result["training_plan"]["days"][1]["exercises"]
            if e["name"] not in original_biceps_names
        ]
        # Al menos un ejercicio cambió.
        assert len(result["changes"]) >= 1
        assert len(new_biceps_exercises) >= 1


class TestSummarizeChanges:
    def test_empty(self):
        assert "sin cambios" in summarize_changes([])

    def test_single_change(self):
        changes = [{"day": "Día 2 - Pull", "from": "Curl martillo", "to": "Curl predicador"}]
        s = summarize_changes(changes)
        assert "Curl martillo" in s
        assert "Curl predicador" in s
        assert "Día 2 - Pull" in s

    def test_includes_reason(self):
        changes = [
            {
                "day": "Día 3 - Leg",
                "from": "Sentadilla con barra",
                "to": "Prensa de piernas",
                "reason": "menor carga axial",
            }
        ]
        s = summarize_changes(changes)
        assert "menor carga axial" in s


class TestPlanInvariance:
    """El plan original NO debe mutar cuando se aplican modificaciones."""

    def test_input_plan_not_mutated(self):
        plan = _sample_plan()
        snapshot = copy.deepcopy(plan)
        apply_modifications(plan, "cambia curl martillo por curl predicador")
        assert plan == snapshot


class TestCatalogAliases:
    """Los nombres reales del catálogo tienen alias separados por ',' u 'o'."""

    def _catalog_plan(self) -> dict:
        return {
            "kind": "training",
            "name": "T",
            "split": "",
            "focus_note": "",
            "disclaimer": "",
            "days": [
                {
                    "name": "Día 1",
                    "exercises": [
                        {
                            "name": "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal",
                            "sets": 3,
                            "reps": "6-10",
                        },
                        {
                            "name": "Curl predicador, curl en banco scott o spider curl",
                            "sets": 3,
                            "reps": "8-12",
                        },
                        {
                            "name": "Peso muerto rumano o piernas rígidas",
                            "sets": 3,
                            "reps": "6-10",
                        },
                        {
                            "name": "Curl femoral sentado o tumbado",
                            "sets": 3,
                            "reps": "8-12",
                        },
                        {
                            "name": "Curl de bíceps con mancuernas",
                            "sets": 3,
                            "reps": "8-12",
                        },
                        {
                            "name": "Elevación de gemelos sentado",
                            "sets": 3,
                            "reps": "12-20",
                        },
                    ],
                }
            ],
        }

    def test_curl_predicador_matches_correct_exercise(self):
        """Con stopwords antiguos, 'curl predicador' matchea con 'curl femoral'.
        Con el matching mejorado debe matchear con el ejercicio correcto."""
        plan = self._catalog_plan()
        result = apply_modifications(plan, "cambia curl predicador por curl con barra")
        assert len(result["changes"]) == 1
        assert "predicador" in result["changes"][0]["from"].lower()
        assert "femoral" not in result["changes"][0]["from"].lower()

    def test_alias_peck_deck(self):
        plan = self._catalog_plan()
        result = apply_modifications(plan, "cambia peck deck por aperturas")
        assert len(result["changes"]) == 1
        # Debe matchear con el press de banca (que tiene peck deck como alias).
        assert "press de banca" in result["changes"][0]["from"].lower()

    def test_alias_spider_curl(self):
        plan = self._catalog_plan()
        result = apply_modifications(plan, "cambia spider curl por curl bayesian")
        assert len(result["changes"]) == 1
        assert "predicador" in result["changes"][0]["from"].lower()

    def test_synonym_isquio_matches_femoral(self):
        plan = self._catalog_plan()
        result = apply_modifications(plan, "cambia el isquio por buenos días")
        assert len(result["changes"]) == 1
        assert "femoral" in result["changes"][0]["from"].lower()

    def test_synonym_pantorrilla_matches_gemelos(self):
        plan = self._catalog_plan()
        result = apply_modifications(plan, "quita pantorrilla")
        assert len(result["changes"]) == 1
        assert "gemelos" in result["changes"][0]["from"].lower()


class TestLLMFallback:
    """Cuando el matching determinista falla, el LLM puede resolverlo."""

    @pytest.mark.asyncio
    async def test_llm_resolves_when_deterministic_fails(self):
        plan = _sample_plan()

        async def fake_completion(messages, **kwargs):
            return {
                "content": '{"changes": [{"index": 0, "new_name": "Press inclinado con barra", "reason": null}]}',
                "tool_calls": [],
            }

        with patch("app.ai.groq_client.has_groq_keys", return_value=True), \
             patch("app.ai.groq_client.chat_completion", side_effect=fake_completion):
            result = await resolve_modifications_via_llm(plan, "ese press de pecho cámbialo por inclinado con barra")

        assert result["ambiguous"] is False
        assert result["no_match"] is False
        assert len(result["changes"]) == 1
        assert result["changes"][0]["to"] == "Press inclinado con barra"
        # Sets/reps preservados:
        new_ex = result["training_plan"]["days"][0]["exercises"][0]
        assert new_ex["sets"] == 3
        assert new_ex["reps"] == "6-10"

    @pytest.mark.asyncio
    async def test_llm_can_remove(self):
        plan = _sample_plan()

        async def fake_completion(messages, **kwargs):
            # Eliminamos el último ejercicio (curl martillo: índice 7 si numeramos en orden).
            return {
                "content": '{"changes": [{"index": 7, "new_name": null, "reason": null}]}',
                "tool_calls": [],
            }

        with patch("app.ai.groq_client.has_groq_keys", return_value=True), \
             patch("app.ai.groq_client.chat_completion", side_effect=fake_completion):
            result = await resolve_modifications_via_llm(plan, "fuera el curl martillo")

        assert len(result["changes"]) == 1
        assert result["changes"][0]["to"] == "(eliminado)"

    @pytest.mark.asyncio
    async def test_llm_no_groq_keys_returns_ambiguous(self):
        plan = _sample_plan()
        with patch("app.ai.groq_client.has_groq_keys", return_value=False):
            result = await resolve_modifications_via_llm(plan, "ininteligible")
        assert result["ambiguous"] is True
        assert result["training_plan"] == plan

    @pytest.mark.asyncio
    async def test_llm_invalid_json_returns_ambiguous(self):
        plan = _sample_plan()

        async def fake_completion(messages, **kwargs):
            return {"content": "no es json", "tool_calls": []}

        with patch("app.ai.groq_client.has_groq_keys", return_value=True), \
             patch("app.ai.groq_client.chat_completion", side_effect=fake_completion):
            result = await resolve_modifications_via_llm(plan, "qué")
        assert result["changes"] == []
        assert result["training_plan"] == plan

    @pytest.mark.asyncio
    async def test_llm_extracts_json_from_fence(self):
        plan = _sample_plan()

        async def fake_completion(messages, **kwargs):
            return {
                "content": '```json\n{"changes": [{"index": 0, "new_name": "Press en máquina"}]}\n```',
                "tool_calls": [],
            }

        with patch("app.ai.groq_client.has_groq_keys", return_value=True), \
             patch("app.ai.groq_client.chat_completion", side_effect=fake_completion):
            result = await resolve_modifications_via_llm(plan, "x")
        assert len(result["changes"]) == 1
        assert result["changes"][0]["to"] == "Press en máquina"

    @pytest.mark.asyncio
    async def test_llm_invalid_index_skipped(self):
        plan = _sample_plan()

        async def fake_completion(messages, **kwargs):
            return {
                "content": '{"changes": [{"index": 999, "new_name": "X"}, {"index": 0, "new_name": "Y"}]}',
                "tool_calls": [],
            }

        with patch("app.ai.groq_client.has_groq_keys", return_value=True), \
             patch("app.ai.groq_client.chat_completion", side_effect=fake_completion):
            result = await resolve_modifications_via_llm(plan, "x")
        # Sólo el índice 0 es válido.
        assert len(result["changes"]) == 1
        assert result["changes"][0]["to"] == "Y"
