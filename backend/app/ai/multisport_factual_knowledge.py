"""Hechos estables por deporte para NutriCoach (terminología y órdenes oficiales; reduce alucinaciones)."""

from __future__ import annotations

MULTISPORT_FACTUAL_COMPACT = """
CONOCIMIENTO FACTUAL MULTIDEPORTE (obligatorio respetarlo al hablar de reglas, estilos y órdenes; si hay duda federativa, dilo):

NATACIÓN (errores frecuentes del modelo — evitarlos):
- Los cuatro estilos olímpicos de piscina, en castellano habitual de competición: **espalda**, **braza**, **mariposa**, **estilo libre** (el libre se nada casi siempre con técnica **crawl/crol**).
- NO digas que los cuatro son "crawl, espalda, pecho y mariposa": mezcla idiomas y **"pecho" no es el nombre del estilo**; el estilo en español es **braza** (pecho en gimnasio es músculo, no estilo de nado).
- Orden en competición **no es intercambiable**:
  - **200 m y 400 m estilos** (medley individual / prueba combinada individual): orden de series **mariposa → espalda → braza → estilo libre (crol)**.
  - **Relevo 4×100 m combinado** (cuatro nadadores, cada uno un estilo): orden **espalda → braza → mariposa → estilo libre**.
- Natación en aguas abiertas / travesías: reglas y distancias dependen del evento; no asumas formato de piscina.

TRIATLÓN Y DUATLÓN:
- Triatlón: orden clásico **natación → ciclismo → carrera a pie**. Duatlón habitual: **carrera → ciclismo → carrera** (formato estándar; variantes existen).

RUNNING:
- Maratón reglamentaria **42,195 km**; media maratón **21,0975 km** (son valores oficiales; puedes redondear en contexto recreativo si lo aclaras).

CICLISMO:
- **Tour de Francia**, **Giro de Italia** y **Vuelta ciclista a España** son tres Grand Tours distintos (no confundir país con nombre de carrera).

DEPORTES DE RAQUETA:
- **Tenis**: juegos/sets; puntuación 0-15-30-40 e igualdad; superficies (hierba, tierra, dura) cambian el juego.
- **Pádel**: pista cerrada con paredes; juego en parejas; no es mini tenis al aire libre.
- **Bádminton / squash**: reglas y puntuación distintas; no las unifiques.

DEPORTES DE EQUIPO (referencia genérica):
- Fútbol regla amplia: **dos tiempos de 45 min**. Baloncesto FIBA: **cuatro cuartos de 10 min** (NBA 12 min); no mezcles sin precisar.

DEPORTES DE COMBATE:
- Categorías de peso, número de asaltos y protecciones **dependen de federación y modalidad**; no inventes tablas.

REMO Y PIRAGÜISMO:
- **Remo** (remos/botas fijas en soporte) y **piragüismo** (kayak/canoa, pala simple/doble) son deportes distintos; no uses el mismo nombre para ambos.

ESCALADA Y MONTAÑA:
- Modalidades **bloque / boulder**, **dificultad/plomo**, **velocidad** tienen reglas y riesgos distintos; no generalices.

CROSS / FUNCIONAL / HIIT:
- Son formatos de entreno; no hay un “reglamento único” como en un deporte federado.

Si el usuario pide datos muy específicos (normativa actual, distancias de una prueba concreta, categorías): indica que pueden variar por federación/año y sugiere contrastar con la fuente oficial si hace falta exactitud.
""".strip()
