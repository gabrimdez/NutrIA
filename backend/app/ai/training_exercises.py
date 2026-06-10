"""Catálogo de ejercicios con tags de movimiento para filtrado determinista."""

from __future__ import annotations

from typing import Any

# Cada ejercicio: tags de patrón / riesgo usados en exclusión (subset taxonomía producto)
EXERCISES: dict[str, dict[str, Any]] = {
    # Empuje horizontal
    "ex_bench_barbell": {
        "display_name": "Press de banca con barra",
        "primary_patterns": ["horizontal_press"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_bench_machine": {
        "display_name": "Press plano en máquina / peck deck",
        "primary_patterns": ["horizontal_press", "machine_supported"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_cable_fly_h": {
        "display_name": "Cruce de poleas horizontal",
        "primary_patterns": ["horizontal_press"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_incline_db": {
        "display_name": "Press inclinado con mancuernas o máquina",
        "primary_patterns": ["horizontal_press"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_incline_cable": {
        "display_name": "Cruce de poleas ascendente / inclinado",
        "primary_patterns": ["horizontal_press"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_flat_db": {
        "display_name": "Press plano con mancuernas o multipower",
        "primary_patterns": ["horizontal_press"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    # Empuje vertical / hombro
    "ex_ohp": {
        "display_name": "Press militar con barra o mancuernas",
        "primary_patterns": ["overhead_press", "shoulder_end_range_abduction"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_landmine_press": {
        "display_name": "Press landmine / landmine unilateral",
        "primary_patterns": ["horizontal_press", "scapular_control"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_db_neutral_press": {
        "display_name": "Press con mancuernas agarre neutro (escápula estable)",
        "primary_patterns": ["horizontal_press", "machine_supported"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_lateral_raise": {
        "display_name": "Elevaciones laterales (mancuerna/polea)",
        "primary_patterns": ["shoulder_end_range_abduction"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_lateral_raise_low": {
        "display_name": "Elevaciones laterales rango medio-bajo",
        "primary_patterns": ["scapular_control"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_rear_delt": {
        "display_name": "Hombro posterior en polea o máquina",
        "primary_patterns": ["horizontal_pull", "scapular_control"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    # Tracción
    "ex_lat_pulldown": {
        "display_name": "Jalón al pecho en máquina",
        "primary_patterns": ["vertical_pull", "machine_supported"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_pullup": {
        "display_name": "Dominadas",
        "primary_patterns": ["vertical_pull", "shoulder_external_rotation_load"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_row_machine": {
        "display_name": "Remo en máquina o apoyo en banco",
        "primary_patterns": ["horizontal_pull", "machine_supported", "scapular_control"],
        "body_regions_loaded": ["shoulder", "lumbar"],
        "contraindication_tags": [],
    },
    "ex_row_barbell": {
        "display_name": "Remo con barra o mancuerna",
        "primary_patterns": ["horizontal_pull", "hip_hinge"],
        "body_regions_loaded": ["lumbar", "shoulder"],
        "contraindication_tags": [],
    },
    "ex_row_cable": {
        "display_name": "Remo en polea sentado",
        "primary_patterns": ["horizontal_pull", "machine_supported"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    # Pierna
    "ex_squat": {
        "display_name": "Sentadilla / hack squat / prensa controlada",
        "primary_patterns": ["deep_knee_flexion", "axial_loading"],
        "body_regions_loaded": ["knee", "hip", "lumbar"],
        "contraindication_tags": [],
    },
    "ex_squat_box": {
        "display_name": "Sentadilla a cajón / rango reducido",
        "primary_patterns": ["deep_knee_flexion", "machine_supported"],
        "body_regions_loaded": ["knee", "hip"],
        "contraindication_tags": [],
    },
    "ex_leg_press": {
        "display_name": "Prensa de piernas (rango tolerado)",
        "primary_patterns": ["deep_knee_flexion", "machine_supported"],
        "body_regions_loaded": ["knee"],
        "contraindication_tags": [],
    },
    "ex_rdl": {
        "display_name": "Peso muerto rumano o piernas rígidas",
        "primary_patterns": ["hip_hinge", "axial_loading"],
        "body_regions_loaded": ["lumbar", "hip"],
        "contraindication_tags": [],
    },
    "ex_rdl_light": {
        "display_name": "Bisagra de cadera ligera / mancuernas",
        "primary_patterns": ["hip_hinge"],
        "body_regions_loaded": ["lumbar", "hip"],
        "contraindication_tags": [],
    },
    "ex_leg_ext": {
        "display_name": "Extensión de cuádriceps en máquina",
        "primary_patterns": ["machine_supported"],
        "body_regions_loaded": ["knee"],
        "contraindication_tags": [],
    },
    "ex_leg_curl": {
        "display_name": "Curl femoral tumbado o sentado",
        "primary_patterns": ["machine_supported"],
        "body_regions_loaded": ["knee"],
        "contraindication_tags": [],
    },
    "ex_calf": {
        "display_name": "Elevación de gemelos",
        "primary_patterns": ["machine_supported"],
        "body_regions_loaded": ["ankle_foot", "knee"],
        "contraindication_tags": [],
    },
    "ex_step_up": {
        "display_name": "Step-up bajo controlado",
        "primary_patterns": ["single_leg_knee_dominant", "machine_supported"],
        "body_regions_loaded": ["knee", "hip", "ankle_foot"],
        "contraindication_tags": [],
    },
    # Brazos
    "ex_curl_standing": {
        "display_name": "Curl de bíceps mancuerna/polea",
        "primary_patterns": ["elbow_flexion_load"],
        "body_regions_loaded": ["elbow"],
        "contraindication_tags": [],
    },
    "ex_curl_preacher": {
        "display_name": "Curl predicador / banco Scott",
        "primary_patterns": ["elbow_flexion_load"],
        "body_regions_loaded": ["elbow"],
        "contraindication_tags": [],
    },
    "ex_tricep_pushdown": {
        "display_name": "Extensión de tríceps en polea alta",
        "primary_patterns": ["elbow_extension_load"],
        "body_regions_loaded": ["elbow"],
        "contraindication_tags": [],
    },
    "ex_tricep_overhead": {
        "display_name": "Extensión de tríceps por encima de la cabeza / press francés",
        "primary_patterns": ["overhead_press", "elbow_extension_load"],
        "body_regions_loaded": ["elbow", "shoulder"],
        "contraindication_tags": [],
    },
    "ex_tricep_dip": {
        "display_name": "Fondos de tríceps",
        "primary_patterns": ["horizontal_press", "elbow_extension_load"],
        "body_regions_loaded": ["shoulder", "elbow"],
        "contraindication_tags": [],
    },
    # Core
    "ex_crunch_machine": {
        "display_name": "Crunch en máquina o polea",
        "primary_patterns": ["loaded_spinal_flexion"],
        "body_regions_loaded": ["lumbar"],
        "contraindication_tags": [],
    },
    "ex_plank": {
        "display_name": "Plancha (isométrico)",
        "primary_patterns": ["core_bracing", "anti_rotation", "isometric"],
        "body_regions_loaded": ["lumbar"],
        "contraindication_tags": [],
    },
    # Rehab genérico conservador
    "ex_band_pull_apart": {
        "display_name": "Pull-apart con banda (control escapular)",
        "primary_patterns": ["scapular_control", "isometric", "tempo_controlled"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_external_rot_band": {
        "display_name": "Rotación externa hombro con banda (carga baja)",
        "primary_patterns": ["tempo_controlled", "isometric"],
        "body_regions_loaded": ["shoulder"],
        "contraindication_tags": [],
    },
    "ex_quad_iso": {
        "display_name": "Isométrico de cuádriceps (extensión rodilla)",
        "primary_patterns": ["isometric", "tempo_controlled"],
        "body_regions_loaded": ["knee"],
        "contraindication_tags": [],
    },
    "ex_ankle_pumps": {
        "display_name": "Bombeo tobillo / movilidad sin carga",
        "primary_patterns": ["tempo_controlled"],
        "body_regions_loaded": ["ankle_foot"],
        "contraindication_tags": [],
    },
    "ex_cat_cow": {
        "display_name": "Gato-vaca / movilidad lumbar suave",
        "primary_patterns": ["tempo_controlled"],
        "body_regions_loaded": ["lumbar"],
        "contraindication_tags": [],
    },
    "ex_dead_bug": {
        "display_name": "Dead bug / control lumbopélvico",
        "primary_patterns": ["core_bracing", "anti_rotation"],
        "body_regions_loaded": ["lumbar"],
        "contraindication_tags": [],
    },
}


def exercise_all_tags(ex_id: str) -> set[str]:
    ex = EXERCISES.get(ex_id)
    if not ex:
        return set()
    tags: set[str] = set(ex.get("primary_patterns") or [])
    tags.update(ex.get("contraindication_tags") or [])
    return tags


def exercise_blocked(ex_id: str, excluded: set[str]) -> bool:
    if not excluded:
        return False
    return bool(exercise_all_tags(ex_id) & excluded)


MEDICAL_DISCLAIMER_ES = (
    "Esta función no sustituye una valoración médica o fisioterapéutica. "
    "Si el dolor es intenso, empeora, hay inflamación importante, inestabilidad, "
    "bloqueo articular, hormigueo, pérdida de fuerza o dolor irradiado, "
    "consulta con un profesional sanitario antes de entrenar."
)

SAFETY_DEFER_MESSAGE_ES = (
    "Por los datos indicados (dolor elevado o señales de alerta), no generamos una rutina "
    "de carga para esa zona. Prioriza valoración profesional y reposo relativo según te indiquen."
)
