"""Rules for detecting and handling weight loss plateaus."""
from typing import List, Optional
from datetime import date, timedelta


MIN_DAYS_FOR_PLATEAU = 14
MIN_WEIGHT_LOGS_FOR_ANALYSIS = 4
MAX_CALORIE_REDUCTION_PERCENT = 0.10
MIN_CALORIES_FLOOR = 1200
MOVEMENT_INCREASE_STEPS = 2000


def analyze_plateau(
    weight_logs: List[dict],
    avg_daily_kcal: Optional[float],
    target_kcal: Optional[float],
    adherence_pct: Optional[float],
    days_logged: int,
    current_steps: Optional[int],
    goal_type: str,
) -> dict:
    if len(weight_logs) < MIN_WEIGHT_LOGS_FOR_ANALYSIS:
        return {
            "is_plateau": False,
            "weeks_stagnant": 0,
            "adherence_good": False,
            "data_sufficient": False,
            "recommendation": "Necesito más datos de peso para analizar tu progreso. Intenta pesarte al menos 2 veces por semana.",
            "suggested_action": "need_more_data",
            "new_target_kcal": None,
            "rationale": "Datos insuficientes para determinar estancamiento.",
        }
    
    sorted_logs = sorted(weight_logs, key=lambda x: x["date"])
    recent = sorted_logs[-MIN_WEIGHT_LOGS_FOR_ANALYSIS:]
    
    weights = [log["weight_kg"] for log in recent]
    weight_range = max(weights) - min(weights)
    
    first_date = recent[0]["date"]
    last_date = recent[-1]["date"]
    if isinstance(first_date, str):
        first_date = date.fromisoformat(first_date)
        last_date = date.fromisoformat(last_date)
    
    span_days = (last_date - first_date).days
    weeks_span = max(span_days / 7, 1)
    
    is_plateau = weight_range < 0.5 and span_days >= MIN_DAYS_FOR_PLATEAU
    
    adherence_good = (adherence_pct or 0) >= 80
    has_enough_logs = days_logged >= 5
    
    if not is_plateau:
        return {
            "is_plateau": False,
            "weeks_stagnant": 0,
            "adherence_good": adherence_good,
            "data_sufficient": True,
            "recommendation": "Tu peso sigue moviéndose. Sigue con el plan actual y ten paciencia.",
            "suggested_action": "continue",
            "new_target_kcal": None,
            "rationale": f"Variación de {weight_range:.1f} kg en {span_days} días.",
        }
    
    if not adherence_good or not has_enough_logs:
        return {
            "is_plateau": True,
            "weeks_stagnant": int(weeks_span),
            "adherence_good": adherence_good,
            "data_sufficient": has_enough_logs,
            "recommendation": (
                "Parece que hay un estancamiento, pero la adherencia al plan no es alta "
                "o faltan registros de comidas. Antes de hacer cambios, intenta seguir "
                "el plan actual durante al menos una semana completa registrando todas las comidas."
            ),
            "suggested_action": "improve_adherence",
            "new_target_kcal": None,
            "rationale": f"Adherencia: {adherence_pct or 0:.0f}%. Días registrados: {days_logged}/7.",
        }
    
    can_increase_movement = (current_steps or 0) < 10000
    
    if can_increase_movement:
        new_steps = (current_steps or 6000) + MOVEMENT_INCREASE_STEPS
        return {
            "is_plateau": True,
            "weeks_stagnant": int(weeks_span),
            "adherence_good": True,
            "data_sufficient": True,
            "recommendation": (
                f"Llevas ~{int(weeks_span)} semanas estancado con buena adherencia. "
                f"Antes de reducir calorías, intenta aumentar tu movimiento diario "
                f"a unos {new_steps} pasos/día."
            ),
            "suggested_action": "increase_movement",
            "new_target_kcal": None,
            "rationale": "Priorizar aumento de NEAT antes de reducir ingesta.",
        }
    
    if target_kcal:
        reduction = target_kcal * MAX_CALORIE_REDUCTION_PERCENT
        new_kcal = max(target_kcal - reduction, MIN_CALORIES_FLOOR)
        return {
            "is_plateau": True,
            "weeks_stagnant": int(weeks_span),
            "adherence_good": True,
            "data_sufficient": True,
            "recommendation": (
                f"Llevas ~{int(weeks_span)} semanas estancado con buena adherencia "
                f"y ya tienes un nivel de actividad alto. Podemos reducir las calorías "
                f"de forma conservadora a {new_kcal:.0f} kcal/día."
            ),
            "suggested_action": "reduce_calories",
            "new_target_kcal": new_kcal,
            "rationale": f"Reducción conservadora del {MAX_CALORIE_REDUCTION_PERCENT*100:.0f}%.",
        }
    
    return {
        "is_plateau": True,
        "weeks_stagnant": int(weeks_span),
        "adherence_good": True,
        "data_sufficient": True,
        "recommendation": "Parece que estás estancado. Consulta con el chat para revisar opciones.",
        "suggested_action": "consult",
        "new_target_kcal": None,
        "rationale": "No hay suficiente contexto para una recomendación automática.",
    }
