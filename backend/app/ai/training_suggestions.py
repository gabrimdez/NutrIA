"""Plantillas de entrenamiento de fuerza/hipertrofia y lógica de resolución."""

from __future__ import annotations

import re
from typing import Optional

from app.ai.training_adaptation import adapt_training_days
from app.schemas.injury_profile import InjuryProfile

# ---------------------------------------------------------------------------
# Plantillas 2–6 días.
#
# - 2 y 4 días: plantilla única (sin ``options``).
# - 3, 5 y 6 días: ``options`` → lista de splits; el usuario elige uno.
# ---------------------------------------------------------------------------

TRAINING_TEMPLATES: dict[int, dict] = {
    2: {
        "name": "Full Body 2 días",
        "split": "full_body",
        "days": [
            {
                "name": "Día A - Full Body",
                "exercises": [
                    "Elevaciones laterales: 3x10-12",
                    "Extensión de cuádriceps: 3x8-12",
                    "Curl femoral sentado o tumbado: 3x8-12",
                    "Press de banca, peck deck o cruce de poleas horizontal: 3x6-10",
                    "Remo con barra, mancuerna o máquina: 3x6-10",
                    "Curl de bíceps de pie, sentado o bayesian curl: 3x8-12",
                    "Extensión de tríceps en polea por encima de la cabeza o press francés: 3x8-12",
                ],
            },
            {
                "name": "Día B - Full Body",
                "exercises": [
                    "Peso muerto rumano o piernas rígidas: 3x6-10",
                    "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                    "Press inclinado con mancuernas, multipower o cruces ascendentes: 3x8-12",
                    "Jalón al pecho o dominadas: 3x6-10",
                    "Press militar: 3x10-15",
                    "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                    "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                ],
            },
        ],
    },
    3: {
        "name": "Rutinas 3 días",
        "split": "custom_3_days",
        "options": [
            {
                "name": "Full Body 3 días",
                "split": "full_body",
                "days": [
                    {
                        "name": "Día A - Full Body",
                        "exercises": [
                            "Elevaciones laterales: 3x10-12",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Press de banca, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Remo con barra, mancuerna o máquina: 3x6-10",
                            "Curl de bíceps de pie, sentado o bayesian curl: 3x8-12",
                            "Extensión de tríceps en polea por encima de la cabeza o press francés: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día B - Full Body",
                        "exercises": [
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Press inclinado con mancuernas, multipower o cruces ascendentes: 3x8-12",
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Press militar: 3x10-15",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día C - Full Body",
                        "exercises": [
                            "Elevaciones frontales o Press Militar: 3x10-12",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Press de banca, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Remo con barra, mancuerna o máquina: 3x6-10",
                            "Curl de bíceps de pie, sentado o bayesian curl: 3x8-12",
                            "Extensión de tríceps en polea por encima de la cabeza o press francés: 3x8-12",
                        ],
                    },
                ],
            },
            {
                "name": "Push, Pull, Leg (3 días)",
                "split": "push_pull_leg",
                "days": [
                    {
                        "name": "Día 1 - Push",
                        "exercises": [
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Press militar: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 2 - Pull",
                        "exercises": [
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Remo sentado o de pie con agarre cerrado: 3x6-10",
                            "Remo sentado o de pie con agarre abierto: 3x6-10",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 3 - Leg",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos de pie o sentado: 3x10-15",
                            "Crunch en polea o máquina: 3x10-15",
                        ],
                    },
                ],
            },
            {
                "name": "Torso, Pierna, Brazo (3 días)",
                "split": "torso_pierna_brazo",
                "days": [
                    {
                        "name": "Día 1 - Torso",
                        "exercises": [
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Remo sentado o de pie con agarre cerrado: 3x6-10",
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 2 - Pierna",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos de pie o sentado: 3x10-15",
                            "Crunch en polea o máquina: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 3 - Brazo",
                        "exercises": [
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                        ],
                    },
                ],
            },
        ],
    },
    4: {
        "name": "Torso-Pierna 4 días",
        "split": "upper_lower",
        "days": [
            {
                "name": "Día 1 - Torso A",
                "exercises": [
                    "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                    "Remo sentado o de pie con agarre cerrado: 3x6-10",
                    "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                    "Jalón al pecho o dominadas: 3x6-10",
                    "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                    "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                    "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                ],
            },
            {
                "name": "Día 2 - Pierna A",
                "exercises": [
                    "Adductor en polea o máquina: 3x10-15",
                    "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-10",
                    "Peso muerto rumano o piernas rígidas: 3x6-10",
                    "Extensión de cuádriceps: 3x10-15",
                    "Curl femoral sentado o tumbado: 3x8-12",
                    "Elevación de gemelos de pie: 3x10-15",
                    "Crunch en polea o máquina: 3x10-15",
                ],
            },
            {
                "name": "Día 3 - Torso B",
                "exercises": [
                    "Remo sentado o de pie con agarre abierto: 3x6-10",
                    "Press plano con mancuernas, multipower o cruce ascendente: 3x8-12",
                    "Jalón al pecho o dominadas: 3x6-10",
                    "Remo en máquina o mancuerna: 3x8-12",
                    "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                    "Curl predicador, spider curl o banco scott: 3x8-12",
                    "Extensión de tríceps en polea: 3x8-12",
                ],
            },
            {
                "name": "Día 4 - Pierna B",
                "exercises": [
                    "Peso muerto rumano o piernas rígidas: 3x6-10",
                    "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                    "Extensión de cuádriceps: 3x10-15",
                    "Curl femoral sentado o tumbado: 3x8-12",
                    "Elevación de gemelos sentado: 3x12-20",
                    "Crunch en polea o plancha: 3x10-15 / 30-45s",
                ],
            },
        ],
    },
    5: {
        "name": "Rutinas 5 días",
        "split": "custom_5_days",
        "options": [
            {
                "name": "Push, Pull, Leg, Descanso, Torso, Pierna, Descanso",
                "split": "push_pull_leg_rest_torso_pierna",
                "days": [
                    {
                        "name": "Día 1 - Push",
                        "exercises": [
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Press militar: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 2 - Pull",
                        "exercises": [
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Remo sentado o de pie con agarre cerrado: 3x6-10",
                            "Remo sentado o de pie con agarre abierto: 3x6-10",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 3 - Leg",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos de pie o sentado: 3x10-15",
                            "Crunch en polea o máquina: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 4 - Torso",
                        "exercises": [
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Remo en máquina o mancuerna: 3x8-12",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                            "Extensión de tríceps en polea: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 5 - Pierna",
                        "exercises": [
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos sentado: 3x12-20",
                            "Crunch en polea o plancha: 3x10-15 / 30-45s",
                        ],
                    },
                ],
            },
            {
                "name": "Torso, Pierna, Descanso, Torso, Pierna, Brazo, Descanso",
                "split": "torso_pierna_rest_torso_pierna_brazo",
                "days": [
                    {
                        "name": "Día 1 - Torso A",
                        "exercises": [
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Remo sentado o de pie con agarre cerrado: 3x6-10",
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 2 - Pierna A",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos de pie: 3x10-15",
                            "Crunch en polea o máquina: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 3 - Torso B",
                        "exercises": [
                            "Press plano con mancuernas, multipower o cruce de poleas horizontal: 3x8-12",
                            "Remo sentado o de pie con agarre abierto: 3x6-10",
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x8-12",
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 4 - Pierna B",
                        "exercises": [
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos sentado: 3x12-20",
                            "Crunch en polea o plancha: 3x10-15 / 30-45s",
                        ],
                    },
                    {
                        "name": "Día 5 - Brazo",
                        "exercises": [
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                            "Hombro posterior en polea o máquina: 3x10-15",
                        ],
                    },
                ],
            },
            {
                "name": "Torso, Brazo, Pierna, Descanso, Torso, Brazo, Descanso",
                "split": "torso_brazo_pierna_rest_torso_brazo",
                "days": [
                    {
                        "name": "Día 1 - Torso A",
                        "exercises": [
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Remo sentado o de pie con agarre cerrado: 3x6-10",
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 2 - Brazo",
                        "exercises": [
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                            "Hombro posterior en polea o máquina: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 3 - Pierna",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos de pie o sentado: 3x10-15",
                            "Crunch en polea o máquina: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 4 - Torso B",
                        "exercises": [
                            "Press plano con mancuernas, multipower o cruce de poleas horizontal: 3x8-12",
                            "Remo sentado o de pie con agarre abierto: 3x6-10",
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x8-12",
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 5 - Brazo",
                        "exercises": [
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                            "Hombro posterior en polea o máquina: 3x10-15",
                        ],
                    },
                ],
            },
        ],
    },
    6: {
        "name": "Rutinas 6 días",
        "split": "custom_6_days",
        "options": [
            {
                "name": "Push, Pull, Leg, Descanso, Push, Pull, Leg",
                "split": "push_pull_leg_rest_push_pull_leg",
                "days": [
                    {
                        "name": "Día 1 - Push A",
                        "exercises": [
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Press militar: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 2 - Pull A",
                        "exercises": [
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Remo sentado o de pie con agarre cerrado: 3x6-10",
                            "Remo sentado o de pie con agarre abierto: 3x6-10",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 3 - Leg A",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos de pie: 3x10-15",
                            "Crunch en polea o máquina: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 4 - Push B",
                        "exercises": [
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Press militar: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 5 - Pull B",
                        "exercises": [
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Remo en máquina o mancuerna: 3x8-12",
                            "Remo sentado o de pie con agarre abierto: 3x6-10",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 6 - Leg B",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos sentado: 3x12-20",
                            "Crunch en polea o plancha: 3x10-15 / 30-45s",
                        ],
                    },
                ],
            },
            {
                "name": "Push, Pull, Leg, Descanso, Torso, Brazo, Pierna",
                "split": "push_pull_leg_rest_torso_brazo_pierna",
                "days": [
                    {
                        "name": "Día 1 - Push",
                        "exercises": [
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                            "Press militar: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 2 - Pull",
                        "exercises": [
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Remo sentado o de pie con agarre cerrado: 3x6-10",
                            "Remo sentado o de pie con agarre abierto: 3x6-10",
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                        ],
                    },
                    {
                        "name": "Día 3 - Leg",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos de pie: 3x10-15",
                            "Crunch en polea o máquina: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 4 - Torso",
                        "exercises": [
                            "Press inclinado en máquina, mancuernas o cruce de poleas ascendente: 3x6-10",
                            "Press de banca, press plano en máquina, peck deck o cruce de poleas horizontal: 3x6-10",
                            "Jalón al pecho o dominadas: 3x6-10",
                            "Remo en máquina o mancuerna: 3x8-12",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 5 - Brazo",
                        "exercises": [
                            "Curl de bíceps con mancuernas, de pie, sentado o bayesian curl: 3x8-12",
                            "Curl predicador, curl en banco scott o spider curl: 3x8-12",
                            "Extensión de tríceps por encima de la cabeza o press francés: 3x8-12",
                            "Extensión de tríceps en polea o fondos de tríceps: 3x8-12",
                            "Elevaciones laterales en polea, máquina o mancuerna: 3x10-15",
                        ],
                    },
                    {
                        "name": "Día 6 - Pierna",
                        "exercises": [
                            "Adductor en polea o máquina: 3x10-15",
                            "Peso muerto rumano o piernas rígidas: 3x6-10",
                            "Patrón de sentadilla: sentadilla, hack squat o prensa: 3x8-12",
                            "Extensión de cuádriceps: 3x8-12",
                            "Curl femoral sentado o tumbado: 3x8-12",
                            "Elevación de gemelos sentado: 3x12-20",
                            "Crunch en polea o plancha: 3x10-15 / 30-45s",
                        ],
                    },
                ],
            },
        ],
    },
}

# ---------------------------------------------------------------------------
# Textos reutilizables
# ---------------------------------------------------------------------------

DISCLAIMER = (
    "No existe un entrenamiento perfecto para todo el mundo: depende de tu cuerpo, "
    "tu experiencia y tu contexto personal. Lo que sí puedes hacer es seguir una "
    "rutina general basada en evidencia y ajustarla con el tiempo. "
    "Esta es una propuesta orientativa; si tienes dudas o molestias, "
    "consulta con un entrenador cualificado."
)

FOCUS_NOTE_FUERZA = (
    "Si tu objetivo es fuerza, prioriza los ejercicios multiarticulares pesados: "
    "por ejemplo, el press de banca antes que los cruces en polea, o la sentadilla/"
    "hack squat antes que la extensión de cuádriceps. "
    "Trabaja generalmente en rangos de 4-8 repeticiones en compuestos y 6-12 en aislamientos, "
    "con descansos de 3-5 minutos entre series pesadas."
)

FOCUS_NOTE_HIPERTROFIA = (
    "Si tu objetivo es hipertrofia, prioriza la estabilidad en la ejecución: "
    "las máquinas y las poleas son muy útiles porque guían la trayectoria y permiten "
    "llegar cerca del fallo con menos riesgo de perder la técnica. "
    "Eso no significa abandonar barra y mancuernas; combínalos, pero dale "
    "protagonismo al trabajo estable. "
    "Rangos habituales: 6-10 reps en compuestos y 8-15 en aislamientos, "
    "con 3 series efectivas por ejercicio a RIR 0-1."
)


# ---------------------------------------------------------------------------
# Parseo de ejercicios "Nombre: SxR-R" → {name, sets, reps}
# ---------------------------------------------------------------------------

_EXERCISE_RE = re.compile(r"^(.+?):\s*(\d+)\s*x\s*(.+)$")


def parse_exercise_str(raw: str) -> dict:
    """``"Press de banca: 3x6-10"`` → ``{"name": "Press de banca", "sets": 3, "reps": "6-10"}``."""
    m = _EXERCISE_RE.match(raw.strip())
    if m:
        return {"name": m.group(1).strip(), "sets": int(m.group(2)), "reps": m.group(3).strip()}
    return {"name": raw.strip(), "sets": 0, "reps": ""}


def _structured_days(days: list[dict]) -> list[dict]:
    """Convierte ``days`` con ``exercises`` string a formato estructurado."""
    return [
        {
            "name": d["name"],
            "exercises": [parse_exercise_str(e) for e in d["exercises"]],
        }
        for d in days
    ]


# ---------------------------------------------------------------------------
# Resolución de plantilla
# ---------------------------------------------------------------------------

def _resolve_template(
    days_key: int, split_key: Optional[str] = None
) -> dict:
    """Devuelve ``{name, split, days}`` o ``{error, available_splits}``."""
    template = TRAINING_TEMPLATES[days_key]

    if "options" not in template:
        return {"name": template["name"], "split": template["split"], "days": template["days"]}

    options: list[dict] = template["options"]

    if split_key:
        sk = split_key.strip()
        for opt in options:
            if opt["split"] == sk:
                return {"name": opt["name"], "split": opt["split"], "days": opt["days"]}
        sk_lower = sk.lower()
        for opt in options:
            if opt["name"].lower() == sk_lower or sk_lower in opt["name"].lower():
                return {"name": opt["name"], "split": opt["split"], "days": opt["days"]}
        return {
            "error": f"No hay un split '{split_key}' para {days_key} días.",
            "available_splits": [{"split": o["split"], "name": o["name"]} for o in options],
        }

    if len(options) == 1:
        opt = options[0]
        return {"name": opt["name"], "split": opt["split"], "days": opt["days"]}

    return {
        "error": (
            f"Para {days_key} días hay varias opciones de split. "
            "Pregunta al usuario cuál prefiere y vuelve a llamar con split_key."
        ),
        "available_splits": [{"split": o["split"], "name": o["name"]} for o in options],
    }


def get_training_suggestion(
    available_days: int,
    focus: str = "hipertrofia",
    split_key: Optional[str] = None,
    injury_profiles: Optional[list[InjuryProfile]] = None,
) -> dict:
    days_key = min(max(available_days, 2), 6)

    resolved = _resolve_template(days_key, split_key)
    if "error" in resolved:
        return resolved

    focus_lower = focus.strip().lower() if focus else "hipertrofia"
    if focus_lower == "fuerza":
        focus_note = FOCUS_NOTE_FUERZA
    else:
        focus_note = FOCUS_NOTE_HIPERTROFIA

    profiles = injury_profiles or []
    if not profiles:
        return {
            "name": resolved["name"],
            "split": resolved["split"],
            "days": resolved["days"],
            "structured_days": _structured_days(resolved["days"]),
            "focus_note": focus_note,
            "disclaimer": DISCLAIMER,
        }

    adapted = adapt_training_days(resolved["days"], profiles)
    if adapted.get("safety_stop"):
        return {
            "error": adapted.get("error", "safety_stop"),
            "safety_message": adapted.get("safety_message", ""),
            "medical_disclaimer": adapted.get("medical_disclaimer", ""),
            "adaptation_trace": adapted.get("adaptation_trace", []),
            "coach_instructions_es": (
                "Responde en 3–5 frases cortas y empáticas: no generamos rutina de carga por precaución; "
                "resume el mensaje de seguridad (safety_message) y el aviso legal (medical_disclaimer) sin alarmismo. "
                "Prioriza valoración presencial antes de volver a cargar la zona. No inventes ejercicios."
            ),
        }
    if adapted.get("mode") == "conservative_rehab":
        fn = adapted.get("focus_note", focus_note)
        return {
            "name": "Bloque de readaptación",
            "split": "readaptacion",
            "days": adapted["days"],
            "structured_days": adapted["structured_days"],
            "focus_note": fn,
            "disclaimer": DISCLAIMER,
            "medical_disclaimer": adapted.get("medical_disclaimer", ""),
            "adaptation_trace": adapted.get("adaptation_trace", []),
            "mode": "conservative_rehab",
            "coach_instructions_es": (
                "Responde en 4–7 frases breves (párrafos cortos). No enumeres ejercicios (la app ya los muestra en tabla). "
                "Incluye sí: (1) que es readaptación conservadora, no rehabilitación clínica; "
                "(2) criterio de dolor tolerable durante el trabajo (≤3/10) y vigilar respuesta al día siguiente; "
                "(3) frecuencia orientativa 2–4 sesiones ligeras/semana si tolera; "
                "(4) detener o reducir si hay aumento de dolor, hinchazón, inestabilidad u hormigueo; "
                "(5) derivar a profesional si no mejora o hay dudas. "
                "Usa el focus_note y medical_disclaimer de la herramienta."
            ),
        }

    return {
        "name": resolved["name"],
        "split": resolved["split"],
        "days": adapted["days"],
        "structured_days": adapted["structured_days"],
        "focus_note": focus_note,
        "disclaimer": DISCLAIMER,
        "medical_disclaimer": adapted.get("medical_disclaimer", ""),
        "adaptation_trace": adapted.get("adaptation_trace", []),
        "coach_instructions_es": (
            "Responde en 2–5 frases: confirma split y número de días; resume el focus_note; "
            "indica en una frase que los ejercicios ya están adaptados a las lesiones guardadas (sin listarlos). "
            "Incluye medical_disclaimer en una línea si procede. No inventes ni repitas la tabla de ejercicios."
        ),
    }
