# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
cd backend
source .venv/bin/activate          # macOS/Linux
# .venv\Scripts\activate           # Windows

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Tests
pytest                             # all tests
pytest tests/test_auth_password_reset.py          # single file
pytest tests/test_auth_password_reset.py::test_name  # single test
RATE_LIMIT_ENABLED=false pytest    # disable rate limiting in tests
```

### Mobile
```bash
cd mobile
npx expo start                     # interactive (scan QR with Expo Go)
npx expo start -c                  # clear cache (required after .env changes)
npm run typecheck                  # tsc --noEmit
npm run lint
npm run check                      # typecheck + lint
npm run test:wearables             # vitest (wearable unit tests only)
```

### Environment setup
```bash
cp .env.example .env               # root — used by backend
cd mobile && cp .env.example .env  # mobile — set EXPO_PUBLIC_API_URL
```

Minimum required vars: `DATABASE_URL` (postgresql+asyncpg://...), `JWT_SECRET` (≥32 chars), `GROQ_API_KEY`.

For Expo Go on a physical device: set `EXPO_PUBLIC_API_URL=http://<LAN_IP>:8000` and restart with `-c`.

---

## Architecture

```
/backend   FastAPI + Python (API, services, AI, rules, food providers)
/mobile    Expo + React Native + TypeScript
/neon      SQL migrations and seeds for production Postgres (Neon)
```

### Backend layout

```
app/
├── main.py              # FastAPI app, CORS, SlowAPI middleware, global error handlers
├── core/
│   ├── config.py        # Pydantic Settings (reads .env / ../.env), lru_cache singleton
│   ├── security.py      # JWT decode, get_current_user_id dependency, CSRF validation
│   └── rate_limit.py    # SlowAPI limiter; disabled when RATE_LIMIT_ENABLED=false
├── api/v1/
│   ├── router.py        # Mounts all endpoint routers under /api/v1
│   └── endpoints/       # One file per domain: auth, profile, avatar, meals, diary,
│                        #   foods, nutrition, plans, chat, progress, badges, workouts
├── models/models.py     # SQLAlchemy 2 declarative models (single file)
├── schemas/             # Pydantic v2 request/response schemas
├── repositories/        # Async DB access (SQLAlchemy). No business logic here.
├── services/            # Business logic. Calls repos; raises HTTPException.
├── ai/                  # Groq integration: chat_tools, diet_generator, photo_analyzer,
│                        #   training_suggestions, training_plan_modification, groq_client
├── rules/               # Deterministic business rules (BMR/TDEE/macros, chat scope,
│                        #   swap rules, allergy validation, plateau detection)
├── food_providers/      # Local catalog → FatSecret → Open Food Facts pipeline
└── db/session.py        # AsyncSession factory (get_db dependency)
```

### Mobile layout

```
mobile/
├── app/                 # Expo Router file-based screens
│   ├── (tabs)/          # Bottom tabs: index, diary, search, plan, chat, training
│   ├── auth/            # login.tsx, register.tsx
│   ├── add-meal/        # Multi-step meal add flow (search, photo, barcode, recipes…)
│   └── profile/         # Settings, goals, wearables
└── src/
    ├── lib/
    │   ├── api.ts        # Central HTTP client (fetch with timeout, 401 auto-refresh)
    │   └── authStorage.ts  # SecureStore (native) / AsyncStorage+cookies (web) abstraction
    ├── store/authStore.ts  # Zustand: session, user, isOnboarded
    ├── components/      # Reusable UI
    └── types/           # Shared TypeScript types
```

---

## Key patterns to know

### Authentication flow

Access tokens are short-lived JWTs (HS256, 15 min). Refresh tokens live 7 days (default) or 90 days (`remember_me=true`), are stored **hashed** in `auth_refresh_tokens`, and are **rotated on every use**.

A `token_version` field on `app_users` is incremented by `update_password_hash_and_bump_token_version()` whenever the password changes. Every access token embeds `tv` (token version); `get_current_user_id` rejects tokens whose `tv` doesn't match the DB — this is how all sessions are instantly invalidated on password change.

**Platform split:** native clients send `Authorization: Bearer <token>`. The web client uses `HttpOnly` cookies for tokens plus a double-submit CSRF cookie (`nutriforce_csrf_token` / `x-csrf-token` header). `get_current_user_id` handles both transparently.

**OAuth (Google/Apple):** `oauth_login()` in `auth_service.py` links an OIDC identity to an existing account by email **only if** `user.password_hash is None` — prevents silent account takeover against password-protected accounts.

### Protected endpoints

All endpoints that need an authenticated user declare:
```python
user_id: str = Depends(get_current_user_id)
```
`get_current_user_id` (in `core/security.py`) validates the JWT, checks `token_version`, and verifies `email_verified_at is not None`.

### AI layer

Three separate Groq models configurable via env:
- `GROQ_CHAT_MODEL` — NutriCoach chat + tool calling
- `GROQ_VISION_MODEL` — food photo analysis
- `GROQ_PLAN_MODEL` — diet plan generation (generates day-by-day; tunable delays for free tier TPM limits)

`groq_client.py` rotates across multiple keys (`GROQ_API_KEYS`, comma-separated) on 429 errors. All AI outputs are validated against Pydantic schemas. The `rules/` layer applies deterministic guardrails before and after AI calls.

### Subscription tiers

`profiles.subscription_tier` (`free` / `premium`). Usage is tracked per-period in `user_feature_usage`. Override specific users/emails to premium without DB changes via `NUTRIFORCE_PREMIUM_OVERRIDE_USER_IDS` / `NUTRIFORCE_PREMIUM_OVERRIDE_EMAILS` (dev only).

### Database migrations

Two parallel migration tracks:
- `neon/migrations/` — numbered SQL scripts applied manually on Neon / production Postgres
- `backend/alembic/versions/` — Alembic for local dev schema evolution

In development, run Alembic. On production (Neon), run the numbered SQL scripts in order.

### CORS

In development, the backend allows any LAN IP (regex covers 10.x, 192.168.x, 172.16-31.x) plus localhost:8080/19006. In production, `CORS_ORIGINS` must list explicit HTTPS origins; wildcards and non-HTTPS origins are rejected at startup.

OpenAPI docs (`/docs`, `/redoc`) are disabled in production automatically.

### Rate limiting

SlowAPI wraps individual endpoints with `@limit_if_enabled(...)`. Set `RATE_LIMIT_ENABLED=false` in the test environment. In production, set `RATE_LIMIT_TRUST_X_FORWARDED_FOR=true` only behind a trusted reverse proxy.
