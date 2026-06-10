"""Rules for ensuring evidence-based, non-absolute language in AI responses."""

ABSOLUTE_PHRASES_TO_AVOID = [
    "siempre debes",
    "nunca debes comer",
    "es obligatorio",
    "está demostrado que",
    "la ciencia dice que",
    "todos los expertos",
    "sin ninguna duda",
    "100% seguro",
    "garantizado",
]

PREFERRED_PHRASES = {
    "debes": "podrías considerar",
    "tienes que": "sería recomendable",
    "es obligatorio": "es aconsejable",
    "siempre": "en general",
    "nunca": "normalmente no se recomienda",
    "está demostrado": "la evidencia actual sugiere",
    "sin duda": "con alta probabilidad",
}

REQUIRED_DISCLAIMERS = {
    "supplement": "Los suplementos no sustituyen una alimentación equilibrada.",
    "extreme_deficit": "Déficits calóricos muy agresivos pueden ser contraproducentes. Consulta con un profesional.",
    "medical": "Esto no constituye consejo médico. Consulta con un profesional de la salud.",
}


def check_response_language(text: str) -> list[str]:
    warnings = []
    text_lower = text.lower()
    for phrase in ABSOLUTE_PHRASES_TO_AVOID:
        if phrase in text_lower:
            warnings.append(f"Lenguaje absoluto detectado: '{phrase}'")
    return warnings


def needs_disclaimer(text: str) -> list[str]:
    disclaimers = []
    text_lower = text.lower()
    if any(w in text_lower for w in ["suplemento", "creatina", "proteína en polvo", "whey"]):
        disclaimers.append(REQUIRED_DISCLAIMERS["supplement"])
    if any(w in text_lower for w in ["déficit agresivo", "muy pocas calorías", "vlcd"]):
        disclaimers.append(REQUIRED_DISCLAIMERS["extreme_deficit"])
    return disclaimers
