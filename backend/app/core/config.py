from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "INFO"
    secret_key: str = "change-me-in-production"

    jwt_secret: str = ""
    database_url: str = ""

    # Groq (OpenAI-compatible): https://console.groq.com
    groq_api_key: str = ""
    # Varias claves (p. ej. 4 cuentas free tier), separadas por coma; si hay varias, se rotan ante 429/cuota.
    # Máximo 4 se usan en código. Si vacío, solo cuenta GROQ_API_KEY.
    groq_api_keys: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_chat_model: str = "llama-3.3-70b-versatile"
    # Planes JSON: 8B suele usarse en free tier; el límite efectivo prompt+max_tokens es bajo (~6k).
    groq_plan_model: str = "llama-3.1-8b-instant"
    # Tope de salida por petición (bajar si Groq devuelve 413 Payload Too Large).
    # Salida por día; 1536 suele bastar para 4 comidas; sube si ves finish_reason=length.
    groq_plan_max_output_tokens: int = 1536
    # Una sola llamada para 7 días suele truncarse y gastar TPM en free tier; por defecto desactivado.
    groq_plan_try_single_week_call: bool = False
    # Tras un intento fallido o para respetar TPM: pausa antes del 1er día y entre días.
    groq_plan_delay_before_days_seconds: float = 4.0
    groq_plan_delay_between_days_seconds: float = 3.0
    # Pausa tras cada respuesta Groq al generar plan (free tier ~6000 TPM).
    groq_plan_throttle_after_call_seconds: float = 8.0
    groq_vision_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"

    # --- Nutrition providers ---
    fatsecret_client_id: str = ""
    fatsecret_client_secret: str = ""
    logmeal_api_key: str = ""
    off_user_agent: str = "NutrIA/1.0 (contact: dev; +https://github.com/nutriforce)"
    off_api_base_url: str = "https://world.openfoodfacts.org"
    nutrition_timeout_ms: int = 10000
    nutrition_cache_ttl_seconds: int = 3600

    # Backend
    backend_url: str = "http://localhost:8000"
    cors_origins: str = ""
    # Rate limiting (slowapi); desactivar en tests con RATE_LIMIT_ENABLED=false
    rate_limit_enabled: bool = True
    # Si True, la clave de rate limit usa el primer IP válido de X-Forwarded-For.
    # Activar solo detrás de reverse proxy (nginx, cloudflare) que fije la cabecera
    # y no permita que el cliente la falsifique directamente.
    rate_limit_trust_x_forwarded_for: bool = False

    # Email / recuperacion de contrasena
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_starttls: bool = True
    smtp_use_tls: bool = False
    password_reset_url: str = "http://localhost:8081/auth/reset-password"
    password_reset_token_minutes: int = 30
    email_verification_url: str = "http://localhost:8080/auth/verify-email"
    email_verification_token_minutes: int = 1440

    # Social login
    google_oauth_client_ids: str = ""
    apple_client_ids: str = "com.siwebai.nutria"

    # Free vs Premium: Free tiene cupos de producto; Premium no tiene cupos de producto.
    free_chat_user_messages_per_month: int = 10
    free_recipe_recommendations_per_day: int = 12
    free_vision_analyses_per_month: int = 1
    free_plan_regenerations_per_week: int = 1
    # Lista opcional de user_id (Supabase) tratados como Premium en dev sin tocar la BD
    nutriforce_premium_override_user_ids: str = ""
    # Correos extra tratados como Premium sin tocar la BD (coma); comparación case-insensitive.
    nutriforce_premium_override_emails: str = ""

    # Insignias — admin y anti-abuso
    badges_admin_api_key: str = ""
    badge_daily_cap_barcode_scan: int = 10
    badge_daily_cap_photo_analyze: int = 10
    badge_daily_cap_food_search: int = 10
    badge_daily_cap_nutrition_search: int = 10
    badge_complete_day_min_minutes_between_meals: int = 90
    badge_streak_grace_days_after_calendar_day: int = 1

    model_config = {"env_file": [".env", "../.env"], "extra": "ignore"}


_INSECURE_SECRET_DEFAULTS = {"", "change-me-in-production"}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment.lower() == "production":
        signing_secret = (settings.jwt_secret or settings.secret_key or "").strip()
        if signing_secret in _INSECURE_SECRET_DEFAULTS:
            raise RuntimeError(
                "JWT_SECRET (o SECRET_KEY) debe configurarse con un valor fuerte en produccion: "
                "lo usan la firma de tokens y de URLs de avatar."
            )
    return settings
