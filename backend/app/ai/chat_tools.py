"""Tool definitions for the AI chat assistant."""

CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_user_context",
            "description": (
                "Obtiene el perfil del usuario: datos corporales, preferencias alimentarias, lesiones activas "
                "y sport_profile multideporte (si el usuario lo guardó en ajustes)."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_targets",
            "description": "Obtiene los objetivos calóricos y de macros actuales del usuario.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_foods",
            "description": "Busca alimentos en la base de datos por nombre.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Nombre del alimento a buscar"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_progress_summary",
            "description": "Obtiene un resumen del progreso del usuario: peso, adherencia, calorías promedio.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_plateau",
            "description": "Analiza si el usuario está estancado y sugiere acciones.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_training_suggestion",
            "description": (
                "Genera una rutina de entrenamiento en gimnasio. La rutina ya viene "
                "adaptada en el servidor según lesiones/limitaciones guardadas en el perfil del usuario "
                "(exclusiones y readaptación conservadora cuando aplique). "
                "NO llames a esta herramienta hasta tener los dos datos obligatorios: "
                "available_days y focus. Si para ese número de días existen varias "
                "opciones de split, la herramienta te devolverá la lista; muéstralas "
                "al usuario y, tras su elección, vuelve a llamar con split_key."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "available_days": {
                        "type": "integer",
                        "description": "Días por semana disponibles para entrenar (2-6)",
                    },
                    "focus": {
                        "type": "string",
                        "enum": ["fuerza", "hipertrofia"],
                        "description": "Objetivo principal: fuerza o hipertrofia",
                    },
                    "split_key": {
                        "type": "string",
                        "description": (
                            "Identificador del split elegido por el usuario. "
                            "Solo es necesario cuando hay varias opciones para ese número de días."
                        ),
                    },
                },
                "required": ["available_days", "focus"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_rehab_suggestion",
            "description": (
                "USAR cuando el usuario pida ejercicios de rehabilitacion, readaptacion por lesion/molestia "
                "o que hacer para dolor en una zona (no para rutina de gimnasio completa: eso es create_training_suggestion). "
                "Devuelve un bloque conservador desde catalogo local (no inventa ejercicios fuera del catalogo). "
                "No diagnostica ni sustituye fisioterapia/medico. "
                "Antes de llamar: triage (zona body_zone en ingles, onset_type, pain_at_rest, pain_with_movement, red_flags []). "
                "Si el usuario tiene lesiones activas en perfil que coinciden, usa use_saved_injuries=true y rellena huecos por preguntas minimas. "
                "Zonas con catalogo en app: shoulder, knee, ankle_foot, wrist_hand, lumbar, elbow. "
                "Otras zonas (cervical, hip, thoracic) devuelven unsupported_zone: el modelo debe orientar sin lista de ejercicios."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "body_zone": {
                        "type": "string",
                        "enum": [
                            "cervical",
                            "shoulder",
                            "elbow",
                            "wrist_hand",
                            "thoracic",
                            "lumbar",
                            "hip",
                            "knee",
                            "ankle_foot",
                        ],
                        "description": "Zona anatomica en ids internos del producto.",
                    },
                    "laterality": {
                        "type": "string",
                        "enum": ["left", "right", "bilateral", "midline"],
                        "description": "Lateralidad de la molestia si aplica.",
                    },
                    "onset_type": {
                        "type": "string",
                        "enum": ["sudden_recent", "gradual_overuse", "unclear"],
                        "description": (
                            "Clasificacion del inicio: golpe/subito o reciente, "
                            "sobrecarga/gradual, o incierto."
                        ),
                    },
                    "pain_at_rest": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 10,
                        "description": "Dolor en reposo de 0 a 10.",
                    },
                    "pain_with_movement": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 10,
                        "description": "Dolor al mover o cargar de 0 a 10.",
                    },
                    "red_flags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Lista de senales de alerta presentes. Usa [] si el usuario las niega."
                        ),
                    },
                    "notes": {
                        "type": "string",
                        "description": "Contexto libre breve: desde cuando, gestos que molestan, etc.",
                    },
                    "use_saved_injuries": {
                        "type": "boolean",
                        "description": (
                            "Si es true, combina la informacion del tool con las lesiones guardadas del perfil."
                        ),
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_muscle_group_routine",
            "description": (
                "Genera una rutina especializada para UN grupo muscular o zona concreta (glúteo, pecho, "
                "espalda, hombros, pierna entera, cuádriceps, isquiotibiales, bíceps, tríceps, gemelos, core). "
                "Incluye justificación científica por ejercicio (anatomía funcional, plano de movimiento, "
                "curva longitud-tensión). USAR cuando el usuario pida una rutina enfocada en una zona "
                "específica (ej. 'quiero una rutina de glúteo', 'dame ejercicios para pecho', "
                "'rutina de pierna'). 'Pierna' se mapea a 'legs' (zona entera: cuádriceps + isquios + "
                "glúteo + gemelos + aductores), no a 'quadriceps'. "
                "La app muestra la rutina en tarjeta visual automáticamente. Tu texto debe ser breve "
                "(1-2 frases); NO listes ejercicios, series ni reps en tu texto. "
                "Para rutinas de cuerpo completo con split semanal (PPL, torso-pierna, full body), "
                "usar create_training_suggestion en su lugar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "muscle_group": {
                        "type": "string",
                        "enum": [
                            "glutes",
                            "chest",
                            "back",
                            "shoulders",
                            "legs",
                            "quadriceps",
                            "hamstrings",
                            "biceps",
                            "triceps",
                            "calves",
                            "core",
                        ],
                        "description": (
                            "Grupo muscular o zona en inglés. Mapeo: glúteo→glutes, pecho→chest, "
                            "espalda→back, hombros→shoulders, pierna(s)→legs (zona entera), "
                            "cuádriceps→quadriceps, isquiotibiales→hamstrings, bíceps→biceps, "
                            "tríceps→triceps, gemelos→calves, abdominales/core→core."
                        ),
                    },
                    "focus": {
                        "type": "string",
                        "enum": ["fuerza", "hipertrofia"],
                        "description": "Objetivo: fuerza (cargas altas, pocas reps) o hipertrofia (volumen, cercanía al fallo).",
                    },
                    "experience_level": {
                        "type": "string",
                        "enum": ["principiante", "intermedio", "avanzado"],
                        "description": "Nivel del usuario; ajusta volumen y notas.",
                    },
                },
                "required": ["muscle_group"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "explain_macro_distribution",
            "description": "Explica el reparto de macronutrientes del usuario y por qué.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]
