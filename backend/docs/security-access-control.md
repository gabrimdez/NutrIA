# Control de acceso (IDOR)

## Convención

- Los endpoints protegidos obtienen `user_id` solo desde **`get_current_user_id`** (JWT), nunca desde el cuerpo de la petición como identidad principal.
- Los repositorios **filtran por `user_id`** en todas las lecturas/escrituras de datos de usuario.

## Workouts (`WorkoutRepository`)

Todas las consultas incluyen `WorkoutRoutine.user_id == user_id` o `WorkoutSession.user_id == user_id`. Creación asigna `user_id` del servicio (token).

## Comidas / diario (`MealRepository` y servicios)

Patrón equivalente: operaciones reciben `user_id` desde la capa de servicio ligada al token.

## Revisión periódica

Al añadir endpoints nuevos:

1. ¿Usa `Depends(get_current_user_id)`?
2. ¿El repositorio filtra por ese `user_id` en **todas** las rutas de acceso a filas?
