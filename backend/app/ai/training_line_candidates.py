"""Mapeo de líneas de plantilla (texto antes de sets/reps) a lista ordenada de exercise_id."""

from __future__ import annotations


def resolve_line_candidates(name: str) -> list[str]:
    """
    Devuelve IDs del catálogo en orden de preferencia para la descripción de plantilla.
    El matching es por subcadenas clave (determinista).
    """
    n = (name or "").lower()

    # Empuje horizontal / pecho
    if "press de banca" in n or ("peck deck" in n and "horizontal" in n):
        return ["ex_bench_machine", "ex_bench_barbell", "ex_cable_fly_h"]
    if "press plano en máquina" in n and "inclinado" not in n:
        return ["ex_bench_machine", "ex_bench_barbell", "ex_cable_fly_h"]
    if "press inclinado" in n or "cruce de poleas ascendente" in n or "cruces ascendentes" in n:
        return ["ex_incline_db", "ex_incline_cable", "ex_incline_db"]
    if "press plano con mancuernas" in n or "multipower" in n and "horizontal" in n:
        return ["ex_flat_db", "ex_bench_machine", "ex_incline_db"]
    if "press inclinado con mancuernas" in n:
        return ["ex_incline_db", "ex_incline_cable"]

    # Press militar / hombro
    if "press militar" in n:
        return ["ex_ohp", "ex_landmine_press", "ex_db_neutral_press"]
    if "elevaciones frontales" in n and "militar" in n:
        return ["ex_ohp", "ex_landmine_press"]

    # Elevaciones laterales
    if "elevaciones laterales" in n:
        if "polea" in n or "máquina" in n or "mancuerna" in n:
            return ["ex_lateral_raise_low", "ex_lateral_raise", "ex_rear_delt"]
        return ["ex_lateral_raise_low", "ex_lateral_raise"]

    # Tríceps
    if "tríceps" in n or "triceps" in n:
        if "encima de la cabeza" in n or "por encima" in n or "press francés" in n:
            return ["ex_tricep_pushdown", "ex_tricep_overhead", "ex_tricep_pushdown"]
        if "fondos" in n:
            return ["ex_tricep_pushdown", "ex_tricep_dip"]
        return ["ex_tricep_pushdown", "ex_tricep_overhead"]

    # Tracción
    if "jalón" in n or "dominadas" in n:
        return ["ex_lat_pulldown", "ex_row_machine", "ex_pullup"]
    if "remo" in n:
        if "cerrado" in n or "abierto" in n or "máquina" in n or "mancuerna" in n:
            return ["ex_row_machine", "ex_row_cable", "ex_row_barbell"]
        return ["ex_row_cable", "ex_row_machine", "ex_row_barbell"]

    # Pierna
    if "sentadilla" in n or "hack squat" in n or "prensa" in n:
        return ["ex_leg_press", "ex_squat_box", "ex_squat"]
    if "peso muerto rumano" in n or "piernas rígidas" in n:
        return ["ex_rdl_light", "ex_rdl", "ex_leg_curl"]
    if "extensión de cuádriceps" in n:
        return ["ex_leg_ext"]
    if "curl femoral" in n:
        return ["ex_leg_curl"]
    if "gemelos" in n:
        return ["ex_calf"]

    # Brazos aislados
    if "curl de bíceps" in n or "bayesian" in n:
        return ["ex_curl_standing", "ex_curl_preacher"]
    if "curl predicador" in n or "spider" in n or "scott" in n:
        return ["ex_curl_preacher", "ex_curl_standing"]

    # Core
    if "crunch" in n or "plancha" in n:
        if "plancha" in n:
            return ["ex_plank", "ex_dead_bug", "ex_crunch_machine"]
        return ["ex_plank", "ex_crunch_machine"]

    if "hombro posterior" in n:
        return ["ex_rear_delt", "ex_row_cable"]

    # Fallback conservador
    return ["ex_row_machine", "ex_leg_ext", "ex_plank"]


# Sustitutos genéricos por patrón si todos los candidatos fallan
FALLBACK_SAFE_POOL: list[str] = [
    "ex_row_machine",
    "ex_lat_pulldown",
    "ex_leg_ext",
    "ex_leg_curl",
    "ex_plank",
    "ex_band_pull_apart",
    "ex_landmine_press",
]
