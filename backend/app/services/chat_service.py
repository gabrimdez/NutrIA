import json
import logging
import re
import hashlib
from typing import Optional
from uuid import UUID
from datetime import date, timedelta
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.safe_attr import safe_getattr
from app.repositories.chat_repo import ChatRepository
from app.repositories.coach_insight_repo import CoachInsightRepository
from app.repositories.profile_repo import ProfileRepository
from app.repositories.progress_repo import ProgressRepository
from app.food_providers.generic_provider import GenericFoodProvider
from app.ai.groq_client import chat_completion, has_groq_keys
from app.ai.chat_tools import CHAT_TOOLS
from app.ai.training_adaptation import profiles_from_raw
from app.ai.training_suggestions import get_training_suggestion
from app.ai.training_plan_modification import (
    apply_modifications,
    is_modification_intent,
    resolve_modifications_via_llm,
    summarize_changes,
)
from app.rules.chat_scope_rules import check_message_safety, get_system_prompt
from app.services.plan_shopping import string_list_from_json_field as _prefs_str_list
from app.rules.plateau_rules import analyze_plateau
from app.rules.evidence_language_rules import check_response_language, needs_disclaimer
from app.models.models import AiSafetyEvent
from app.core.config import get_settings
from app.services.subscription_quota_service import SubscriptionQuotaService
from app.services.badge_integration import fire_progress_summary_viewed

logger = logging.getLogger(__name__)

_VISION_COACH_HINT = (
    "El último mensaje del usuario incluye una imagen (comida u otra). "
    "Observa la imagen y responde como NutriCoach: alimentos visibles, porciones aproximadas si se deducen, "
    "orientación nutricional práctica y límites (no diagnosticar; si no se ve bien, dilo)."
)

_BULLET_OR_NUM_RE = re.compile(r"^\s*(?:[\-\*•+]|\d{1,2}[.\)])\s")
_MD_HEADING_RE = re.compile(r"^\s*#{1,4}\s")
_TABLE_PIPE_RE = re.compile(r"^\s*\|.*\|")
_SETS_REPS_RE = re.compile(
    r"\d+\s*(?:x|×)\s*\d+|series|reps|repeticiones",
    re.IGNORECASE,
)
_BOLD_ONLY_RE = re.compile(r"^\s*\*{2,}[^*]+\*{2,}\s*$")
_ROUTINE_EVIDENCE_RE = re.compile(
    r"\d+\s*(?:x|×)\s*\d+|\d+\s*series|\d+\s*repeticiones|\d+\s*reps",
    re.IGNORECASE,
)


def _looks_like_routine(text: str) -> bool:
    """Return True if the text contains exercise/routine patterns (sets x reps, etc.)."""
    return len(_ROUTINE_EVIDENCE_RE.findall(text)) >= 2


_REHAB_INTENT_RE = re.compile(r"readapt|rehabilit|\bfisio\b", re.I)
_SPLIT_KEYWORDS_RE = re.compile(
    r"\b(?:ppl|push[\s/-]*pull|pull[\s/-]*push|full\s*body|upper[\s/-]*lower|"
    r"torso[\s/-]*pierna|empuje[\s/-]*tir[oó]n|tir[oó]n[\s/-]*empuje|arnold|bro\s*split)\b",
    re.I,
)
_ASKS_GYM_ROUTINE_RE = re.compile(
    r"\b(?:quiero|necesito|dame|deme|genera|crea|hazme|haz|monta|arma|diseña|sugiere|"
    r"prepar(?:a|ame)|podrías|podrias|puedes|puede\s+ser)\s+(?:una\s+|el\s+)?(?:rutina|plan\s+de\s+(?:gym|gimnasio))\b"
    r"|\bdame\s+(?:una\s+)?(?:rutina|split)\b"
    r"|\brutina\s+(?:de|para)\s+"
    r"|\bplan\s+(?:de\s+)?(?:entrenamiento|gym|gimnasio)\b"
    r"|\b(?:ppl|push[\s/-]*pull|full\s*body|torso[\s/-]*pierna)\b",
    re.I,
)
_MUSCLE_GROUP_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(p, re.I), k)
    for p, k in [
        (r"gl[uú]teo", "glutes"),
        (r"\bpecho\b", "chest"),
        (r"espalda", "back"),
        (r"hombros?", "shoulders"),
        (r"\bpiernas?\b", "legs"),
        (r"cu[aá]driceps", "quadriceps"),
        (r"isquio", "hamstrings"),
        (r"b[ií]ceps", "biceps"),
        (r"tr[ií]ceps", "triceps"),
        (r"gemelos?", "calves"),
        (r"\bcore\b|abdom", "core"),
    ]
)


def _rehab_intent(message: str) -> bool:
    return bool(_REHAB_INTENT_RE.search(message or ""))


def _asks_gym_routine(message: str) -> bool:
    """True si el usuario pide rutina/plan de gym (excl. readaptación explícita)."""
    m = (message or "").strip()
    if not m or _rehab_intent(m):
        return False
    if re.search(r"\brutina\b", m, re.I) and re.search(
        r"\bno\s+(?:quiero|necesito|hagas?|generes?|me\s+dés|me\s+des)\b",
        m,
        re.I,
    ):
        return False
    if _ASKS_GYM_ROUTINE_RE.search(m):
        return True
    if re.search(r"\brutina\b", m, re.I) and (
        len(m) < 72
        or re.search(
            r"\b(?:quiero|dame|genera|crea|haz|ponme|pásame|pasame|enséñame|ensename|"
            r"muéstrame|muestrame|dame|busco|necesito)\b",
            m,
            re.I,
        )
    ):
        return True
    return False


def _detect_muscle_group_key(message: str) -> Optional[str]:
    for pat, key in _MUSCLE_GROUP_PATTERNS:
        if pat.search(message or ""):
            return key
    return None


def _detect_all_muscle_group_keys(message: str) -> list[str]:
    """Devuelve la lista (sin duplicados, en orden de aparición) de grupos detectados."""
    seen: list[str] = []
    text = message or ""
    for pat, key in _MUSCLE_GROUP_PATTERNS:
        if pat.search(text) and key not in seen:
            seen.append(key)
    return seen


# Pistas léxicas explícitas de tipo de split.
_SPLIT_HINT_PPL_RE = re.compile(
    r"\bppl\b|\bpush[\s/-]*pull[\s/-]*leg(?:s)?\b|\bempuje[\s/-]*tir[óo]n[\s/-]*pierna\b",
    re.I,
)
_SPLIT_HINT_TORSO_PIERNA_BRAZO_RE = re.compile(
    r"\btorso[\s,/-]*pierna[\s,/-]*brazo\b|\btorso[\s,/-]*brazo[\s,/-]*pierna\b",
    re.I,
)
_SPLIT_HINT_TORSO_PIERNA_RE = re.compile(
    r"\btorso[\s,/-]*pierna\b|\bupper[\s,/-]*lower\b|\bsuperior[\s,/-]*inferior\b",
    re.I,
)
_SPLIT_HINT_FULL_BODY_RE = re.compile(r"\bfull[\s-]*body\b|\bcuerpo[\s-]*entero\b", re.I)


def _infer_split_key(
    message: str,
    available_days: int,
    muscle_keys: list[str],
    available_splits: list[str],
) -> Optional[str]:
    """Infiere qué split de los disponibles encaja con la petición del usuario.

    available_splits: lista de identificadores ``split`` que devuelve la herramienta cuando
    hay varias opciones. La función elige uno basándose en (a) pistas léxicas explícitas
    (PPL, torso-pierna, full body…) y (b) la combinación de grupos musculares mencionados.
    Devuelve None si no hay señal clara — el caller puede entonces caer en el primero.
    """
    if not available_splits:
        return None
    text = message or ""

    def first_match(predicate) -> Optional[str]:
        for sk in available_splits:
            if predicate(sk):
                return sk
        return None

    # Pistas explícitas (más fuertes que la inferencia por músculos).
    if _SPLIT_HINT_PPL_RE.search(text):
        match = first_match(lambda sk: sk.startswith("push_pull_leg"))
        if match:
            return match
    if _SPLIT_HINT_TORSO_PIERNA_BRAZO_RE.search(text):
        match = first_match(
            lambda sk: sk.startswith("torso_pierna_brazo") or sk.startswith("torso_brazo_pierna")
        )
        if match:
            return match
    if _SPLIT_HINT_FULL_BODY_RE.search(text):
        match = first_match(lambda sk: "full_body" in sk)
        if match:
            return match
    if _SPLIT_HINT_TORSO_PIERNA_RE.search(text):
        match = first_match(
            lambda sk: sk.startswith("torso_pierna") or sk.startswith("upper_lower")
        )
        if match:
            return match

    # Inferencia por combinación de músculos mencionados.
    has_chest = "chest" in muscle_keys
    has_back = "back" in muscle_keys
    has_legs = "legs" in muscle_keys or "quadriceps" in muscle_keys or "hamstrings" in muscle_keys
    has_arms = "biceps" in muscle_keys or "triceps" in muscle_keys
    has_shoulders = "shoulders" in muscle_keys
    leg_or_torso_count = sum([has_chest, has_back, has_legs])

    # Pecho + espalda + pierna ⇒ Push-Pull-Legs (caso de la imagen del usuario).
    if has_chest and has_back and has_legs:
        match = first_match(lambda sk: sk.startswith("push_pull_leg"))
        if match:
            return match

    # Pierna + brazo + (torso/pecho/espalda/hombro) ⇒ Torso-Pierna-Brazo.
    if has_legs and has_arms and (has_chest or has_back or has_shoulders):
        match = first_match(
            lambda sk: sk.startswith("torso_pierna_brazo") or sk.startswith("torso_brazo_pierna")
        )
        if match:
            return match

    # Pecho/espalda + pierna (sin brazos diferenciados) ⇒ Torso-Pierna.
    if leg_or_torso_count >= 2 and has_legs and not has_arms:
        match = first_match(
            lambda sk: sk.startswith("torso_pierna") or sk.startswith("upper_lower")
        )
        if match:
            return match

    return None


def _strip_exercise_lines(text: str) -> str:
    """When a training_plan card exists, keep only plain prose paragraphs."""
    lines = text.split("\n")
    kept: list[str] = []
    for line in lines:
        if _BULLET_OR_NUM_RE.match(line):
            continue
        if _MD_HEADING_RE.match(line):
            continue
        if _TABLE_PIPE_RE.match(line):
            continue
        if _BOLD_ONLY_RE.match(line):
            continue
        if _SETS_REPS_RE.search(line):
            continue
        kept.append(line)
    result = "\n".join(kept).strip()
    while "\n\n\n" in result:
        result = result.replace("\n\n\n", "\n\n")
    return result or "Aquí tienes tu rutina."


# Fragmentos técnicos que a veces el modelo repite; el usuario no debe verlos.
_LEAK_TOKENS: tuple[str, ...] = (
    "create_training_suggestion",
    "create_rehab_suggestion",
    "get_user_context",
    "get_current_targets",
    "get_progress_summary",
    "search_foods",
    "swap_food",
    "build_shopping_list",
    "create_diet_plan",
    "explain_macro_distribution",
    "analyze_plateau",
    "get_muscle_group_routine",
    "science_rationale",
    "rationale_es",
    "muscle_group_routine",
    "coach_instructions_es",
    "supported_zones_hint_es",
    "use_saved_injuries",
    "conservative_rehab",
    "available_splits",
    "structured_days",
    "triage_questions",
    "missing_inputs",
    "unsupported_zone",
    "safety_stop",
    "medical_disclaimer",
    "body_zone",
    "split_key",
    "focus_note",
)


def _sanitize_leaked_internal_tokens(text: str) -> str:
    if not text or not any(t in text for t in _LEAK_TOKENS):
        return text
    out = text
    for t in sorted(_LEAK_TOKENS, key=len, reverse=True):
        out = out.replace(t, "")
    out = re.sub(r" {2,}", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


def _assistant_reply_text(response: Optional[dict]) -> str:
    """Texto visible del assistant; Groq puede devolver content=None con solo tool_calls."""
    if not response:
        return ""
    raw = response.get("content")
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw.strip()
    return str(raw).strip()


class ChatService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.chat_repo = ChatRepository(db)
        self.coach_insight_repo = CoachInsightRepository(db)
        self.profile_repo = ProfileRepository(db)
        self.progress_repo = ProgressRepository(db)

    async def send_message(
        self,
        user_id: str,
        message: str,
        session_id: Optional[UUID] = None,
        photo_context=None,
        image_base64: Optional[str] = None,
        image_mime_type: Optional[str] = None,
    ) -> dict:
        if session_id is not None:
            session = await self.chat_repo.get_session(session_id, user_id)
            if not session:
                raise HTTPException(status_code=404, detail="Sesion no encontrada")

        is_safe, blocked_msg = check_message_safety(message)
        if not is_safe:
            safety_event = AiSafetyEvent(
                user_id=user_id,
                event_type="blocked_topic",
                details={
                    "message_sha256": hashlib.sha256(message.encode("utf-8")).hexdigest(),
                    "message_len": len(message),
                    "reason": blocked_msg,
                },
            )
            self.db.add(safety_event)

            if not session_id:
                session = await self.chat_repo.create_session(user_id)
                session_id = session.id

            await self.chat_repo.add_message(session_id, "user", message)
            assistant_msg = await self.chat_repo.add_message(session_id, "assistant", blocked_msg)

            from app.services.badge_integration import fire_coach_message

            await fire_coach_message(self.db, user_id, message)

            return {
                "message": assistant_msg,
                "session_id": session_id,
                "actions_taken": ["blocked_topic"],
            }

        if not session_id:
            session = await self.chat_repo.create_session(user_id, title=message[:50])
            session_id = session.id

        if not has_groq_keys():
            raise HTTPException(
                status_code=503,
                detail=(
                    "El asistente no está configurado: falta GROQ_API_KEY o GROQ_API_KEYS en el .env del backend. "
                    "Crea una clave gratuita en https://console.groq.com y reinicia el servidor."
                ),
            )

        quota = SubscriptionQuotaService(self.db)
        await quota.require_chat_turn(user_id)
        if image_base64 and image_mime_type:
            await quota.require_vision(user_id)

        await self.chat_repo.add_message(session_id, "user", message)

        # Modificación de la última rutina generada en la sesión.
        # Determinista: no pasa por el LLM si la instrucción es clara.
        # Solo entramos aquí si HAY rutina previa, para no dar falsos positivos
        # con frases que casualmente contengan verbos como "cambia", "quita", "sin".
        prev_plan = (
            await self.chat_repo.get_last_training_plan(session_id)
            if is_modification_intent(message)
            else None
        )
        if prev_plan is not None:
            mod_result = apply_modifications(prev_plan, message)
            used_llm_fallback = False

            # Si el determinista no resuelve, pedimos al LLM que decida qué
            # cambiar. El LLM solo elige índices; el código aplica los cambios.
            if mod_result["ambiguous"] or mod_result["no_match"]:
                try:
                    llm_result = await resolve_modifications_via_llm(prev_plan, message)
                    if llm_result["changes"]:
                        mod_result = llm_result
                        used_llm_fallback = True
                except Exception as e:
                    logger.warning("LLM fallback de modificación falló: %s", e)

            if mod_result["changes"]:
                updated_plan = mod_result["training_plan"]
                reply = summarize_changes(mod_result["changes"])
                action = "training_plan_modify_llm" if used_llm_fallback else "training_plan_modify"
                assistant_msg = await self.chat_repo.add_message(
                    session_id,
                    "assistant",
                    reply,
                    tool_results={"training_plan": updated_plan},
                )
                from app.services.badge_integration import fire_coach_message
                await fire_coach_message(self.db, user_id, message)
                return {
                    "message": assistant_msg,
                    "session_id": session_id,
                    "actions_taken": [action],
                    "training_plan": updated_plan,
                }

            # Ni el determinista ni el LLM resolvieron: pedimos aclaración,
            # pero devolvemos la rutina actual para que la tarjeta vuelva a
            # mostrarse (el usuario ve qué hay y puede señalar exactamente
            # qué quiere cambiar).
            if mod_result["ambiguous"]:
                reply = (
                    "¿Qué ejercicio quieres cambiar y por cuál? "
                    "Por ejemplo: «cambia curl martillo por curl predicador» "
                    "o «quita peso muerto». Te dejo la rutina actual debajo."
                )
            else:
                reply = (
                    "No he encontrado ese ejercicio en la rutina actual. "
                    "Dime cuál exactamente quieres cambiar (puedes copiar el "
                    "nombre tal cual aparece). Te dejo la rutina actual debajo."
                )
            assistant_msg = await self.chat_repo.add_message(
                session_id,
                "assistant",
                reply,
                tool_results={"training_plan": prev_plan},
            )
            from app.services.badge_integration import fire_coach_message
            await fire_coach_message(self.db, user_id, message)
            return {
                "message": assistant_msg,
                "session_id": session_id,
                "actions_taken": ["training_plan_modify_clarify"],
                "training_plan": prev_plan,
            }

        premium, _ = await quota.premium_status(user_id)
        coach_usage = await quota.build_usage_snapshot(user_id, premium=premium)

        profile = await self.profile_repo.get_by_user_id(user_id)
        target = await self.profile_repo.get_active_target(user_id)

        prefs = None
        if profile:
            prefs = await self.profile_repo.get_preferences(profile.id)

        user_context = {
            "display_name": (profile.display_name.strip().split()[0] if profile and profile.display_name and profile.display_name.strip() else "usuario"),
            "goal_type": "",
            "current_weight_kg": profile.current_weight_kg if profile else "",
            "height_cm": profile.height_cm if profile else "",
            "sex": profile.sex.value if profile and profile.sex else "",
            "age_years": "",
            "target_kcal": target.calories_kcal if target else "",
            "target_protein_g": target.protein_g if target else "",
            "target_carbs_g": target.carbs_g if target else "",
            "target_fat_g": target.fat_g if target else "",
            "activity_level": "",
            "training_type": "",
            "training_days_per_week": "",
            "active_injuries": safe_getattr(prefs, "active_injuries") or [],
            "sport_profile": {},
            "allergies": [],
            "intolerances": [],
            "forbidden_foods": [],
        }

        if prefs:
            user_context["allergies"] = _prefs_str_list(getattr(prefs, "allergies", None))
            user_context["intolerances"] = _prefs_str_list(getattr(prefs, "intolerances", None))
            user_context["forbidden_foods"] = _prefs_str_list(getattr(prefs, "forbidden_foods", None))

        if profile:
            if profile.birth_year:
                from datetime import date

                user_context["age_years"] = date.today().year - int(profile.birth_year)
            active_goal = await self.profile_repo.get_active_goal(profile.id)
            if active_goal:
                user_context["goal_type"] = active_goal.goal_type.value
                user_context["activity_level"] = active_goal.activity_level.value
                user_context["training_type"] = active_goal.training_type.value
                user_context["training_days_per_week"] = active_goal.training_days_per_week

        if prefs and isinstance(getattr(prefs, "plan_preferences", None), dict):
            raw_sp = prefs.plan_preferences.get("sport_profile")
            if isinstance(raw_sp, dict) and raw_sp:
                user_context["sport_profile"] = raw_sp

        system_prompt = get_system_prompt(
            user_context,
            coach_quota=coach_usage,
            is_premium=premium,
        )

        history = await self.chat_repo.get_session_messages(session_id, user_id, limit=20)
        messages = [{"role": "system", "content": system_prompt}]

        if photo_context is not None:
            ctx = photo_context if isinstance(photo_context, dict) else photo_context.model_dump()
            items_desc = "; ".join(
                f"{it.get('name','?')} ({it.get('grams',0)}g, {it.get('kcal',0)} kcal, P:{it.get('protein_g',0)}g C:{it.get('carbs_g',0)}g G:{it.get('fat_g',0)}g)"
                for it in ctx.get("items", [])
            )
            photo_system = (
                f"El usuario analizó una foto de comida. Nombre del plato: \"{ctx.get('meal_name', '')}\".\n"
                f"Items detectados: {items_desc}\n\n"
                "Si el usuario pide correcciones (nombre incorrecto, cantidades, macros), "
                "responde con texto explicativo Y además incluye al final de tu respuesta un bloque JSON "
                "con la clave \"corrected_items\" que sea una lista de objetos con los campos: "
                "name, grams, kcal, protein_g, carbs_g, fat_g. "
                "Si no hay correcciones, responde solo con texto normal sin JSON."
            )
            messages.append({"role": "system", "content": photo_system})

        for msg in history:
            text = (msg.content or "").strip() if msg.content is not None else ""
            messages.append({"role": msg.role, "content": text or " "})

        completion_model: Optional[str] = None
        if image_base64 and image_mime_type:
            completion_model = (get_settings().groq_vision_model or "").strip() or None
            if not completion_model:
                raise HTTPException(
                    status_code=503,
                    detail="Falta modelo de visión Groq (groq_vision_model / GROQ_VISION_MODEL) para enviar imágenes al chat.",
                )
            if not messages or messages[-1].get("role") != "user":
                logger.warning("Historial sin mensaje user final; no se inyecta imagen en el prompt.")
            else:
                messages.insert(-1, {"role": "system", "content": _VISION_COACH_HINT})
                caption = (message or "").strip() or " "
                data_url = f"data:{image_mime_type};base64,{image_base64}"
                messages[-1] = {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": caption},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ],
                }

        actions_taken = []
        training_plan = None
        max_tool_rounds = 5
        response = None

        _has_days = re.search(r"\b[2-6]\s*d[ií]as?\b", message, re.IGNORECASE)
        _has_focus = re.search(
            r"\b(fuerza|hipertrofia|strength|hypertrophy)\b", message, re.IGNORECASE,
        )
        _has_muscle = re.search(
            r"\b(gl[uú]teo|pecho|espalda|hombros?|piernas?|cu[aá]driceps|isquio|b[ií]ceps"
            r"|tr[ií]ceps|gemelos?|core|abdomen)\b",
            message, re.IGNORECASE,
        )
        _asks_routine = bool(re.search(
            r"\b(rutina|entrenamiento|ejercicio|workout|training)\b",
            message, re.IGNORECASE,
        ))
        _is_confirmation = bool(re.match(
            r"^\s*(s[ií]|ok|vale|adelante|dale|venga|claro|por\s*favor|genera|hazlo|vamos)\s*[.!]?\s*$",
            message, re.IGNORECASE,
        ))
        _history_mentions_routine = any(
            re.search(r"rutina|entrenamiento|ejercicio|workout|training", (m.get("content") or ""), re.IGNORECASE)
            for m in messages[-4:] if m.get("role") == "assistant"
        )
        _force_tool = bool(
            (_has_days and _has_focus)
            or (_asks_routine and _has_focus)
            or (_asks_routine and _has_days)
            or _has_muscle
            or (_is_confirmation and _history_mentions_routine)
            or _asks_gym_routine(message)
        )
        _TRAINING_TOOL_NAMES = {
            "create_training_suggestion",
            "get_muscle_group_routine",
            "create_rehab_suggestion",
        }
        _training_tool_called = False

        try:
            for _round in range(max_tool_rounds):
                _need_force = _force_tool and not _training_tool_called
                response = await chat_completion(
                    messages=messages,
                    model=completion_model,
                    tools=CHAT_TOOLS,
                    temperature=0.7,
                    tool_choice="required" if _need_force else None,
                )

                if not response["tool_calls"]:
                    break

                # Un solo mensaje assistant con todos los tool_calls; luego un "tool" por id (formato OpenAI/Groq).
                tool_calls_payload = []
                for tc in response["tool_calls"]:
                    fn = tc.get("function") or {}
                    tool_calls_payload.append(
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": fn.get("name", ""),
                                "arguments": fn.get("arguments") or "{}",
                            },
                        }
                    )
                messages.append(
                    {
                        "role": "assistant",
                        "content": response.get("content"),
                        "tool_calls": tool_calls_payload,
                    }
                )

                for tc in response["tool_calls"]:
                    fn = tc.get("function") or {}
                    fn_name = fn.get("name", "")
                    fn_args = json.loads(fn.get("arguments") or "{}") if fn.get("arguments") else {}

                    tool_result = await self._execute_tool(user_id, fn_name, fn_args)
                    actions_taken.append(fn_name)
                    if fn_name in _TRAINING_TOOL_NAMES:
                        _training_tool_called = True

                    # Si el modelo llamó create_training_suggestion sin split_key y la
                    # plantilla devuelve varias opciones, inferimos el split a partir
                    # de la petición del usuario antes de mostrar la lista al modelo.
                    if (
                        fn_name == "create_training_suggestion"
                        and "error" in tool_result
                        and tool_result.get("available_splits")
                        and not fn_args.get("split_key")
                    ):
                        available_split_keys = [
                            str(o.get("split"))
                            for o in tool_result["available_splits"]
                            if o.get("split")
                        ]
                        inferred_sk = _infer_split_key(
                            message,
                            int(fn_args.get("available_days") or 0),
                            _detect_all_muscle_group_keys(message),
                            available_split_keys,
                        )
                        if inferred_sk:
                            retry_args = {**fn_args, "split_key": inferred_sk}
                            retry_result = await self._execute_tool(
                                user_id, fn_name, retry_args,
                            )
                            if "error" not in retry_result:
                                tool_result = retry_result
                                fn_args = retry_args

                    if fn_name == "create_training_suggestion" and "error" not in tool_result:
                        training_plan = {
                            "kind": "training",
                            "name": tool_result.get("name", ""),
                            "split": tool_result.get("split", ""),
                            "focus_note": tool_result.get("focus_note", ""),
                            "disclaimer": tool_result.get("disclaimer", ""),
                            "days": tool_result.get("structured_days", []),
                        }
                    if (
                        fn_name == "create_rehab_suggestion"
                        and tool_result.get("kind") == "rehab"
                        and "error" not in tool_result
                        and tool_result.get("structured_days")
                    ):
                        training_plan = {
                            "kind": "rehab",
                            "name": tool_result.get("name", ""),
                            "split": tool_result.get("split", "readaptacion"),
                            "focus_note": tool_result.get("focus_note", ""),
                            "disclaimer": tool_result.get("disclaimer", ""),
                            "days": tool_result.get("structured_days", []),
                        }
                    if (
                        fn_name == "get_muscle_group_routine"
                        and "error" not in tool_result
                        and tool_result.get("structured_days")
                    ):
                        training_plan = {
                            "kind": "training",
                            "name": tool_result.get("name", ""),
                            "split": tool_result.get("split", ""),
                            "focus_note": tool_result.get("focus_note", ""),
                            "disclaimer": tool_result.get("disclaimer", ""),
                            "days": tool_result.get("structured_days", []),
                        }

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": json.dumps(tool_result, ensure_ascii=False, default=str),
                        }
                    )
        except Exception as e:
            logger.warning(
                "Chat con tools falló (%s); reintentando sin tools: %s", type(e).__name__, e
            )

            recovered = await self._try_recover_failed_tool(user_id, e)
            if recovered:
                training_plan = recovered.get("training_plan")
                actions_taken.append("create_training_suggestion")
                tool_result_json = json.dumps(
                    recovered["tool_result"], ensure_ascii=False, default=str,
                )
                messages.append({"role": "assistant", "content": None, "tool_calls": [
                    {"id": "recovered", "type": "function",
                     "function": {"name": "create_training_suggestion",
                                  "arguments": json.dumps(recovered["args"])}},
                ]})
                messages.append({"role": "tool", "tool_call_id": "recovered",
                                 "content": tool_result_json})
                try:
                    response = await chat_completion(
                        messages=messages,
                        model=completion_model,
                        tools=None,
                        temperature=0.7,
                    )
                except Exception as e3:
                    logger.warning("Chat post-recovery falló: %s", e3)
                    response = {"content": "Aquí tienes tu rutina.", "tool_calls": []}
            else:
                if _force_tool and training_plan is None:
                    logger.info("Force-tool active + API failed; calling training tool directly")
                    _muscle_keys = _detect_all_muscle_group_keys(message)
                    _is_split_request = bool(_has_days) or len(_muscle_keys) >= 2
                    _fb_focus = "fuerza" if (_has_focus and _has_focus.group(0).lower() == "fuerza") else "hipertrofia"
                    if not _is_split_request and len(_muscle_keys) == 1:
                        _fb_result = await self._execute_tool(user_id, "get_muscle_group_routine", {
                            "muscle_group": _muscle_keys[0],
                            "focus": _fb_focus,
                        })
                        if "error" not in _fb_result and _fb_result.get("structured_days"):
                            training_plan = {
                                "kind": "training",
                                "name": _fb_result.get("name", ""),
                                "split": _fb_result.get("split", ""),
                                "focus_note": _fb_result.get("focus_note", ""),
                                "disclaimer": _fb_result.get("disclaimer", ""),
                                "days": _fb_result.get("structured_days", []),
                            }
                            actions_taken.append("get_muscle_group_routine")
                    if training_plan is None:
                        try:
                            _fb_days = int(_has_days.group(0)[0]) if _has_days else int(user_context.get("training_days_per_week") or 4)
                        except (ValueError, TypeError):
                            _fb_days = 4
                        _fb_result = await self._execute_tool(user_id, "create_training_suggestion", {
                            "available_days": _fb_days,
                            "focus": _fb_focus,
                        })
                        if (
                            "error" in _fb_result
                            and _fb_result.get("available_splits")
                            and isinstance(_fb_result["available_splits"], list)
                            and _fb_result["available_splits"]
                        ):
                            available_split_keys = [
                                str(o.get("split"))
                                for o in _fb_result["available_splits"]
                                if o.get("split")
                            ]
                            inferred_sk = _infer_split_key(
                                message, _fb_days, _muscle_keys, available_split_keys,
                            )
                            chosen_sk = inferred_sk or (
                                available_split_keys[0] if available_split_keys else None
                            )
                            if chosen_sk:
                                _fb_result = await self._execute_tool(user_id, "create_training_suggestion", {
                                    "available_days": _fb_days,
                                    "focus": _fb_focus,
                                    "split_key": str(chosen_sk),
                                })
                        if "error" not in _fb_result and _fb_result.get("structured_days"):
                            training_plan = {
                                "kind": "training",
                                "name": _fb_result.get("name", ""),
                                "split": _fb_result.get("split", ""),
                                "focus_note": _fb_result.get("focus_note", ""),
                                "disclaimer": _fb_result.get("disclaimer", ""),
                                "days": _fb_result.get("structured_days", []),
                            }
                            actions_taken.append("create_training_suggestion")
                    response = {
                        "content": "Aquí tienes tu rutina." if training_plan else "Necesito un dato más para generar tu rutina.",
                        "tool_calls": [],
                    }
                else:
                    plain_msgs = [
                        m
                        for m in messages
                        if m.get("role") in ("system", "user")
                        or (
                            m.get("role") == "assistant"
                            and (m.get("content") or "").strip()
                            and not m.get("tool_calls")
                        )
                    ]
                    try:
                        response = await chat_completion(
                            messages=plain_msgs,
                            model=completion_model,
                            tools=None,
                            temperature=0.7,
                        )
                    except Exception as e2:
                        logger.exception("Chat sin tools también falló: %s", e2)
                        raise

        content = _assistant_reply_text(response)
        if not content:
            try:
                response = await chat_completion(
                    messages=messages,
                    model=completion_model,
                    tools=None,
                    temperature=0.7,
                )
                content = _assistant_reply_text(response)
            except Exception as e:
                logger.warning("Segundo pase de chat sin tools (texto final) falló: %s", e)
        if not content:
            content = (
                "No pude generar respuesta ahora. Comprueba GROQ_API_KEY, el modelo GROQ_CHAT_MODEL "
                "en https://console.groq.com/docs/models y los logs del backend."
            )

        language_warnings = check_response_language(content)
        if language_warnings:
            logger.warning(f"Language warnings: {language_warnings}")

        disclaimers = needs_disclaimer(content)
        if disclaimers:
            content += "\n\n" + "\n".join(disclaimers)

        # Parse corrected_items from assistant response if photo_context was provided
        corrected_items = None
        if photo_context is not None and content:
            try:
                json_match = re.search(r'\{[^{}]*"corrected_items"\s*:\s*\[.*?\]\s*\}', content, re.DOTALL)
                if json_match:
                    parsed = json.loads(json_match.group())
                    raw_items = parsed.get("corrected_items", [])
                    if isinstance(raw_items, list) and raw_items:
                        corrected_items = []
                        for ci in raw_items:
                            corrected_items.append({
                                "name": ci.get("name", ""),
                                "grams": float(ci.get("grams", 0)),
                                "kcal": float(ci.get("kcal", 0)),
                                "protein_g": float(ci.get("protein_g", 0)),
                                "carbs_g": float(ci.get("carbs_g", 0)),
                                "fat_g": float(ci.get("fat_g", 0)),
                            })
                        # Strip JSON block from visible content
                        content = content[:json_match.start()].rstrip() + content[json_match.end():].lstrip()
                        content = content.strip() or "Corregido."
            except Exception as parse_err:
                logger.warning("Failed to parse corrected_items from response: %s", parse_err)

        if training_plan is None and not _rehab_intent(message):
            wants_template = _asks_gym_routine(message) or _looks_like_routine(content)
            if wants_template:
                logger.warning(
                    "Sin training_plan pese a intención de rutina o texto con ejercicios; "
                    "forzando plantilla del servidor"
                )
                muscle_keys = _detect_all_muscle_group_keys(message)
                is_split_request = (
                    bool(_has_days)
                    or len(muscle_keys) >= 2
                    or bool(_SPLIT_KEYWORDS_RE.search(message))
                )
                if not is_split_request and len(muscle_keys) == 1:
                    fb_m = await self._execute_tool(
                        user_id,
                        "get_muscle_group_routine",
                        {
                            "muscle_group": muscle_keys[0],
                            "focus": "fuerza" if re.search(r"\bfuerza\b", message, re.I) else "hipertrofia",
                            "experience_level": "intermedio",
                        },
                    )
                    if "error" not in fb_m and fb_m.get("structured_days"):
                        training_plan = {
                            "kind": "training",
                            "name": fb_m.get("name", ""),
                            "split": fb_m.get("split", ""),
                            "focus_note": fb_m.get("focus_note", ""),
                            "disclaimer": fb_m.get("disclaimer", ""),
                            "days": fb_m.get("structured_days", []),
                        }
                        actions_taken.append("get_muscle_group_routine")
                if training_plan is None:
                    try:
                        _fb_days = (
                            int(_has_days.group(0)[0])
                            if _has_days
                            else int(user_context.get("training_days_per_week") or 4)
                        )
                    except (ValueError, TypeError):
                        _fb_days = 4
                    focus_fb = "fuerza" if re.search(r"\bfuerza\b", message, re.I) else "hipertrofia"
                    _fb_result = await self._execute_tool(
                        user_id,
                        "create_training_suggestion",
                        {"available_days": _fb_days, "focus": focus_fb},
                    )
                    if (
                        "error" in _fb_result
                        and _fb_result.get("available_splits")
                        and isinstance(_fb_result["available_splits"], list)
                        and _fb_result["available_splits"]
                    ):
                        available_split_keys = [
                            str(o.get("split"))
                            for o in _fb_result["available_splits"]
                            if o.get("split")
                        ]
                        inferred_sk = _infer_split_key(
                            message, _fb_days, muscle_keys, available_split_keys,
                        )
                        chosen_sk = inferred_sk or (
                            available_split_keys[0] if available_split_keys else None
                        )
                        if chosen_sk:
                            _fb_result = await self._execute_tool(
                                user_id,
                                "create_training_suggestion",
                                {
                                    "available_days": _fb_days,
                                    "focus": focus_fb,
                                    "split_key": str(chosen_sk),
                                },
                            )
                    if "error" not in _fb_result and _fb_result.get("structured_days"):
                        training_plan = {
                            "kind": "training",
                            "name": _fb_result.get("name", ""),
                            "split": _fb_result.get("split", ""),
                            "focus_note": _fb_result.get("focus_note", ""),
                            "disclaimer": _fb_result.get("disclaimer", ""),
                            "days": _fb_result.get("structured_days", []),
                        }
                        actions_taken.append("create_training_suggestion")

        if training_plan is None and _force_tool:
            logger.warning("Sin training_plan pese a intención de rutina; forzando plantilla del servidor")
            _muscle_keys_force = _detect_all_muscle_group_keys(message)
            _is_split_force = bool(_has_days) or len(_muscle_keys_force) >= 2
            if not _is_split_force and len(_muscle_keys_force) == 1:
                _mg_res = await self._execute_tool(user_id, "get_muscle_group_routine", {
                    "muscle_group": _muscle_keys_force[0],
                    "focus": "fuerza" if (_has_focus and _has_focus.group(0).lower() == "fuerza") else "hipertrofia",
                })
                if "error" not in _mg_res and _mg_res.get("structured_days"):
                    training_plan = {
                        "kind": "training",
                        "name": _mg_res.get("name", ""),
                        "split": _mg_res.get("split", ""),
                        "focus_note": _mg_res.get("focus_note", ""),
                        "disclaimer": _mg_res.get("disclaimer", ""),
                        "days": _mg_res.get("structured_days", []),
                    }
                    actions_taken.append("forced_template_muscle_group")

            if training_plan is None:
                try:
                    _fb_days = int(_has_days.group(0)[0]) if _has_days else int(user_context.get("training_days_per_week") or 4)
                except (ValueError, TypeError):
                    _fb_days = 4
                _fb_focus = "fuerza" if (_has_focus and _has_focus.group(0).lower() == "fuerza") else "hipertrofia"
                _tpl = get_training_suggestion(
                    available_days=_fb_days,
                    focus=_fb_focus,
                    split_key=None,
                    injury_profiles=None,
                )
                if "error" in _tpl and _tpl.get("available_splits"):
                    _avail_keys = [
                        str(o.get("split"))
                        for o in _tpl["available_splits"]
                        if o.get("split")
                    ]
                    _inferred = _infer_split_key(
                        message, _fb_days, _muscle_keys_force, _avail_keys,
                    )
                    _split = _inferred or (_avail_keys[0] if _avail_keys else None)
                    if _split:
                        _tpl = get_training_suggestion(
                            available_days=_fb_days,
                            focus=_fb_focus,
                            split_key=_split,
                            injury_profiles=None,
                        )
                if "error" not in _tpl and _tpl.get("structured_days"):
                    training_plan = {
                        "kind": "training",
                        "name": _tpl.get("name", ""),
                        "split": _tpl.get("split", ""),
                        "focus_note": _tpl.get("focus_note", ""),
                        "disclaimer": _tpl.get("disclaimer", ""),
                        "days": _tpl.get("structured_days", []),
                    }
                    actions_taken.append("forced_template_split")

        if training_plan:
            content = "Aquí tienes tu rutina."

        content = _sanitize_leaked_internal_tokens(content)

        tool_calls_to_store = response.get("tool_calls") if response else None
        tool_results_to_store = {"training_plan": training_plan} if training_plan else None
        assistant_msg = await self.chat_repo.add_message(
            session_id,
            "assistant",
            content,
            tool_calls=tool_calls_to_store,
            tool_results=tool_results_to_store,
        )

        if image_base64 and image_mime_type:
            await quota.record_vision_success(user_id)

        result = {
            "message": assistant_msg,
            "session_id": session_id,
            "actions_taken": actions_taken,
        }
        if corrected_items:
            result["corrected_items"] = corrected_items
        if training_plan:
            result["training_plan"] = training_plan
        from app.services.badge_integration import fire_coach_chat_photo, fire_coach_message

        if image_base64 and image_mime_type:
            await fire_coach_chat_photo(self.db, user_id)
        await fire_coach_message(self.db, user_id, message)
        return result

    _FAILED_GEN_RE = re.compile(
        r'<function=(\w+)>\s*(\{.*?\})\s*</function>',
        re.DOTALL,
    )

    async def _try_recover_failed_tool(self, user_id: str, exc: Exception) -> Optional[dict]:
        """If Groq rejected a tool call due to type mismatch, parse and execute it manually."""
        err_str = str(exc)
        if "tool_use_failed" not in err_str and "tool call validation" not in err_str:
            return None

        m = self._FAILED_GEN_RE.search(err_str)
        if not m:
            return None

        fn_name = m.group(1)
        try:
            fn_args = json.loads(m.group(2))
        except json.JSONDecodeError:
            return None

        args_fingerprint = hashlib.sha256(json.dumps(fn_args, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
        logger.info("Recovering failed tool call: %s args_sha256=%s", fn_name, args_fingerprint)
        tool_result = await self._execute_tool(user_id, fn_name, fn_args)

        if "error" in tool_result:
            return None

        result: dict = {"tool_result": tool_result, "args": fn_args}
        if fn_name == "create_training_suggestion":
            result["training_plan"] = {
                "kind": "training",
                "name": tool_result.get("name", ""),
                "split": tool_result.get("split", ""),
                "focus_note": tool_result.get("focus_note", ""),
                "disclaimer": tool_result.get("disclaimer", ""),
                "days": tool_result.get("structured_days", []),
            }
        if fn_name == "create_rehab_suggestion" and tool_result.get("structured_days"):
            result["training_plan"] = {
                "kind": "rehab",
                "name": tool_result.get("name", ""),
                "split": tool_result.get("split", "readaptacion"),
                "focus_note": tool_result.get("focus_note", ""),
                "disclaimer": tool_result.get("disclaimer", ""),
                "days": tool_result.get("structured_days", []),
            }
        if fn_name == "get_muscle_group_routine" and tool_result.get("structured_days"):
            result["training_plan"] = {
                "kind": "training",
                "name": tool_result.get("name", ""),
                "split": tool_result.get("split", ""),
                "focus_note": tool_result.get("focus_note", ""),
                "disclaimer": tool_result.get("disclaimer", ""),
                "days": tool_result.get("structured_days", []),
            }
        return result

    async def _execute_tool(self, user_id: str, tool_name: str, args: dict) -> dict:
        try:
            if tool_name == "get_user_context":
                profile = await self.profile_repo.get_by_user_id(user_id)
                if not profile:
                    return {"error": "Perfil no encontrado"}
                prefs = await self.profile_repo.get_preferences(profile.id)
                pp = prefs.plan_preferences if prefs else None
                sport_profile = {}
                if isinstance(pp, dict):
                    sp = pp.get("sport_profile")
                    if isinstance(sp, dict):
                        sport_profile = sp
                return {
                    "display_name": profile.display_name,
                    "sex": profile.sex.value if profile.sex else None,
                    "birth_year": profile.birth_year,
                    "height_cm": profile.height_cm,
                    "current_weight_kg": profile.current_weight_kg,
                    "preferences": prefs.dietary_preferences if prefs else [],
                    "disliked_foods": prefs.disliked_foods if prefs else [],
                    "allergies": prefs.allergies if prefs else [],
                    "intolerances": safe_getattr(prefs, "intolerances") or [],
                    "forbidden_foods": safe_getattr(prefs, "forbidden_foods") or [],
                    "active_injuries": safe_getattr(prefs, "active_injuries") or [],
                    "sport_profile": sport_profile,
                }

            elif tool_name == "get_current_targets":
                target = await self.profile_repo.get_active_target(user_id)
                if not target:
                    return {"error": "No hay objetivos configurados"}
                return {
                    "calories_kcal": target.calories_kcal,
                    "protein_g": target.protein_g,
                    "carbs_g": target.carbs_g,
                    "fat_g": target.fat_g,
                    "steps_target": target.steps_target,
                }

            elif tool_name == "search_foods":
                provider = GenericFoodProvider(self.db)
                results = await provider.search(args.get("query", ""), limit=5)
                return {
                    "results": [
                        {
                            "name": r.name,
                            "kcal_per_100g": r.kcal_per_100g,
                            "protein_per_100g": r.protein_per_100g,
                            "carbs_per_100g": r.carbs_per_100g,
                            "fat_per_100g": r.fat_per_100g,
                        }
                        for r in results
                    ]
                }

            elif tool_name == "get_progress_summary":
                since = date.today() - timedelta(days=7)
                totals = await self.progress_repo.get_daily_totals(user_id, since)
                weight_history = await self.progress_repo.get_weight_history(user_id, days=30)
                await fire_progress_summary_viewed(self.db, user_id)
                return {
                    **totals,
                    "recent_weights": [
                        {"date": str(w.date), "weight_kg": w.weight_kg}
                        for w in weight_history[-5:]
                    ],
                }

            elif tool_name == "analyze_plateau":
                weight_history = await self.progress_repo.get_weight_history(user_id, days=60)
                since = date.today() - timedelta(days=7)
                totals = await self.progress_repo.get_daily_totals(user_id, since)
                target = await self.profile_repo.get_active_target(user_id)

                weight_logs = [
                    {"date": str(w.date), "weight_kg": w.weight_kg}
                    for w in weight_history
                ]

                adherence = None
                if target and totals.get("avg_daily_kcal"):
                    diff = abs(totals["avg_daily_kcal"] - target.calories_kcal)
                    adherence = max(0, 100 - (diff / target.calories_kcal * 100))

                result = analyze_plateau(
                    weight_logs=weight_logs,
                    avg_daily_kcal=totals.get("avg_daily_kcal"),
                    target_kcal=target.calories_kcal if target else None,
                    adherence_pct=adherence,
                    days_logged=totals.get("days_logged", 0),
                    current_steps=target.steps_target if target else None,
                    goal_type="lose_fat",
                )
                return result

            elif tool_name == "create_training_suggestion":
                raw_days = args.get("available_days", 4)
                try:
                    available_days = int(raw_days)
                except (ValueError, TypeError):
                    available_days = 4
                injury_profiles = None
                prof = await self.profile_repo.get_by_user_id(user_id)
                if prof:
                    pref = await self.profile_repo.get_preferences(prof.id)
                    raw_inj = safe_getattr(pref, "active_injuries") or []
                    parsed = profiles_from_raw(raw_inj)
                    if parsed:
                        injury_profiles = parsed
                result = get_training_suggestion(
                    available_days=available_days,
                    focus=args.get("focus", "hipertrofia"),
                    split_key=args.get("split_key"),
                    injury_profiles=injury_profiles,
                )
                return result

            elif tool_name == "create_rehab_suggestion":
                from app.ai.rehab_suggestions import ALL_REHAB_ZONES, build_rehab_suggestion
                from app.schemas.injury_profile import injury_profile_from_dict, normalize_legacy_zone

                def _pain01(v) -> Optional[int]:
                    if v is None:
                        return None
                    try:
                        return max(0, min(10, int(v)))
                    except (TypeError, ValueError):
                        return None

                raw_zone = args.get("body_zone")
                body_zone_arg: Optional[str] = None
                if isinstance(raw_zone, str) and raw_zone.strip():
                    z = raw_zone.strip()
                    body_zone_arg = z if z in ALL_REHAB_ZONES else str(normalize_legacy_zone(z))

                onset_raw = args.get("onset_type")
                onset_t = None
                if onset_raw in ("sudden_recent", "gradual_overuse", "unclear"):
                    onset_t = onset_raw  # type: ignore[assignment]

                if "red_flags" in args:
                    raw_rf = args.get("red_flags")
                    if raw_rf is None:
                        red_flags_arg: Optional[list[str]] = None
                    elif isinstance(raw_rf, list):
                        red_flags_arg = [str(x).strip() for x in raw_rf if str(x).strip()]
                    else:
                        red_flags_arg = []
                else:
                    red_flags_arg = None

                saved_injury = None
                use_saved = bool(args.get("use_saved_injuries"))
                prof = await self.profile_repo.get_by_user_id(user_id)
                if prof and use_saved:
                    pref = await self.profile_repo.get_preferences(prof.id)
                    raw_inj = safe_getattr(pref, "active_injuries") or []
                    parsed_list = []
                    for item in raw_inj:
                        if isinstance(item, dict):
                            p = injury_profile_from_dict(item)
                            if p:
                                parsed_list.append(p)
                    if parsed_list:
                        if body_zone_arg:
                            for p in parsed_list:
                                if str(p.body_zone) == str(body_zone_arg):
                                    saved_injury = p
                                    break
                        if saved_injury is None:
                            saved_injury = parsed_list[0]
                        if body_zone_arg is None:
                            body_zone_arg = str(saved_injury.body_zone)

                return build_rehab_suggestion(
                    body_zone=body_zone_arg,
                    onset_type=onset_t,
                    pain_at_rest=_pain01(args.get("pain_at_rest")),
                    pain_with_movement=_pain01(args.get("pain_with_movement")),
                    red_flags=red_flags_arg,
                    laterality=args.get("laterality") if isinstance(args.get("laterality"), str) else None,
                    notes=args.get("notes") if isinstance(args.get("notes"), str) else None,
                    saved_injury=saved_injury,
                )

            elif tool_name == "get_muscle_group_routine":
                from app.ai.muscle_group_routines import get_muscle_group_routine
                return get_muscle_group_routine(
                    muscle_group=args.get("muscle_group", ""),
                    focus=args.get("focus", "hipertrofia"),
                    experience_level=args.get("experience_level", "intermedio"),
                )

            elif tool_name == "explain_macro_distribution":
                target = await self.profile_repo.get_active_target(user_id)
                if not target:
                    return {"error": "No hay objetivos configurados"}
                total_kcal = target.protein_g * 4 + target.carbs_g * 4 + target.fat_g * 9
                return {
                    "calories_kcal": target.calories_kcal,
                    "protein_g": target.protein_g,
                    "protein_pct": round(target.protein_g * 4 / total_kcal * 100) if total_kcal else 0,
                    "carbs_g": target.carbs_g,
                    "carbs_pct": round(target.carbs_g * 4 / total_kcal * 100) if total_kcal else 0,
                    "fat_g": target.fat_g,
                    "fat_pct": round(target.fat_g * 9 / total_kcal * 100) if total_kcal else 0,
                }

            else:
                return {"error": f"Herramienta '{tool_name}' no implementada"}

        except Exception as e:
            logger.error("Tool execution error (%s): %s", tool_name, type(e).__name__)
            return {"error": "tool_failed"}

    async def get_sessions(self, user_id: str):
        return await self.chat_repo.get_sessions(user_id)

    async def get_session_detail(self, session_id: UUID, user_id: str):
        return await self.chat_repo.get_session(session_id, user_id)

    async def save_coach_insight(
        self, user_id: str, body: str, source_chat_message_id: Optional[UUID] = None
    ):
        from app.services.badge_integration import fire_coach_insight_saved

        text = (body or "").strip()
        if len(text) < 3:
            raise HTTPException(status_code=400, detail="El texto es demasiado corto")
        if source_chat_message_id is not None:
            msg = await self.chat_repo.get_message_for_user(source_chat_message_id, user_id)
            if not msg:
                raise HTTPException(status_code=404, detail="Mensaje no encontrado")
            if (msg.role or "").lower() != "assistant":
                raise HTTPException(
                    status_code=400,
                    detail="Solo puedes enlazar un mensaje del asistente",
                )
        row = await self.coach_insight_repo.create(user_id, text[:8000], source_chat_message_id)
        await fire_coach_insight_saved(self.db, user_id, row.id)
        return row

    async def list_coach_insights(self, user_id: str, limit: int = 50):
        return await self.coach_insight_repo.list_for_user(user_id, limit=limit)

    async def delete_coach_insight(self, insight_id: str, user_id: str) -> bool:
        return await self.coach_insight_repo.delete(insight_id, user_id)
