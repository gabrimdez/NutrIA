# Cobertura de `@limit_if_enabled` (slowapi)

Inventario orientativo. Los tests usan `RATE_LIMIT_ENABLED=false` en [`tests/conftest.py`](../tests/conftest.py).

| Router | Notas |
|--------|--------|
| `auth` | Login, registro, reset: límites por IP + cuenta (`account_rate_limit`). |
| `meals` | Todas las rutas con límite explícito (confirm, CRUD comidas/recetas/alimentos; parse-text y recomendaciones con límites más bajos). |
| `foods`, `nutrition`, `chat`, `plans`, `badges`, `avatar` | Ya tenían límites en endpoints sensibles. |
| `workouts` | 60–120/min según ruta (copy-previous más bajo). |
| `diary` | 120/min en lecturas. |
| `onboarding` | 10/min en `complete`. |
| `progress` | 30–120/min (plateau y estimate-training más bajos). |
| `profile` | 30–120/min (recalculate más bajo). |

Rutas públicas o internas sin JWT siguen el comportamiento por defecto de slowapi (clave = IP; ver [security-rate-limit.md](./security-rate-limit.md)).
