"""Capa determinista: fusión de lesiones, selección de ejercicios y trazabilidad."""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from app.ai.training_exercises import (
    EXERCISES,
    MEDICAL_DISCLAIMER_ES,
    SAFETY_DEFER_MESSAGE_ES,
    exercise_all_tags,
    exercise_blocked,
)
from app.ai.training_line_candidates import FALLBACK_SAFE_POOL, resolve_line_candidates
from app.rules.injury_defaults import default_exclude_tags_for_zone_phase
from app.schemas.injury_profile import InjuryProfile, parse_injury_list

_EXERCISE_RE = re.compile(r"^(.+?):\s*(\d+)\s*x\s*(.+)$")


def parse_exercise_str(raw: str) -> dict[str, Any]:
    m = _EXERCISE_RE.match(raw.strip())
    if m:
        return {"name": m.group(1).strip(), "sets": int(m.group(2)), "reps": m.group(3).strip()}
    return {"name": raw.strip(), "sets": 0, "reps": ""}


SafetyMode = Literal["ok", "defer", "rehab_only"]


@dataclass
class MergedInjuryContext:
    merged_exclude: set[str] = field(default_factory=set)
    merged_caution: set[str] = field(default_factory=set)
    merged_preferred: set[str] = field(default_factory=set)
    safety_mode: SafetyMode = "ok"
    defer_reason: Optional[str] = None


def _pain_triggers_defer(p: InjuryProfile) -> bool:
    pr = p.pain_at_rest
    pm = p.pain_with_movement
    if p.red_flags_reported:
        return True
    if pr is not None and pr >= 7:
        return True
    if pm is not None and pm >= 8:
        return True
    if p.phase == "acute" and pm is not None and pm >= 6:
        return True
    return False


def _pain_triggers_rehab_path(p: InjuryProfile) -> bool:
    return p.phase == "rehab_only"


def merge_injury_profiles(profiles: list[InjuryProfile]) -> MergedInjuryContext:
    ctx = MergedInjuryContext()
    if not profiles:
        return ctx

    for p in profiles:
        if _pain_triggers_defer(p):
            ctx.safety_mode = "defer"
            ctx.defer_reason = "pain_or_red_flags"
            return ctx

    if any(_pain_triggers_rehab_path(p) for p in profiles):
        ctx.safety_mode = "rehab_only"
        return ctx

    for p in profiles:
        base = set(default_exclude_tags_for_zone_phase(p.body_zone, p.phase))
        user_ex = set(p.exclude_tags or [])
        ctx.merged_exclude |= base | user_ex
        ctx.merged_caution |= set(p.caution_tags or [])
        ctx.merged_preferred |= set(p.preferred_tags or [])

    for p in profiles:
        if p.pain_with_movement is not None and p.pain_with_movement > 3:
            ctx.merged_preferred.update(["machine_supported", "tempo_controlled", "isometric"])

    return ctx


def _pick_exercise(
    candidates: list[str],
    merged_exclude: set[str],
    preferred: set[str],
) -> tuple[str, list[str], str]:
    """Elige primer id no bloqueado; refuerza preferidos. Retorna (id, tried, reason)."""
    tried: list[str] = []
    # Primera pasada: preferidos que no estén bloqueados
    if preferred:
        for c in candidates:
            tried.append(c)
            if exercise_blocked(c, merged_exclude):
                continue
            if preferred & exercise_all_tags(c):
                return c, tried, "preferred_tag_match"
    for c in candidates:
        if c not in tried:
            tried.append(c)
        if not exercise_blocked(c, merged_exclude):
            return c, tried, "first_allowed_candidate"
    for f in FALLBACK_SAFE_POOL:
        tried.append(f)
        if not exercise_blocked(f, merged_exclude):
            return f, tried, "fallback_pool"
    # último recurso: primer ejercicio isométrico suave
    for emergency in ("ex_plank", "ex_band_pull_apart", "ex_quad_iso"):
        tried.append(emergency)
        if not exercise_blocked(emergency, merged_exclude):
            return emergency, tried, "emergency_safe"
    return "ex_plank", tried, "forced_minimum"


def _format_exercise_line(ex_id: str, sets: int, reps: str) -> str:
    ex = EXERCISES.get(ex_id)
    label = ex["display_name"] if ex else ex_id
    if sets and reps:
        return f"{label}: {sets}x{reps}"
    return label


REHAB_SESSIONS: dict[str, list[tuple[str, str, str]]] = {
    # (ex_id, sets x reps string, nota breve: cues técnicos + seguridad; no alarga el chat del usuario)
    "cervical": [
        ("ex_cat_cow", "2x10", "Cuello largo; solo rango cómodo; sin forzar finales"),
        ("ex_band_pull_apart", "3x12-15", "Escápulas hacia abajo; no compensar con barbilla"),
        ("ex_dead_bug", "3x8-10", "Mantener cabeza apoyada; respiración diafragmática"),
    ],
    "shoulder": [
        ("ex_band_pull_apart", "3x12-15", "Rango sin pinzamiento; tensión en espalda alta, no trapecio"),
        ("ex_external_rot_band", "3x10-12", "Codo pegado; rotación externa controlada; sin balanceo"),
        ("ex_row_machine", "3x10-12", "Tirón al pecho; escápula que se mueve sin encajar hombro"),
    ],
    "elbow": [
        ("ex_row_machine", "3x10-12", "Agarre neutro; flexión/extensión sin chasquidos; rango tolerado"),
        ("ex_tricep_pushdown", "3x12-15", "Codos fijos al costado; cuerda o barra; carga mínima"),
        ("ex_band_pull_apart", "3x12-15", "Hombros bajos; tensión suave en banda"),
    ],
    "wrist_hand": [
        ("ex_row_machine", "3x10-12", "Muñeca neutra; sin desviación radial/ulnar"),
        ("ex_tricep_pushdown", "3x12-15", "Antebrazo alineado; no hiperextender muñeca"),
        ("ex_plank", "3x20-35s", "Sobre antebrazos o puños; muñeca neutra"),
    ],
    "thoracic": [
        ("ex_cat_cow", "2x10", "Énfasis en extensión suave torácica; lumbar estable"),
        ("ex_band_pull_apart", "3x12-15", "Abrir pecho; escápulas retraídas sin arquear zona lumbar"),
        ("ex_row_machine", "3x10-12", "Tirón al bajo pecho; rotación torácica permitida sin dolor"),
    ],
    "lumbar": [
        ("ex_cat_cow", "2x10", "Movilidad lenta; no forzar flexión si escozor"),
        ("ex_dead_bug", "3x8-10", "Lumbar pegado al suelo; exhalar en extensión de pierna"),
        ("ex_rdl_light", "3x8-10", "Bisagra desde cadera; barra o mancuernas ligeras; rodillas alineadas"),
    ],
    "hip": [
        ("ex_step_up", "3x8-10", "Step bajo; rodilla sigue punta del pie; sin valgo doloroso"),
        ("ex_rdl_light", "3x8-10", "Cadera atrás; isquios tensos sin redondear zona lumbar"),
        ("ex_leg_press", "3x12-15", "Pies alineados; rango corto si molesta cadera"),
    ],
    "knee": [
        ("ex_quad_iso", "3x20-30s", "Rodilla sobre toalla; empuje suave del talón; sin dolor agudo"),
        ("ex_leg_ext", "3x12-15", "Rango corto al inicio; patela alineada; sin extensión forzada"),
        ("ex_step_up", "3x8-10", "Step 15-20 cm; control excéntrico; no dejar rodilla hacia dentro"),
    ],
    "ankle_foot": [
        ("ex_ankle_pumps", "3x15-20", "Rango completo flexión/extensión; sin entumecimiento extremo"),
        ("ex_step_up", "3x8-10", "Step muy bajo; talón estable; no balancear"),
        ("ex_calf", "3x12-15", "Rodilla casi extendida; pausa arriba; rango tolerado"),
    ],
    "default": [
        ("ex_row_machine", "3x10-12", "Máquina o apoyo; tirón estable sin compensar lumbar"),
        ("ex_leg_press", "3x12-15", "Pies anchura cadera; no bloquear rodillas al máximo si molesta"),
        ("ex_plank", "3x30-45s", "Cintura escapular activa; no hundir cadera"),
    ],
}


def build_rehab_block(primary_zone: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    rows = REHAB_SESSIONS.get(primary_zone) or REHAB_SESSIONS["default"]
    lines: list[str] = []
    trace: list[dict[str, Any]] = []
    for ex_id, sr, note in rows:
        ex = EXERCISES.get(ex_id, {})
        parts = sr.split("x", 1)
        sets = int(parts[0]) if parts[0].isdigit() else 3
        reps = parts[1] if len(parts) > 1 else "10-12"
        lines.append(_format_exercise_line(ex_id, sets, reps))
        trace.append(
            {
                "slot": "rehab_template",
                "chosen": ex_id,
                "display": ex.get("display_name", ex_id),
                "reason": "rehab_only_template",
                "note": note,
            }
        )
    day = {
        "name": "Readaptación conservadora",
        "exercises": lines,
    }
    structured = [
        {
            "name": day["name"],
            "exercises": [_structured_one(x) for x in lines],
        }
    ]
    return [day], structured, trace


def _structured_one(line: str) -> dict[str, Any]:
    p = parse_exercise_str(line)
    return {"name": p["name"], "sets": p["sets"], "reps": p["reps"]}


def adapt_training_days(
    days: list[dict[str, Any]],
    injury_profiles: Optional[list[InjuryProfile]],
) -> dict[str, Any]:
    """
    Adapta días de plantilla (strings en exercises).
    Retorna dict con days, structured_days, adaptation_trace, extra fields.
    """
    profiles = injury_profiles or []
    ctx = merge_injury_profiles(profiles)

    if ctx.safety_mode == "defer":
        return {
            "safety_stop": True,
            "error": "safety_stop",
            "safety_message": SAFETY_DEFER_MESSAGE_ES,
            "medical_disclaimer": MEDICAL_DISCLAIMER_ES,
            "adaptation_trace": [{"reason": ctx.defer_reason or "defer"}],
        }

    if ctx.safety_mode == "rehab_only" and profiles:
        # Priorizar la lesión en fase readaptación explícita; si hay varias, la primera marcada rehab_only
        zone = next(
            (p.body_zone for p in profiles if p.phase == "rehab_only"),
            profiles[0].body_zone,
        )
        rehab_days, structured, trace = build_rehab_block(zone)
        return {
            "mode": "conservative_rehab",
            "days": rehab_days,
            "structured_days": structured,
            "adaptation_trace": trace,
            "medical_disclaimer": MEDICAL_DISCLAIMER_ES,
            "focus_note": (
                "Bloque de readaptación conservadora (carga baja, control técnico). "
                "No sustituye valoración médica/fisioterapia. "
                "Durante el ejercicio, mantén dolor tolerable (orientación ≤3/10); "
                "si el día siguiente aumenta el dolor o la hinchazón, reduce volumen o detente y consulta. "
                "Frecuencia orientativa: 2–4 sesiones ligeras por semana según tolerancia y sueño."
            ),
        }

    trace: list[dict[str, Any]] = []
    new_days: list[dict[str, Any]] = []
    merged_exclude = ctx.merged_exclude
    preferred = ctx.merged_preferred

    for day in days:
        day_copy = copy.deepcopy(day)
        new_exercises: list[str] = []
        for raw_line in day.get("exercises") or []:
            if not isinstance(raw_line, str):
                continue
            parsed = parse_exercise_str(raw_line)
            name_part = parsed["name"]
            sets, reps = parsed["sets"], parsed["reps"]
            candidates = resolve_line_candidates(name_part)
            chosen, tried, reason = _pick_exercise(candidates, merged_exclude, preferred)
            new_line = _format_exercise_line(chosen, sets, reps)
            new_exercises.append(new_line)
            trace.append(
                {
                    "original_template_line": raw_line,
                    "parsed_name": name_part,
                    "candidates_order": candidates,
                    "tried": tried,
                    "chosen_exercise_id": chosen,
                    "reason": reason,
                    "blocked_tags": sorted(merged_exclude),
                }
            )
        day_copy["exercises"] = new_exercises
        new_days.append(day_copy)

    structured = [
        {
            "name": d["name"],
            "exercises": [parse_exercise_str(e) for e in d.get("exercises") or []],
        }
        for d in new_days
    ]

    return {
        "days": new_days,
        "structured_days": structured,
        "adaptation_trace": trace,
        "medical_disclaimer": MEDICAL_DISCLAIMER_ES,
    }


def profiles_from_raw(raw: Any) -> list[InjuryProfile]:
    if not raw:
        return []
    if isinstance(raw, list):
        return parse_injury_list(raw)
    return []
