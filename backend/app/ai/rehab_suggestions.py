"""Deterministic, conservative general rehab suggestions for chat."""

from __future__ import annotations

from typing import Any, Literal, Optional

from app.ai.training_exercises import MEDICAL_DISCLAIMER_ES, SAFETY_DEFER_MESSAGE_ES
from app.schemas.injury_profile import InjuryProfile

RehabBand = Literal["acute_gentle", "return_to_load", "rehab_only"]
OnsetType = Literal["sudden_recent", "gradual_overuse", "unclear"]

SUPPORTED_REHAB_ZONES = frozenset(
    {"shoulder", "knee", "ankle_foot", "wrist_hand", "lumbar", "elbow"}
)
ALL_REHAB_ZONES = frozenset(
    {
        "cervical",
        "shoulder",
        "elbow",
        "wrist_hand",
        "thoracic",
        "lumbar",
        "hip",
        "knee",
        "ankle_foot",
    }
)
ZONE_LABELS = {
    "cervical": "cervical",
    "shoulder": "hombro",
    "elbow": "codo",
    "wrist_hand": "muneca/mano",
    "thoracic": "toracica/dorsal",
    "lumbar": "lumbar",
    "hip": "cadera",
    "knee": "rodilla",
    "ankle_foot": "tobillo/pie",
}

TRIAGE_QUESTIONS = [
    "Zona y lateralidad.",
    "Inicio: golpe/subito o sobrecarga/gradual, y desde cuando.",
    "Dolor 0-10 en reposo y al mover.",
    "Red flags: hinchazon importante, deformidad, bloqueo/inestabilidad, hormigueo/entumecimiento, imposibilidad de mover o apoyar, fiebre, dolor en pecho.",
]


def _exercise(
    exercise_id: str,
    display_name: str,
    sets: int,
    reps: str,
    cue: str,
    contraindication_tags: tuple[str, ...] = (),
    bands: tuple[RehabBand, ...] = ("acute_gentle", "return_to_load", "rehab_only"),
) -> dict[str, Any]:
    return {
        "exercise_id": exercise_id,
        "display_name": display_name,
        "sets": sets,
        "reps": reps,
        "cue": cue,
        "contraindication_tags": list(contraindication_tags),
        "bands": list(bands),
    }


REHAB_LIBRARY: dict[str, dict[RehabBand, list[dict[str, Any]]]] = {
    "shoulder": {
        "acute_gentle": [
            {
                "name": "Sesion A - control escapular",
                "exercises": [
                    _exercise(
                        "ex_external_rot_band",
                        "Rotacion externa con banda a carga baja",
                        3,
                        "10-12",
                        "Codo pegado al costado y rango sin pinzamiento.",
                        ("shoulder_external_rotation_load",),
                    ),
                    _exercise(
                        "ex_band_pull_apart",
                        "Pull-apart con banda",
                        3,
                        "12-15",
                        "Escapulas abajo y sin elevar hombros.",
                    ),
                    _exercise(
                        "ex_row_machine",
                        "Remo en maquina con apoyo",
                        3,
                        "10-12",
                        "Tiron al pecho y hombro relajado.",
                    ),
                    _exercise(
                        "ex_lateral_raise_low",
                        "Elevacion lateral en rango medio-bajo",
                        2,
                        "12-15",
                        "Sube solo hasta el rango tolerable.",
                        ("shoulder_end_range_abduction",),
                    ),
                ],
            }
        ],
        "return_to_load": [
            {
                "name": "Sesion A - control y traccion",
                "exercises": [
                    _exercise("ex_external_rot_band", "Rotacion externa con banda", 3, "10-12", "Movimiento lento y limpio."),
                    _exercise("ex_row_machine", "Remo en maquina con apoyo", 3, "10-12", "Sin tirar con el trapecio."),
                    _exercise("ex_db_neutral_press", "Press con mancuernas agarre neutro", 3, "8-10", "Carga comoda y rango sin pinchazo."),
                    _exercise("ex_lateral_raise_low", "Elevacion lateral rango medio", 2, "12-15", "Evita compensar con cuello."),
                ],
            },
            {
                "name": "Sesion B - empuje tolerable",
                "exercises": [
                    _exercise("ex_band_pull_apart", "Pull-apart con banda", 3, "12-15", "Control escapular continuo."),
                    _exercise("ex_row_cable", "Remo en polea sentado", 3, "10-12", "Torso estable."),
                    _exercise("ex_landmine_press", "Press landmine", 3, "8-10", "Trayectoria comoda en plano escapular."),
                    _exercise("ex_rear_delt", "Hombro posterior en cable o maquina", 2, "12-15", "Sin encoger hombros."),
                ],
            },
        ],
        "rehab_only": [
            {
                "name": "Sesion A - readaptacion conservadora",
                "exercises": [
                    _exercise("ex_external_rot_band", "Rotacion externa con banda a carga baja", 3, "10-12", "Rango corto y comodo."),
                    _exercise("ex_band_pull_apart", "Pull-apart con banda", 3, "12-15", "Escapulas controladas."),
                    _exercise("ex_row_machine", "Remo en maquina con apoyo", 3, "10-12", "Sin dolor punzante."),
                ],
            }
        ],
    },
    "knee": {
        "acute_gentle": [
            {
                "name": "Sesion A - control de rodilla",
                "exercises": [
                    _exercise("ex_quad_iso", "Isometrico de cuadriceps", 3, "20-30 s", "Empuje suave y sin dolor agudo."),
                    _exercise("ex_leg_ext", "Extension de cuadriceps rango corto", 3, "12-15", "No fuerces el ultimo tramo."),
                    _exercise("ex_step_up", "Step-up bajo controlado", 3, "8-10", "Rodilla alineada con el pie."),
                    _exercise("ex_calf", "Elevacion de gemelos", 3, "12-15", "Sube y baja con control."),
                ],
            }
        ],
        "return_to_load": [
            {
                "name": "Sesion A - fuerza tolerable",
                "exercises": [
                    _exercise("ex_quad_iso", "Isometrico de cuadriceps", 3, "20-30 s", "Mantener buena activacion."),
                    _exercise("ex_leg_press", "Prensa de piernas rango tolerado", 3, "10-12", "No cierres demasiado el angulo."),
                    _exercise("ex_step_up", "Step-up controlado", 3, "8-10", "Baja lento y sin valgo."),
                    _exercise("ex_calf", "Elevacion de gemelos", 3, "12-15", "Apoyo estable."),
                ],
            },
            {
                "name": "Sesion B - progresion corta",
                "exercises": [
                    _exercise("ex_leg_ext", "Extension de cuadriceps", 3, "12-15", "Rango comodo y progresivo."),
                    _exercise("ex_leg_curl", "Curl femoral", 3, "10-12", "Movimiento sin tiron."),
                    _exercise("ex_squat_box", "Sentadilla a cajon", 3, "8-10", "Solo hasta rango tolerable."),
                    _exercise("ex_calf", "Elevacion de gemelos", 3, "12-15", "Pausa breve arriba."),
                ],
            },
        ],
        "rehab_only": [
            {
                "name": "Sesion A - readaptacion conservadora",
                "exercises": [
                    _exercise("ex_quad_iso", "Isometrico de cuadriceps", 3, "20-30 s", "Mantener dolor tolerable."),
                    _exercise("ex_leg_ext", "Extension de cuadriceps rango corto", 3, "12-15", "No forzar molestias agudas."),
                    _exercise("ex_step_up", "Step-up muy bajo", 2, "8-10", "Control excentrico."),
                ],
            }
        ],
    },
    "ankle_foot": {
        "acute_gentle": [
            {
                "name": "Sesion A - movilidad y carga suave",
                "exercises": [
                    _exercise("ex_ankle_pumps", "Bombeo de tobillo", 3, "15-20", "Rango completo sin rebotes."),
                    _exercise("ex_calf", "Elevacion de gemelos rango tolerado", 3, "12-15", "Busca apoyo estable."),
                    _exercise("ex_step_up", "Step-up muy bajo", 2, "8-10", "Sin balanceos laterales."),
                    _exercise("ex_leg_press", "Prensa ligera", 2, "12-15", "Empuje simetrico y comodo."),
                ],
            }
        ],
        "return_to_load": [
            {
                "name": "Sesion A - control de apoyo",
                "exercises": [
                    _exercise("ex_ankle_pumps", "Bombeo de tobillo", 3, "15-20", "Calienta antes de cargar."),
                    _exercise("ex_calf", "Elevacion de gemelos", 3, "12-15", "Pausa un segundo arriba."),
                    _exercise("ex_step_up", "Step-up controlado", 3, "8-10", "Rodilla y pie alineados."),
                    _exercise("ex_leg_press", "Prensa de piernas", 3, "10-12", "Carga baja-moderada."),
                ],
            },
            {
                "name": "Sesion B - tolerancia de pierna",
                "exercises": [
                    _exercise("ex_calf", "Elevacion de gemelos", 3, "12-15", "Mantener ritmo constante."),
                    _exercise("ex_leg_curl", "Curl femoral", 3, "10-12", "Sin compensar con cadera."),
                    _exercise("ex_squat_box", "Sentadilla a cajon", 3, "8-10", "Rango corto al principio."),
                    _exercise("ex_step_up", "Step-up bajo", 3, "8-10", "Controla la bajada."),
                ],
            },
        ],
        "rehab_only": [
            {
                "name": "Sesion A - readaptacion conservadora",
                "exercises": [
                    _exercise("ex_ankle_pumps", "Bombeo de tobillo", 3, "15-20", "Movimiento suave."),
                    _exercise("ex_calf", "Elevacion de gemelos rango corto", 3, "12-15", "Carga ligera."),
                    _exercise("ex_step_up", "Step-up muy bajo", 2, "8-10", "Sin perder estabilidad."),
                ],
            }
        ],
    },
    "wrist_hand": {
        "acute_gentle": [
            {
                "name": "Sesion A - agarre neutro",
                "exercises": [
                    _exercise("ex_row_machine", "Remo en maquina agarre neutro", 3, "10-12", "Muneca neutra todo el recorrido."),
                    _exercise("ex_tricep_pushdown", "Triceps en polea con agarre comodo", 3, "12-15", "Evita hiperextender la muneca."),
                    _exercise("ex_band_pull_apart", "Pull-apart con banda", 3, "12-15", "Tension suave y sin doblar muneca."),
                    _exercise("ex_plank", "Plancha sobre antebrazos", 3, "20-30 s", "Sin cargar la palma."),
                ],
            }
        ],
        "return_to_load": [
            {
                "name": "Sesion A - carga estable",
                "exercises": [
                    _exercise("ex_row_machine", "Remo en maquina agarre neutro", 3, "10-12", "Torso estable y agarre comodo."),
                    _exercise("ex_tricep_pushdown", "Triceps en polea", 3, "12-15", "Sin extension brusca."),
                    _exercise("ex_curl_standing", "Curl de biceps con agarre neutro", 3, "10-12", "Muneca recta."),
                    _exercise("ex_band_pull_apart", "Pull-apart con banda", 2, "12-15", "Sin elevar hombros."),
                ],
            },
            {
                "name": "Sesion B - tolerancia progresiva",
                "exercises": [
                    _exercise("ex_row_cable", "Remo en polea", 3, "10-12", "Agarre comodo."),
                    _exercise("ex_tricep_pushdown", "Triceps en polea", 3, "12-15", "Carga baja-moderada."),
                    _exercise("ex_curl_standing", "Curl de biceps", 3, "10-12", "Sin doblar la muneca."),
                    _exercise("ex_plank", "Plancha sobre antebrazos", 3, "25-35 s", "Cuerpo alineado."),
                ],
            },
        ],
        "rehab_only": [
            {
                "name": "Sesion A - readaptacion conservadora",
                "exercises": [
                    _exercise("ex_row_machine", "Remo en maquina agarre neutro", 3, "10-12", "Agarre relajado."),
                    _exercise("ex_band_pull_apart", "Pull-apart con banda", 3, "12-15", "Sin molestar la muneca."),
                    _exercise("ex_plank", "Plancha sobre antebrazos", 2, "20-30 s", "Evitar apoyo en extension."),
                ],
            }
        ],
    },
    "lumbar": {
        "acute_gentle": [
            {
                "name": "Sesion A - control lumbopelvico",
                "exercises": [
                    _exercise("ex_cat_cow", "Gato-vaca suave", 2, "10", "Movimiento corto y lento."),
                    _exercise("ex_dead_bug", "Dead bug", 3, "8-10", "Lumbar estable en el suelo."),
                    _exercise("ex_plank", "Plancha", 3, "20-30 s", "No hundir la cadera."),
                    _exercise("ex_row_machine", "Remo en maquina con apoyo", 3, "10-12", "Tronco estable."),
                ],
            }
        ],
        "return_to_load": [
            {
                "name": "Sesion A - estabilidad",
                "exercises": [
                    _exercise("ex_dead_bug", "Dead bug", 3, "8-10", "Respira y manten control."),
                    _exercise("ex_plank", "Plancha", 3, "25-35 s", "Sin dolor irradiado."),
                    _exercise("ex_row_machine", "Remo en maquina con apoyo", 3, "10-12", "Evita balanceos."),
                    _exercise("ex_leg_press", "Prensa de piernas", 3, "10-12", "Carga tolerable y espalda neutra."),
                ],
            },
            {
                "name": "Sesion B - vuelta gradual",
                "exercises": [
                    _exercise("ex_cat_cow", "Gato-vaca suave", 2, "10", "Movilidad sin forzar."),
                    _exercise("ex_rdl_light", "Bisagra de cadera ligera", 3, "8-10", "Cadera atras y espalda neutra."),
                    _exercise("ex_row_machine", "Remo en maquina con apoyo", 3, "10-12", "Sin compensar con lumbar."),
                    _exercise("ex_step_up", "Step-up bajo", 3, "8-10", "Controlando la pelvis."),
                ],
            },
        ],
        "rehab_only": [
            {
                "name": "Sesion A - readaptacion conservadora",
                "exercises": [
                    _exercise("ex_cat_cow", "Gato-vaca suave", 2, "10", "Solo rango comodo."),
                    _exercise("ex_dead_bug", "Dead bug", 3, "8-10", "Control lumbopelvico."),
                    _exercise("ex_plank", "Plancha", 2, "20-30 s", "Sin aumentar sintomas al terminar."),
                ],
            }
        ],
    },
    "elbow": {
        "acute_gentle": [
            {
                "name": "Sesion A - codo tolerable",
                "exercises": [
                    _exercise("ex_row_machine", "Remo en maquina", 3, "10-12", "Agarre comodo y sin tiron."),
                    _exercise("ex_tricep_pushdown", "Triceps en polea ligera", 3, "12-15", "Codo pegado al costado."),
                    _exercise("ex_curl_standing", "Curl de biceps ligero", 3, "10-12", "Sin balanceo."),
                    _exercise("ex_band_pull_apart", "Pull-apart con banda", 2, "12-15", "Hombros bajos."),
                ],
            }
        ],
        "return_to_load": [
            {
                "name": "Sesion A - flexion y extension",
                "exercises": [
                    _exercise("ex_row_machine", "Remo en maquina", 3, "10-12", "Sin molestias punzantes."),
                    _exercise("ex_tricep_pushdown", "Triceps en polea", 3, "12-15", "Carga progresiva."),
                    _exercise("ex_curl_standing", "Curl de biceps", 3, "10-12", "Ritmo controlado."),
                    _exercise("ex_band_pull_apart", "Pull-apart con banda", 2, "12-15", "Control escapular."),
                ],
            },
            {
                "name": "Sesion B - traccion estable",
                "exercises": [
                    _exercise("ex_row_cable", "Remo en polea", 3, "10-12", "Agarre comodo."),
                    _exercise("ex_lat_pulldown", "Jalon al pecho", 3, "10-12", "Sin compensar con cuello."),
                    _exercise("ex_tricep_pushdown", "Triceps en polea", 3, "12-15", "Extension limpia."),
                    _exercise("ex_curl_standing", "Curl de biceps", 3, "10-12", "Sin dolor de rebote."),
                ],
            },
        ],
        "rehab_only": [
            {
                "name": "Sesion A - readaptacion conservadora",
                "exercises": [
                    _exercise("ex_row_machine", "Remo en maquina", 3, "10-12", "Agarre tolerable."),
                    _exercise("ex_tricep_pushdown", "Triceps en polea ligera", 3, "12-15", "Sin forzar el codo."),
                    _exercise("ex_band_pull_apart", "Pull-apart con banda", 2, "12-15", "Carga baja."),
                ],
            }
        ],
    },
}


def infer_onset_type_from_saved_phase(phase: Optional[str]) -> Optional[OnsetType]:
    if phase == "acute":
        return "sudden_recent"
    if phase in {"trainable_low_pain", "return_to_training", "rehab_only"}:
        return "gradual_overuse"
    return None


def determine_rehab_band(
    onset_type: Optional[OnsetType],
    pain_at_rest: Optional[int],
    pain_with_movement: Optional[int],
    saved_phase: Optional[str],
) -> RehabBand:
    if saved_phase == "rehab_only":
        return "rehab_only"
    if onset_type == "sudden_recent":
        return "acute_gentle"
    if pain_at_rest is not None and pain_at_rest > 3:
        return "acute_gentle"
    if pain_with_movement is not None and pain_with_movement >= 4:
        return "acute_gentle"
    return "return_to_load"


def _missing_inputs_result(missing_fields: list[str]) -> dict[str, Any]:
    return {
        "error": "missing_inputs",
        "kind": "rehab",
        "missing_fields": missing_fields,
        "triage_questions": TRIAGE_QUESTIONS,
        "coach_instructions_es": (
            "Todavia faltan datos para sugerir readaptacion general. "
            "Pide una lista numerada breve basada en estas cuatro preguntas de triage. "
            "Si ya conoces algun dato por el perfil o la conversacion, pregunta solo lo que falte, "
            "pero manteniendo el marco de cuatro puntos. No des ejercicios todavia."
        ),
    }


def _unsupported_zone_result(body_zone: str) -> dict[str, Any]:
    zone_label = ZONE_LABELS.get(body_zone, body_zone)
    supported = sorted(SUPPORTED_REHAB_ZONES)
    supported_es = ", ".join(ZONE_LABELS.get(z, z) for z in supported)
    return {
        "error": "unsupported_zone",
        "kind": "rehab",
        "body_zone": body_zone,
        "supported_zones_hint_es": supported_es,
        "coach_instructions_es": (
            f"Aun no hay un bloque curado de readaptacion general para {zone_label}. "
            "No muestres tarjeta de ejercicios. Da una orientacion conservadora breve: baja carga, "
            "evita gestos agresivos, vigila la respuesta al dia siguiente y recomienda valoracion "
            "profesional si persiste, empeora o hay red flags. "
            f"Puedes mencionar que en la app si hay bloque curado para: {supported_es}."
        ),
    }


def _safety_stop_result(reason: str, body_zone: Optional[str] = None) -> dict[str, Any]:
    result = {
        "error": "safety_stop",
        "kind": "rehab",
        "reason": reason,
        "safety_message": SAFETY_DEFER_MESSAGE_ES,
        "medical_disclaimer": MEDICAL_DISCLAIMER_ES,
        "coach_instructions_es": (
            "No generes tarjeta ni ejercicios. Responde en 3-5 frases: explica que, por seguridad, "
            "no toca pautar carga general ahora; resume el safety_message y recuerda el aviso medico "
            "sin alarmismo. Prioriza valoracion profesional."
        ),
    }
    if body_zone:
        result["body_zone"] = body_zone
    return result


def _make_plain_days(structured_days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    plain_days: list[dict[str, Any]] = []
    for day in structured_days:
        plain_days.append(
            {
                "name": day["name"],
                "exercises": [
                    f'{exercise["name"]}: {exercise["sets"]}x{exercise["reps"]}'
                    for exercise in day["exercises"]
                ],
            }
        )
    return plain_days


def _build_focus_note(body_zone: str, band: RehabBand) -> str:
    zone_label = ZONE_LABELS.get(body_zone, body_zone)
    if band == "return_to_load":
        return (
            f"Readaptacion general orientativa para {zone_label}: carga baja-moderada, "
            "tecnica limpia y progresion gradual. Mantener dolor tolerable <=3/10 durante "
            "el trabajo y sin empeorar claramente al dia siguiente. Frecuencia orientativa: "
            "2-4 sesiones ligeras por semana."
        )
    return (
        f"Bloque conservador para {zone_label}: objetivo de tolerancia, control y vuelta gradual "
        "a la carga. Mantener dolor tolerable <=3/10; si sube en la sesion o al dia siguiente, "
        "reducir volumen o parar. Frecuencia orientativa: 2-4 sesiones ligeras por semana."
    )


def build_rehab_suggestion(
    *,
    body_zone: Optional[str],
    onset_type: Optional[OnsetType],
    pain_at_rest: Optional[int],
    pain_with_movement: Optional[int],
    red_flags: Optional[list[str]],
    laterality: Optional[str] = None,
    notes: Optional[str] = None,
    saved_injury: Optional[InjuryProfile] = None,
) -> dict[str, Any]:
    zone = body_zone or (saved_injury.body_zone if saved_injury else None)
    if not zone:
        return _missing_inputs_result(["body_zone"])
    if zone not in ALL_REHAB_ZONES:
        return _missing_inputs_result(["body_zone"])
    if zone not in SUPPORTED_REHAB_ZONES:
        return _unsupported_zone_result(zone)

    saved_phase = saved_injury.phase if saved_injury else None
    effective_onset = onset_type or infer_onset_type_from_saved_phase(saved_phase)
    effective_pain_rest = pain_at_rest if pain_at_rest is not None else (
        saved_injury.pain_at_rest if saved_injury else None
    )
    effective_pain_move = pain_with_movement if pain_with_movement is not None else (
        saved_injury.pain_with_movement if saved_injury else None
    )

    missing_fields: list[str] = []
    if effective_onset is None and saved_phase != "rehab_only":
        missing_fields.append("onset_type")
    if effective_pain_rest is None:
        missing_fields.append("pain_at_rest")
    if effective_pain_move is None:
        missing_fields.append("pain_with_movement")
    if red_flags is None and not saved_injury:
        missing_fields.append("red_flags")
    if missing_fields:
        return _missing_inputs_result(missing_fields)

    flag_list: list[str] = [] if red_flags is None else list(red_flags)
    explicit_red_flags = [str(flag).strip() for flag in flag_list if str(flag).strip()]
    red_flags_present = bool(explicit_red_flags) or bool(
        saved_injury.red_flags_reported if saved_injury else False
    )

    if red_flags_present:
        return _safety_stop_result("red_flags", zone)
    if effective_pain_rest is not None and effective_pain_rest >= 7:
        return _safety_stop_result("pain_at_rest_high", zone)
    if effective_pain_move is not None and effective_pain_move >= 8:
        return _safety_stop_result("pain_with_movement_high", zone)

    band = determine_rehab_band(
        effective_onset,
        effective_pain_rest,
        effective_pain_move,
        saved_phase,
    )
    session_defs = REHAB_LIBRARY[zone][band]
    structured_days: list[dict[str, Any]] = []
    catalog_trace: list[dict[str, Any]] = []
    for session in session_defs:
        exercises: list[dict[str, Any]] = []
        for item in session["exercises"]:
            exercises.append(
                {
                    "name": item["display_name"],
                    "sets": item["sets"],
                    "reps": item["reps"],
                }
            )
            catalog_trace.append(
                {
                    "session": session["name"],
                    "exercise_id": item["exercise_id"],
                    "display_name": item["display_name"],
                    "cue": item["cue"],
                    "contraindication_tags": item["contraindication_tags"],
                    "bands": item["bands"],
                }
            )
        structured_days.append({"name": session["name"], "exercises": exercises})

    focus_note = _build_focus_note(zone, band)
    if notes:
        focus_note = f"{focus_note} Contexto adicional: {notes.strip()[:180]}."

    return {
        "kind": "rehab",
        "catalog_version": "rehab_v1",
        "name": f"Readaptacion general: {ZONE_LABELS.get(zone, zone).capitalize()}",
        "split": "readaptacion",
        "focus_note": focus_note,
        "disclaimer": MEDICAL_DISCLAIMER_ES,
        "days": _make_plain_days(structured_days),
        "structured_days": structured_days,
        "body_zone": zone,
        "laterality": laterality or (saved_injury.laterality if saved_injury else None),
        "mode": band,
        "catalog_trace": catalog_trace,
        "coach_instructions_es": (
            "Responde en 4-6 frases breves. No enumeres ejercicios: la tarjeta ya los muestra. "
            "Aclara que es orientacion general conservadora, resume el objetivo del bloque, el criterio "
            "de dolor tolerable <=3/10, frecuencia orientativa 2-4 sesiones ligeras por semana, "
            "y que debe reducir o parar si empeora durante la sesion o al dia siguiente. "
            "Recuerda consultar si no mejora o aparecen red flags."
        ),
    }
