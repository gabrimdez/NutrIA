# Sistema de insignias (badges)

## Arquitectura

- **Datos**: PostgreSQL — tablas `badge_definitions`, `user_badges`, `user_featured_badges`, `badge_action_ledger`, `badge_audit_log`, `badge_review_flags` (modelos en `backend/app/models/models.py`, migración Alembic `20260423_badges_system.py`).
- **Anti-abuso**: `BadgeAntiFraudService` (`backend/app/services/badge_antifraud.py`) centraliza dedupe por minuto (`uq_badge_action_ledger_dedupe`), caps diarios configurables, mensajes coach con `trim` y longitud > 1, un pesaje contable por día en ledger, duplicados de búsqueda/foto/scan vía *fingerprint*.
- **Motor**: `BadgeEngineService` evalúa `unlock_rule` (JSON validado con Pydantic en `backend/app/schemas/badge_rules.py`), lee métricas en `BadgeMetricsService` y contadores en ledger cuando aplica.
- **Orquestación**: `BadgeOrchestrator` (`badge_orchestrator.py`) — `on_user_action` tras cada acción relevante.
- **Integración**: `badge_integration.py` — funciones `fire_*` llamadas desde `MealService`, `ChatService`, `ProgressService`, endpoints `nutrition`, `foods`, `plans`.
- **API usuario**: prefijo `/api/v1/me/badges` (`badges.router_user`).
- **API admin**: prefijo `/api/v1/admin/badges` (`badges.router_admin`), cabecera **`X-Admin-Key`** igual a `BADGES_ADMIN_API_KEY`. Si la clave está vacía → **503** en admin.

## Modelo de datos (resumen)

| Tabla | Rol |
|-------|-----|
| `badge_definitions` | Catálogo: `badge_id` único (string estable), textos, `image_url`, `rarity`, `category`, `unlock_rule` JSON, `is_active`. |
| `user_badges` | Una fila por `(user_id, badge_definition_id)`; `revoked_at` / `revoke_reason`; `unlocked_at`, `source` (`system`/`manual`), `progress_snapshot`. |
| `user_featured_badges` | Hasta 3 filas por usuario: `position` 1..3, único por posición y por insignia. |
| `badge_action_ledger` | Acciones elegibles tras anti-abuso (dedupe + caps). |
| `badge_audit_log` | Auditoría de grants/revokes/admin/recompute. |
| `badge_review_flags` | Patrones sospechosos (p. ej. superar mucho el cap de exploración). |

## Cómo añadir una nueva insignia

1. Configura `BADGES_ADMIN_API_KEY` en `.env`.
2. (Opcional) Sube imagen: `POST /api/v1/admin/badges/upload` con `multipart/form-data` campo `file` → respuesta `{ "image_url": "/api/v1/me/badges/media/<id>" }`.
3. Crea la definición: `POST /api/v1/admin/badges` con JSON (ver ejemplo abajo). `unlock_criteria_text` es obligatorio para la UI; `unlock_rule` es opcional y alimenta el motor.

Imágenes en disco: directorio `uploads/badges/` (misma convención que avatares, relativo al cwd del backend). La URL guardada en `image_url` debe ser consumible por la app (prefijo API + ruta `/api/v1/me/badges/media/...`).

## `unlock_criteria_text`

Texto libre mostrado al usuario (cómo conseguir la insignia). Debe ser claro y revisable por producto; no sustituye a la lógica automática.

## `unlock_rule` (JSON)

Campo `type` discriminador. Tipos soportados: `manual_only`, `count_action`, `count_unique_days`, `streak_days`, `complete_days`, `coach_messages`, `weight_logs`, `weight_week_streak`, `water_days`, `diary_entries`, `habits_completed`, `planning_actions`, `exploration_actions`, `macro_goal_days`, `balanced_week`, `premium_active`, `versatile_logger`.

- **`manual_only`**: no se desbloquea por el motor; usar `POST /api/v1/admin/badges/{badge_id}/grant`.
- **`onboarding_complete`**: se cumple si `profiles.onboarding_completed` y existe un `goals` activo para el perfil. Se evalúa al terminar onboarding (`OnboardingService`) y en `recompute`.
- **`active_goal`**: se cumple si existe un **goal activo** para el usuario (`ProfileRepository.get_active_goal_by_user_id`). Se evalúa al terminar onboarding, y tras `PUT /me/goal/weights`, `PUT /me/goal/activity-level` y `PUT /me/goal/recalculate`.
- **`count_action`**: cuenta filas en `badge_action_ledger` para `action_kind` (p. ej. `meal_logged`, `food_search`, `barcode_scan`, `progress_summary_viewed`). Ejemplo insignia **Primera comida** (`first-meal-logged`): `{"type": "count_action", "action_kind": "meal_logged", "target": 1}` (se registra al confirmar comida / diario). **Mirada al progreso** (`progress-review-7d`): `action_kind` `progress_summary_viewed` — al menos una vista del resumen 7d (`GET /progress/summary` o herramienta coach `get_progress_summary`); anti-abuso: como máximo **una fila ledger por día** de calendario. **Buscador** (`food-searcher`): `food_search`, `target: 5` (búsqueda en catálogo de alimentos). **Escáner** (`barcode-scanner`): `barcode_scan`, `target: 3`. **Foto analista** (`photo-analyzer`): `photo_analyze`, `target: 3`. **Entrada libre** (`text-entry-master`): `text_entry_meal`, `target: 5` (parseo de comida desde `/meals/parse-text`). **Guardo para repetir** (`saved-meal`): `saved_meal_created`, `target: 1` (crear comida guardada/plantilla). **Chef en acción** (`recipe-logged`): `recipe_logged`, `target: 3` (crear receta en `/meals/recipes`). **Plan activado** (`plan-generated`): `plan_generated`, `target: 1` (crear/activar plan en endpoint de planes). **Arquitecto** (`plan-editor`): `plan_edited`, `target: 3` (mutaciones de plan vía `PlanService`: quitar/sustituir/editar alimentos, título de comida, regenerar comida IA, etiqueta del plan, reordenar comidas de un día). **Lista lista** (`grocery-list-made`): `grocery_list_made`, `target: 1` — primera vez que el usuario obtiene una lista de la compra **con ítems** (`GET /plans/{plan_id}/shopping-list` vía `PlanService.get_shopping_list`); anti-abuso: **como máximo una fila ledger por usuario** (dedupe fijo). **Compras inteligentes** (`groceries-checked`): `groceries_item_checked`, `target: 10` — cada vez que un ítem pasa a **comprado** (`PATCH` lista, `PlanService.patch_shopping_list_item_checked`); anti-abuso: **una fila por par plan+ítem** (no cuenta desmarcar ni re-marcar el mismo ítem).
- **`weight_logs`**: cuenta **días distintos** con fila en `weight_logs` (histórico real, no solo ledger). Ejemplo **Punto de partida** (`weigh-in-first`): `{"type": "weight_logs", "target": 1}`. Se evalúa al guardar peso (`weight_logged`) y en recompute.
- **`weight_week_streak`**: máxima racha de **semanas consecutivas** (lunes a domingo, según `date.weekday()`) con al menos un día con pesaje en `weight_logs`. Ejemplo **Constancia de peso** (`weigh-in-weekly-4`): `{"type": "weight_week_streak", "target": 4}`. Se evalúa al guardar peso y en recompute.
- **`exploration_actions`**: suma ledger de `food_search`, `nutrition_search`, `barcode_scan`, `photo_analyze`.
- **`coach_messages`**: cuenta mensajes de rol **user** en `chat_messages` (todas las sesiones del usuario) con `trim(content)` de longitud **> 1** (`BadgeMetricsService.count_coach_user_messages`). Ejemplos: **Hola NutriCoach** (`coach-first-chat`): `target: 1`; **Consulta activa** (`coach-session-7`): `target: 7`. Se evalúa tras `fire_coach_message` en `ChatService` (respuesta normal o mensaje bloqueado por seguridad).
- **Foto en chat coach** (`coach-with-photo`): `count_action` con `action_kind` `coach_chat_photo`, `target: 1` — tras un turno de chat **con imagen** que termina bien (`ChatService`: visión Groq + respuesta asistente); anti-abuso: **una fila ledger por usuario** (dedupe fijo).
- **Aprendiz** (`insights-learner`): `coach_insight_saved`, `target: 3` — cada guardado vía `POST /api/v1/chat/insights` (tabla `coach_saved_insights`); ledger **una fila por insight** (huella = id del guardado).
- **`water_days`**: cuenta días distintos con `water_logs.glasses >= min_glasses_per_day` (defecto **1**; solo hidratación, no actividad). Ejemplos: **Primer vaso** `target: 1`; **Hidratado** (`water-7-days`) `target: 7`; **Hábito hidratado** (`water-consistent-14`) `target: 14`, `min_glasses_per_day: 2`. Se reevalúa al registrar agua con vasos > 0 (`water_logged` en el ledger) y en `recompute` (no al sincronizar solo pasos/entreno: eso usa `activity_day_logged`).
- **`habits_completed`**: días únicos con agua `glasses > 0` o actividad con pasos o duración entrenamiento (proxy sin entidad “hábito” en BD). Reevaluación incremental tras `water_logged`, `activity_day_logged` o `meal_logged` (y `recompute`).
- **`macro_goal_days`**: cuenta **días distintos** (no exige consecutivos) en los que la suma diaria de `meal_entries` (kcal, proteína, carbos, grasa) está dentro de ±`margin_pct` del **`DailyTarget` activo** del usuario. El histórico se contrasta con el target actual (no versiona targets antiguos). Ejemplos: **En el objetivo** `target: 1`; **En racha de macros** (`macro-goal-7x`) `target: 7`. Se evalúa al registrar comida, al confirmar/recalcular objetivo (`active_goal_confirmed`) y en recompute.
- **`balanced_week`**: en la ventana de los últimos **`window_days`** días de calendario hasta la fecha de evaluación, cuenta cuántos días cumplen **a la vez**: suma diaria de comidas dentro de ±`macro_margin_pct` del `DailyTarget` activo **y** `water_logs.glasses >= water_glasses_goal` (defecto **12** vasos ≈ 3 L como en la app). El desbloqueo exige que ese conteo sea **≥ ceil(window_days × min_day_fraction)** (defecto 7 días y 80 % → **6** días). Ejemplo **Semana balanceada** (`balanced-week`): `{"type": "balanced_week", "window_days": 7, "macro_margin_pct": 10, "min_day_fraction": 0.8, "water_glasses_goal": 12}`. Se evalúa al registrar comida, tras `water_logged` o `activity_day_logged`, al confirmar objetivo (`active_goal_confirmed`) y en `recompute`. El valor ledger `water_or_activity_day` queda solo por compatibilidad con datos antiguos.
- **`premium_active`**: cumple si el usuario tiene **Premium efectivo**: `profiles.subscription_tier = 'premium'` o su `user_id` aparece en `NUTRIFORCE_PREMIUM_OVERRIDE_USER_IDS` (lista separada por comas en `.env`). Ejemplo **Apoyo al proyecto** (`premium-supporter`): `{"type": "premium_active"}`. Se evalúa en las mismas pasadas del motor que el resto de reglas (p. ej. tras registrar comida, chat, etc.) y en `recompute`.
- **`versatile_logger`**: cuenta cuántos **`action_kind` distintos** aparecen en `badge_action_ledger` dentro de un subconjunto (por defecto: `food_search`, `nutrition_search`, `barcode_scan`, `photo_analyze`, `text_entry_meal`, `saved_meal_created`, `recipe_logged`). Ejemplo **Registro versátil** (`versatile-logger`): `{"type": "versatile_logger", "target": 5}`. Opcional `action_kinds` (lista de strings) para acotar o sustituir el conjunto. Se reevalúa al registrar cualquiera de esas acciones en el ledger o en `recompute`.

## Insignias destacadas (máx. 3)

- `GET /api/v1/me/badges/featured` — 3 slots (pueden ir vacíos).
- `PUT /api/v1/me/badges/featured` — cuerpo `{ "badge_ids": ["id1","id2"] }` en orden deseado (máx. 3). Solo insignias **desbloqueadas** y **activas**.
- Al **revocar** un `user_badge`, se borran filas de `user_featured_badges` y se limpian destacadas inválidas al listar.

## Recompute / backfill

- `POST /api/v1/admin/badges/recompute` con cabecera `X-Admin-Key`.
- Cuerpo `{ "user_id": "<uuid>" }` para un usuario, o `{}` para todos los `app_users` (puede ser costoso).

El motor **no inserta** datos históricos falsos en el ledger: relee comidas, chat, peso, planes, etc. Las reglas basadas en ledger (`count_action`, `exploration_actions`) solo cuentan acciones registradas desde el despliegue del sistema de insignias.

## Revocación

- `POST /api/v1/admin/badges/{badge_id}/revoke` con `{ "user_id": "...", "reason": "..." }`.
- Marca `revoked_at` y elimina destacadas asociadas.

## Anti-abuso (resumen)

Variables en `.env` / `Settings`: `BADGE_DAILY_CAP_*`, `BADGE_COMPLETE_DAY_MIN_MINUTES_BETWEEN_MEALS`, `BADGE_STREAK_GRACE_DAYS_AFTER_CALENDAR_DAY`.

- Misma acción misma huella en el **mismo minuto** no duplica ledger.
- Caps diarios por tipo de exploración.
- Coach: contenido tras `strip` debe tener longitud **> 1**.
- Peso: una entrada ledger por día (`weight_day`).
- **Día completo** (`day-logged`): `complete_days` con `min_real_meals: 3`, **tipos de comida distintos** el mismo día, separación mínima entre marcas (`min_minutes_between_meals`, defecto global 90 en `RuleCompleteDays`; esta insignia usa **15** en semilla/migración) y `min_kcal_per_meal` (**0** para esta insignia: cuenta cualquier registro con kcal ≥ 0; el defecto del tipo de regla sigue siendo 80 kcal para otras insignias `complete_days`). Ver `BadgeMetricsService.count_complete_days`.
- Rachas: comidas contadas si `created_at` no excede el fin del día de gracia tras el día lógico de la comida.

## Ejemplos `unlock_rule`

**Racha (comidas por día):**

```json
{
  "type": "streak_days",
  "target": 7,
  "min_meals_per_day": 1,
  "grace_days_after_calendar_day": 1
}
```

**Conteo de registros de diario (entradas `meal_entries`):**

```json
{
  "type": "diary_entries",
  "target": 30
}
```

**Solo manual:**

```json
{
  "type": "manual_only"
}
```

## Ejemplo cURL: crear insignia (admin)

```bash
curl -sS -X POST "http://localhost:8000/api/v1/admin/badges" \
  -H "X-Admin-Key: TU_CLAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "badge_id": "primeros_pasos_diario",
    "name": "Primeros pasos",
    "description": "Registra comidas en el diario.",
    "unlock_criteria_text": "Registra 5 comidas en el diario.",
    "image_url": "/api/v1/me/badges/media/abc123...",
    "rarity": "comun",
    "category": "diario",
    "unlock_rule": { "type": "diary_entries", "target": 5 },
    "is_active": true
  }'
```

Subir foto antes: `curl -sS -X POST "http://localhost:8000/api/v1/admin/badges/upload" -H "X-Admin-Key: TU_CLAVE" -F "file=@insignia.png"`.
