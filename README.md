# NutrIA

App de nutrición y entrenamiento enfocada en **fuerza e hipertrofia**. Combina IA ([Groq](https://groq.com): chat, planes y visión multimodal), reglas deterministas, búsqueda unificada de alimentos (catálogo local, Open Food Facts, **FatSecret** opcional) y seguimiento de hábitos (diario, agua, **racha de nutrición**, peso). **Tier free/premium** en perfil con límites de uso (visión, regeneración semanal, etc.) según migración y lógica de negocio.

## Qué incluye hoy

- **Auth y perfil**: JWT, perfil editable, objetivos y targets diarios, ajuste de peso/actividad, **avatar** (subida en disco en el backend), **tier de suscripción** (free/premium) y contadores de uso asociados.
- **Onboarding** y cálculo determinista de BMR/TDEE/macros (reglas en `rules/`).
- **Diario y comidas**: día con totales vs objetivo, resumen mensual, comidas recientes, edición/borrado, marcar ítems como **comidos/no comidos**.
- **Alimentos**: búsqueda (`/foods/search` y **`/nutrition/search`**), análisis de foto (JSON base64 en `/foods/analyze-photo` y **multipart** en `/nutrition/photo/analyze`), **código de barras** (`/nutrition/barcode/{code}`), comidas guardadas, **alimentos personalizados**, **recetas** (CRUD), interpretación de texto libre (`/meals/parse-text`).
- **Planes de dieta**: generación con IA (con throttling y modelo de plan configurable), plan manual, activar/eliminar, etiqueta, reordenar comidas del día, sustituir/alimentos en comidas, regenerar comida, lista de la compra editable.
- **Progreso**: peso (varios registros por día), actividad, resumen 7d, **vasos de agua**, análisis de estancamiento, **racha de nutrición** en el resumen.
- **Chat NutriCoach**: mensajes con tool calling (incl. sugerencias de **readaptación** y **rutina** cuando aplica), sesiones, **insights guardados** (`/chat/insights`), contexto de foto opcional, respuestas con correcciones y **plan de entrenamiento** estructurado cuando aplica.
- **Insignias**: catálogo, progreso, slots destacados, medios en `/me/badges/...`; administración y subida de assets bajo `/admin/badges` (clave en `.env`).
- **Móvil (Expo)**: tabs inicio/diario/búsqueda/plan/chat, flujos añadir comida (búsqueda, foto, escáner, **código de barras**, recetas, crear alimento/receta, receta desde foto), detalle de comida, lista de compra, perfil (edición, objetivos, ajustes, **historial de peso**, **insignias**), componentes de UI y **gamificación visual de racha** (Nutria, modal de racha).

## Arquitectura

```
/backend        → FastAPI + Python (API, servicios, IA, reglas, proveedores de nutrición)
/mobile         → Expo + React Native + TypeScript (app móvil)
/neon           → Migraciones SQL y seeds para Postgres (Neon u otro)
/docs           → Documentación adicional
/tools          → Scripts auxiliares (p. ej. assets / sprites)
```

### Backend (FastAPI)

```
app/
├── main.py              # Punto de entrada FastAPI, CORS, rate limit (slowapi)
├── core/                # Config, seguridad, rate limit, sanitizado de logs
├── api/v1/endpoints/    # Endpoints REST (auth, me, badges, onboarding, foods, nutrition, meals, diary, progress, plans, chat, admin/badges)
├── models/              # SQLAlchemy models
├── schemas/             # Pydantic v2 schemas
├── services/            # Lógica de negocio
├── repositories/        # Acceso a datos
├── food_providers/      # Catálogo local, OFF, BEDCA stub, FatSecret, composición
├── ai/                  # Integración Groq (visión, chat, diet)
├── rules/               # Reglas deterministas de negocio
└── db/                  # Sesión y base declarativa
```

**Tests (pytest)**: `backend/tests/` (config `backend/pytest.ini`).

También hay migraciones **Alembic** en `backend/alembic/` para evolucionar el esquema en desarrollo; en Neon suele aplicarse el orden de scripts en `/neon/migrations`.

### Mobile (Expo Router)

```
mobile/
├── app/                      # Expo Router (pantallas)
│   ├── (tabs)/               # Inicio, diario, búsqueda, plan (semanal), chat
│   ├── auth/                 # Login y registro
│   ├── onboarding/
│   ├── add-meal/             # Flujo añadir comida (búsqueda, foto, escáner, barcode, guardadas, recetas, crear alimento/receta…)
│   ├── meal/[id].tsx         # Detalle / edición de comida
│   ├── profile/              # Perfil, edición, objetivos, ajustes, historial de peso, insignias
│   └── shopping-list.tsx
├── src/
│   ├── components/           # UI reutilizable (macros, diario, racha/Nutria, modales…)
│   ├── lib/                  # API client, authStorage, QueryClient, utilidades
│   ├── store/                # Zustand (auth, etc.)
│   ├── theme/                # Colores, espaciado, tipografía
│   └── types/                # TypeScript types
```

## Supuestos de diseño

1. **Auth**: Registro/login en el backend (`/api/v1/auth/*`), JWT HS256 con `JWT_SECRET` y `python-jose`.
2. **Base de alimentos**: proveedores combinables (catálogo Postgres + Open Food Facts + opcional FatSecret; BEDCA como stub). Seeds en `neon/seed/` y catálogo ampliado en migraciones.
3. **IA**: Groq (`GROQ_CHAT_MODEL`, `GROQ_VISION_MODEL`, `GROQ_PLAN_MODEL`, límites y pausas configurables para generación de planes). Salida JSON validada con Pydantic; tool calling en el chat.
4. **Seguridad IA**: capas de scope, salida estructurada, validación, reglas y conservadurismo donde aplica.
5. **Cálculos**: Mifflin-St Jeor, TDEE, macros por objetivo en `rules/`.
6. **Historial**: entradas de comida con macros en snapshot; ítems pueden llevar flag **eaten**.
7. **Planes**: versionados; edición fina en API (comidas, alimentos, orden, sustituciones, regeneración).
8. **Nutrición unificada**: prefijo `/api/v1/nutrition` para búsqueda, barcode y foto multipart; `/api/v1/foods` mantiene búsqueda POST y análisis por JSON para compatibilidad.
9. **Rate limiting**: SlowAPI en endpoints sensibles (chat, búsqueda nutrición, generación de plan); `RATE_LIMIT_ENABLED=false` en tests.
10. **Avatares**: ficheros en `backend/uploads/avatars` (no bucket obligatorio para MVP).
11. **Insignias**: definiciones y desbloqueos en BD; PNG/WebP en `backend/uploads/badges` (fallback a assets del móvil); admin con `BADGES_ADMIN_API_KEY` (ver `.env.example`).
12. **Suscripción**: `subscription_tier` en `profiles` y tabla `user_feature_usage` para cuotas por periodo (migración `013`).

## Setup

### Requisitos previos

- Python 3.11+ (el README de ejemplo usa 3.12 en Windows)
- Node.js 18+
- Postgres (Neon u otro)
- **IA:** [Groq](https://console.groq.com) (`GROQ_API_KEY` o `GROQ_API_KEYS`)
- **Opcional:** [FatSecret](https://platform.fatsecret.com) para enriquecer búsqueda/barcode; LogMeal u otros según `.env.example`

### 1. Variables de entorno

Copia `.env.example` a `.env` en la raíz y rellena los valores:

```bash
cp .env.example .env
```

Imprescindibles:

- `DATABASE_URL` — PostgreSQL con prefijo `postgresql+asyncpg://`
- `JWT_SECRET` — secreto largo para JWT
- `GROQ_API_KEY` — o varias en `GROQ_API_KEYS` (rotación ante 429)

Recomendadas / frecuentes:

- `GROQ_CHAT_MODEL`, `GROQ_VISION_MODEL`, `GROQ_PLAN_MODEL`, `GROQ_PLAN_MAX_OUTPUT_TOKENS`, flags y pausas `GROQ_PLAN_*` (ver `.env.example` para free tier)
- `FATSECRET_CLIENT_ID` / `FATSECRET_CLIENT_SECRET` si quieres resultados extra en búsqueda
- `CORS_ORIGINS` si sirves el front fuera de localhost
- `RATE_LIMIT_ENABLED` — `false` solo en tests o depuración local
- `BADGES_ADMIN_API_KEY` si usas `/admin/badges`; caps y reglas de insignias `BADGE_*` (ver `.env.example`); overrides premium opcionales comentados en el mismo fichero

### 2. Base de datos (Neon / Postgres)

En el SQL Editor (o `psql`), ejecuta **en orden** los scripts de `neon/migrations/`:

1. `001_initial_schema.sql`
2. `002_app_users.sql`
3. `003_remove_cooked_meat_catalog.sql` (si aplica)
4. `004_food_aliases_expand.sql` (si aplica)
5. `005_expand_food_catalog_nutrition.sql`
6. `006_food_catalog_macro_audit.sql` (si aplica)
7. `007_recalc_stored_macros_from_catalog.sql` (tras catálogo coherente)
8. `008_add_eaten_to_meal_entry_items.sql`
9. `009_add_custom_foods.sql`
10. `010_add_recipes.sql`
11. `011_allow_multiple_weight_per_day.sql`
12. `012_add_water_logs.sql`
13. `013_subscription_tier_usage.sql` (tier free/premium en `profiles`, `user_feature_usage`)

Seeds opcionales: `neon/seed/seed_foods.sql` o `neon/seed/food_catalog_seed_postgres_2729.sql` según necesites volumen de catálogo.

El acceso a la base lo hace solo el backend con `DATABASE_URL`.

### 3. Backend

```bash
cd backend
py -3.12 -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

# Variables en .env raíz o en backend/.env (app lee ambos)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API: `http://localhost:8000` — documentación interactiva: `http://localhost:8000/docs`.

### 4. Mobile

```bash
cd mobile
cp .env.example .env
# Editar .env: EXPO_PUBLIC_API_URL = IP LAN del PC si usas Expo Go

npm install
npx expo start
```

**Expo Go en dispositivo físico:** en `.env` define `EXPO_PUBLIC_API_URL=http://TU_IP_LAN:8000`, el backend con `--host 0.0.0.0`, y reinicia el bundler (`npx expo start -c`) si cambias la URL.

Las fotos pueden enviarse como **multipart** a `/api/v1/nutrition/photo/analyze` o en base64 al flujo `/api/v1/foods/analyze-photo`, según implementación del cliente.

## API (resumen)

La lista canónica y los esquemas están en **OpenAPI** (`/docs`). Rutas principales bajo `/api/v1`:

| Área | Métodos y rutas (ejemplos) |
|------|----------------------------|
| **Auth** | `POST /auth/register`, `POST /auth/login` |
| **Perfil y ajustes** | `GET|PUT /me/profile`, `GET|PUT /me/settings`, `GET|PUT /me/targets`, `GET /me/goal`, `PUT /me/goal/weights`, `PUT /me/goal/activity-level`, `PUT /me/goal/recalculate` |
| **Avatar** | `POST /me/avatar`, `GET /me/avatar/{id}`, `DELETE /me/avatar` |
| **Onboarding** | `POST /onboarding/complete` |
| **Foods (legado/compat)** | `POST /foods/search`, `POST /foods/analyze-photo` |
| **Nutrición unificada** | `GET /nutrition/search`, `GET /nutrition/barcode/{code}`, `POST /nutrition/photo/analyze`, `POST /nutrition/confirm` |
| **Comidas** | `POST /meals/confirm`, `POST /meals/parse-text`, `GET|PATCH|DELETE /meals/{id}`, `PATCH /meals/{id}/items/{item_id}` (eaten), comidas guardadas y CRUD **custom-foods** y **recipes** bajo `/meals/...` |
| **Diario** | `GET /diary/day`, `GET /diary/month-summary`, `GET /diary/recent-meals` |
| **Progreso** | `GET /progress/summary` (incl. racha), `POST /progress/weight`, `GET /progress/weight-history`, `POST /progress/activity`, `PUT|GET /progress/water`, `GET /progress/plateau` |
| **Planes** | `GET /plans/current`, `GET /plans/history`, `POST /plans/generate`, `POST /plans/manual`, `GET|PATCH|DELETE /plans/{id}`, activar, etiqueta, edición de comidas/alimentos, orden del día, lista de compra… |
| **Chat** | `POST /chat/message`, `GET /chat/sessions`, `GET /chat/sessions/{id}`, `POST|GET /chat/insights` |
| **Insignias (usuario)** | `GET /me/badges/catalog`, `GET /me/badges/featured`, `PUT /me/badges/featured`, `GET /me/badges/media/{id}`, … (ver OpenAPI) |
| **Insignias (admin)** | CRUD y subida bajo `/admin/badges/*` (autenticación por API key) |

Health: `GET /health`.

## Flujo demo recomendado

1. Registrarse y completar onboarding.
2. Revisar el inicio/diario con objetivos y **racha**.
3. Añadir comida por búsqueda, **código de barras** o foto.
4. Probar **receta** o comida guardada.
5. Generar (o editar) un **plan** y abrir la **lista de la compra**.
6. Chatear con el coach (opcional: imagen en el mensaje).
7. Registrar **peso** y **agua**; revisar historial y resumen de progreso.
8. Subir **avatar** desde perfil; abrir **insignias** y comprobar catálogo / destacadas.

## Tests

```bash
cd backend
.venv\Scripts\python -m pytest -v
```

En Windows PowerShell; en Unix: `source .venv/bin/activate && pytest -v` (desde `backend/`; tests en `tests/`).

## Stack

- **Frontend**: Expo, React Native, TypeScript, Expo Router, TanStack Query, Zustand, Zod
- **Backend**: FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, SlowAPI, aiofiles
- **DB**: PostgreSQL (Neon recomendado en la nube)
- **Auth**: JWT propio (`app_users`)
- **IA**: Groq (visión, chat, JSON estructurado, tool calling)
- **Nutrición**: Open Food Facts, catálogo local, FatSecret opcional

## Licencia

Proyecto privado.
