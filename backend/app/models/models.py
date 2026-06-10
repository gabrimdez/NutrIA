import uuid
from datetime import datetime, date, timezone
from sqlalchemy import (
    Column, String, Float, Integer, Boolean, Text, DateTime, Date,
    ForeignKey, JSON, Enum as SAEnum, UniqueConstraint, Index, PrimaryKeyConstraint, LargeBinary
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_naive() -> datetime:
    """Naive UTC instant for DateTime (TIMESTAMP WITHOUT TIME ZONE); asyncpg rejects aware values there."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class GoalType(str, enum.Enum):
    LOSE_FAT = "lose_fat"
    MAINTAIN = "maintain"
    GAIN_MUSCLE = "gain_muscle"
    RECOMPOSITION = "recomposition"


class TrainingType(str, enum.Enum):
    STRENGTH = "strength"
    HYPERTROPHY = "hypertrophy"
    MIXED = "mixed"


class ActivityLevel(str, enum.Enum):
    SEDENTARY = "sedentary"
    LIGHT = "light"
    MODERATE = "moderate"
    ACTIVE = "active"
    VERY_ACTIVE = "very_active"


class MealType(str, enum.Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class Sex(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"


class Confidence(str, enum.Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Profile(Base):
    __tablename__ = "profiles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, unique=True, nullable=False, index=True)
    display_name = Column(String(100))
    avatar_url = Column(String(500))
    sex = Column(SAEnum(Sex, native_enum=False, length=10))
    birth_year = Column(Integer)
    height_cm = Column(Float)
    current_weight_kg = Column(Float)
    onboarding_completed = Column(Boolean, default=False)
    subscription_tier = Column(String(20), nullable=False, default="free")
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)
    
    preferences = relationship("UserPreference", back_populates="profile", uselist=False)
    goals = relationship("Goal", back_populates="profile")


class UserPreference(Base):
    __tablename__ = "user_preferences"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), unique=True, nullable=False)
    dietary_preferences = Column(JSON, default=list)  # ["vegetarian", "mediterranean", etc.]
    disliked_foods = Column(JSON, default=list)  # ["salmon", "broccoli"]
    allergies = Column(JSON, default=list)  # ["gluten", "lactose"]
    intolerances = Column(JSON, default=list)  # ["lactosa", "fructosa"]
    forbidden_foods = Column(JSON, default=list)  # ["cerdo", "marisco"]
    active_injuries = Column(JSON, default=list)  # [{zone, severity, notes}]
    preferred_meals_per_day = Column(Integer, default=4)
    plan_preferences = Column(JSON, default=dict)
    notification_preferences = Column(JSON, default=dict)
    integration_preferences = Column(JSON, default=dict)
    integration_status = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)
    
    profile = relationship("Profile", back_populates="preferences")


class Goal(Base):
    __tablename__ = "goals"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    goal_type = Column(SAEnum(GoalType, native_enum=False, length=20), nullable=False)
    target_weight_kg = Column(Float, nullable=True)
    activity_level = Column(SAEnum(ActivityLevel, native_enum=False, length=20), nullable=False)
    training_days_per_week = Column(Integer, default=4)
    training_type = Column(
        SAEnum(TrainingType, native_enum=False, length=20), default=TrainingType.HYPERTROPHY
    )
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now_naive)
    
    profile = relationship("Profile", back_populates="goals")
    daily_targets = relationship("DailyTarget", back_populates="goal")


class DailyTarget(Base):
    __tablename__ = "daily_targets"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    goal_id = Column(UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, nullable=False, index=True)
    calories_kcal = Column(Float, nullable=False)
    protein_g = Column(Float, nullable=False)
    carbs_g = Column(Float, nullable=False)
    fat_g = Column(Float, nullable=False)
    steps_target = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now_naive)
    rationale = Column(Text, nullable=True)
    
    goal = relationship("Goal", back_populates="daily_targets")


class FoodCatalog(Base):
    __tablename__ = "food_catalog"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(50), nullable=False, default="generic")  # generic, barcode, usda, bedca
    external_id = Column(String(100), nullable=True)
    barcode = Column(String(50), nullable=True, index=True)
    name = Column(String(300), nullable=False)
    name_es = Column(String(300), nullable=True)
    category = Column(String(100), nullable=True)
    kcal_per_100g = Column(Float, nullable=False)
    protein_per_100g = Column(Float, nullable=False)
    carbs_per_100g = Column(Float, nullable=False)
    fat_per_100g = Column(Float, nullable=False)
    fiber_per_100g = Column(Float, nullable=True)
    serving_size_g = Column(Float, nullable=True)
    serving_description = Column(String(200), nullable=True)
    is_verified = Column(Boolean, default=False)
    source_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)
    
    __table_args__ = (
        Index("ix_food_catalog_name_trgm", "name"),
        Index("ix_food_catalog_provider_ext", "provider", "external_id"),
    )
    
    aliases = relationship("FoodAlias", back_populates="food")


class FoodAlias(Base):
    __tablename__ = "food_aliases"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    food_id = Column(UUID(as_uuid=True), ForeignKey("food_catalog.id", ondelete="CASCADE"), nullable=False)
    alias = Column(String(300), nullable=False, index=True)
    language = Column(String(5), default="es")
    
    food = relationship("FoodCatalog", back_populates="aliases")


class MealEntry(Base):
    __tablename__ = "meal_entries"
    __table_args__ = (
        Index("ix_meal_entries_user_date", "user_id", "date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    meal_type = Column(SAEnum(MealType, native_enum=False, length=20), nullable=False)
    title = Column(String(200), nullable=True)
    photo_url = Column(String(500), nullable=True)
    total_kcal = Column(Float, nullable=False, default=0)
    total_protein_g = Column(Float, nullable=False, default=0)
    total_carbs_g = Column(Float, nullable=False, default=0)
    total_fat_g = Column(Float, nullable=False, default=0)
    ai_confidence = Column(SAEnum(Confidence, native_enum=False, length=10), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)
    
    items = relationship("MealEntryItem", back_populates="meal_entry", cascade="all, delete-orphan")


class MealEntryItem(Base):
    __tablename__ = "meal_entry_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meal_entry_id = Column(UUID(as_uuid=True), ForeignKey("meal_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    food_catalog_id = Column(UUID(as_uuid=True), ForeignKey("food_catalog.id"), nullable=True)
    custom_name = Column(String(200), nullable=True)
    grams = Column(Float, nullable=False)
    kcal = Column(Float, nullable=False)
    protein_g = Column(Float, nullable=False)
    carbs_g = Column(Float, nullable=False)
    fat_g = Column(Float, nullable=False)
    source = Column(String(50), nullable=True)
    eaten = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utc_now_naive)
    
    meal_entry = relationship("MealEntry", back_populates="items")


class SavedMeal(Base):
    __tablename__ = "saved_meals"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    total_kcal = Column(Float, nullable=False)
    total_protein_g = Column(Float, nullable=False)
    total_carbs_g = Column(Float, nullable=False)
    total_fat_g = Column(Float, nullable=False)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)
    
    items = relationship("SavedMealItem", back_populates="saved_meal", cascade="all, delete-orphan")


class SavedMealItem(Base):
    __tablename__ = "saved_meal_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    saved_meal_id = Column(UUID(as_uuid=True), ForeignKey("saved_meals.id", ondelete="CASCADE"), nullable=False)
    food_catalog_id = Column(UUID(as_uuid=True), ForeignKey("food_catalog.id"), nullable=True)
    custom_name = Column(String(200), nullable=True)
    grams = Column(Float, nullable=False)
    kcal = Column(Float, nullable=False)
    protein_g = Column(Float, nullable=False)
    carbs_g = Column(Float, nullable=False)
    fat_g = Column(Float, nullable=False)
    
    saved_meal = relationship("SavedMeal", back_populates="items")


class CustomFood(Base):
    __tablename__ = "custom_foods"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    kcal_per_100g = Column(Float, nullable=False)
    protein_per_100g = Column(Float, nullable=False)
    carbs_per_100g = Column(Float, nullable=False)
    fat_per_100g = Column(Float, nullable=False)
    icon = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)


class Recipe(Base):
    __tablename__ = "recipes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    servings = Column(Integer, nullable=False, default=1)
    total_weight_g = Column(Float, nullable=False, default=0)
    total_kcal = Column(Float, nullable=False, default=0)
    total_protein_g = Column(Float, nullable=False, default=0)
    total_carbs_g = Column(Float, nullable=False, default=0)
    total_fat_g = Column(Float, nullable=False, default=0)
    icon = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)

    items = relationship("RecipeItem", back_populates="recipe", cascade="all, delete-orphan")


class RecipeItem(Base):
    __tablename__ = "recipe_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False)
    food_catalog_id = Column(UUID(as_uuid=True), ForeignKey("food_catalog.id"), nullable=True)
    custom_name = Column(String(200), nullable=True)
    grams = Column(Float, nullable=False)
    kcal = Column(Float, nullable=False)
    protein_g = Column(Float, nullable=False)
    carbs_g = Column(Float, nullable=False)
    fat_g = Column(Float, nullable=False)

    recipe = relationship("Recipe", back_populates="items")


class DietPlan(Base):
    __tablename__ = "diet_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "version", name="uq_diet_plans_user_version"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, default=True)
    target_kcal = Column(Float, nullable=False)
    target_protein_g = Column(Float, nullable=False)
    target_carbs_g = Column(Float, nullable=False)
    target_fat_g = Column(Float, nullable=False)
    rationale = Column(Text, nullable=True)
    change_reason = Column(Text, nullable=True)
    caveats = Column(JSON, default=list)
    created_at = Column(DateTime, default=utc_now_naive)
    label = Column(String(200), nullable=True)

    days = relationship("DietPlanDay", back_populates="plan", cascade="all, delete-orphan")


class DietPlanDay(Base):
    __tablename__ = "diet_plan_days"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("diet_plans.id", ondelete="CASCADE"), nullable=False)
    day_number = Column(Integer, nullable=False)  # 1-7
    day_label = Column(String(20), nullable=True)  # "Lunes", "Martes"...
    
    meals = relationship(
        "DietPlanMeal",
        back_populates="day",
        cascade="all, delete-orphan",
        order_by="DietPlanMeal.display_order",
    )
    plan = relationship("DietPlan", back_populates="days")


class DietPlanMeal(Base):
    __tablename__ = "diet_plan_meals"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    day_id = Column(UUID(as_uuid=True), ForeignKey("diet_plan_days.id", ondelete="CASCADE"), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    meal_type = Column(SAEnum(MealType, native_enum=False, length=20), nullable=False)
    title = Column(String(200), nullable=False)
    foods = Column(JSON, nullable=False, default=list)  # [{name, grams, kcal, protein_g, carbs_g, fat_g}]
    total_kcal = Column(Float, nullable=False)
    total_protein_g = Column(Float, nullable=False)
    total_carbs_g = Column(Float, nullable=False)
    total_fat_g = Column(Float, nullable=False)
    
    day = relationship("DietPlanDay", back_populates="meals")


class ShoppingList(Base):
    __tablename__ = "shopping_lists"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    plan_id = Column(UUID(as_uuid=True), ForeignKey("diet_plans.id"), nullable=True)
    name = Column(String(200), default="Lista de la compra")
    created_at = Column(DateTime, default=utc_now_naive)
    
    items = relationship("ShoppingListItem", back_populates="shopping_list", cascade="all, delete-orphan")


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shopping_list_id = Column(UUID(as_uuid=True), ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False)
    food_name = Column(String(200), nullable=False)
    quantity = Column(String(100), nullable=True)
    category = Column(String(100), nullable=True)
    checked = Column(Boolean, default=False)
    
    shopping_list = relationship("ShoppingList", back_populates="items")


class WeightLog(Base):
    __tablename__ = "weight_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    weight_kg = Column(Float, nullable=False)
    date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    
    __table_args__ = (
        Index("ix_weight_log_user_date", "user_id", "date"),
    )


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    __table_args__ = (
        Index("ix_activity_logs_user_date", "user_id", "date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    date = Column(Date, nullable=False)
    steps = Column(Integer, nullable=True)
    training_type = Column(String(50), nullable=True)
    training_duration_min = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    estimated_burn_kcal = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)


class WaterLog(Base):
    __tablename__ = "water_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    date = Column(Date, nullable=False)
    glasses = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)

    __table_args__ = (
        Index("uq_water_log_user_date", "user_id", "date", unique=True),
    )


class UserFeatureUsage(Base):
    """Contadores por periodo para cupos Free (visión mensual, regeneración semanal)."""

    __tablename__ = "user_feature_usage"
    __table_args__ = (
        PrimaryKeyConstraint("user_id", "metric", "period_key", name="pk_user_feature_usage"),
    )

    user_id = Column(String, nullable=False)
    metric = Column(String(32), nullable=False)
    period_key = Column(String(32), nullable=False)
    used = Column(Integer, nullable=False, default=0)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    title = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)
    
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # user, assistant, system, tool
    content = Column(Text, nullable=False)
    tool_calls = Column(JSON, nullable=True)
    tool_results = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    
    session = relationship("ChatSession", back_populates="messages")


class CoachSavedInsight(Base):
    """Texto guardado por el usuario como insight / recomendación del coach."""

    __tablename__ = "coach_saved_insights"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    body = Column(Text, nullable=False)
    source_chat_message_id = Column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime, default=utc_now_naive)


class AiSafetyEvent(Base):
    __tablename__ = "ai_safety_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    event_type = Column(String(50), nullable=False)  # blocked_topic, validation_fail, extreme_value
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)


class AppUser(Base):
    __tablename__ = "app_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)
    token_version = Column(Integer, nullable=False, default=0)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class AuthIdentity(Base):
    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_subject", name="uq_auth_identities_provider_subject"),
        Index("ix_auth_identities_user_id", "user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(20), nullable=False)
    provider_subject = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class AuthRefreshToken(Base):
    __tablename__ = "auth_refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    token_version = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    replaced_by_hash = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    last_used_at = Column(DateTime(timezone=True), nullable=True)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("app_users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class AccountRateLimit(Base):
    __tablename__ = "account_rate_limits"

    key = Column(String(255), primary_key=True)
    window_start = Column(DateTime(timezone=True), nullable=False)
    count = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class ProfileAvatar(Base):
    __tablename__ = "profile_avatars"

    asset_id = Column(String(32), primary_key=True)
    user_id = Column(String, nullable=False, unique=True, index=True)
    mime_type = Column(String(50), nullable=False)
    data = Column(LargeBinary, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class ProviderSyncLog(Base):
    __tablename__ = "provider_sync_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False)  # started, completed, failed
    records_processed = Column(Integer, default=0)
    errors = Column(JSON, nullable=True)
    started_at = Column(DateTime, default=utc_now_naive)
    completed_at = Column(DateTime, nullable=True)


class BadgeRarity(str, enum.Enum):
    COMUN = "comun"
    RARA = "rara"
    EPICA = "epica"
    LEGENDARIA = "legendaria"


class BadgeCategory(str, enum.Enum):
    HABITOS = "habitos"
    PLANIFICACION = "planificacion"
    DIARIO = "diario"
    CONSTANCIA = "constancia"
    PROGRESO_CORPORAL = "progreso_corporal"
    EXPLORACION = "exploracion"
    COACH_IA = "coach_ia"


class BadgeSource(str, enum.Enum):
    SYSTEM = "system"
    MANUAL = "manual"


def _enum_values(cls: type[enum.Enum]) -> list[str]:
    """Persistir valores PEP-435 ('comun'), no nombres de miembro ('COMUN')."""
    return [str(m.value) for m in cls]


class BadgeDefinition(Base):
    __tablename__ = "badge_definitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    badge_id = Column(String(80), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    unlock_criteria_text = Column(Text, nullable=False)
    image_url = Column(String(500), nullable=True)
    rarity = Column(
        SAEnum(BadgeRarity, native_enum=False, length=20, values_callable=_enum_values),
        nullable=False,
    )
    category = Column(
        SAEnum(BadgeCategory, native_enum=False, length=30, values_callable=_enum_values),
        nullable=False,
    )
    unlock_rule = Column(JSON, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)


class UserBadge(Base):
    __tablename__ = "user_badges"
    __table_args__ = (
        UniqueConstraint("user_id", "badge_definition_id", name="uq_user_badges_user_badge"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    badge_definition_id = Column(
        UUID(as_uuid=True), ForeignKey("badge_definitions.id", ondelete="CASCADE"), nullable=False
    )
    unlocked_at = Column(DateTime, nullable=True)
    source = Column(
        SAEnum(BadgeSource, native_enum=False, length=20, values_callable=_enum_values),
        nullable=False,
        default=BadgeSource.SYSTEM,
    )
    progress_snapshot = Column(JSON, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    revoke_reason = Column(Text, nullable=True)

    definition = relationship("BadgeDefinition")


class UserFeaturedBadge(Base):
    __tablename__ = "user_featured_badges"
    __table_args__ = (
        UniqueConstraint("user_id", "position", name="uq_user_featured_badges_user_pos"),
        UniqueConstraint("user_id", "badge_definition_id", name="uq_user_featured_badges_user_badge"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    badge_definition_id = Column(
        UUID(as_uuid=True), ForeignKey("badge_definitions.id", ondelete="CASCADE"), nullable=False
    )
    position = Column(Integer, nullable=False)

    definition = relationship("BadgeDefinition")


class BadgeAuditLog(Base):
    __tablename__ = "badge_audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor = Column(String(50), nullable=False)
    action = Column(String(80), nullable=False)
    user_id = Column(String, nullable=True, index=True)
    badge_definition_id = Column(
        UUID(as_uuid=True), ForeignKey("badge_definitions.id", ondelete="SET NULL"), nullable=True
    )
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)


class BadgeReviewFlag(Base):
    __tablename__ = "badge_review_flags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    badge_definition_id = Column(
        UUID(as_uuid=True), ForeignKey("badge_definitions.id", ondelete="SET NULL"), nullable=True
    )
    reason = Column(String(200), nullable=False)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    resolved_at = Column(DateTime, nullable=True)


class BadgeActionLedger(Base):
    """Acciones elegibles tras anti-abuso (dedupe, caps diarios)."""

    __tablename__ = "badge_action_ledger"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "action_kind", "minute_bucket", "fingerprint",
            name="uq_badge_action_ledger_dedupe",
        ),
        Index("ix_badge_action_ledger_user_day", "user_id", "action_kind", "day_utc"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    action_kind = Column(String(40), nullable=False)
    minute_bucket = Column(DateTime, nullable=False)
    day_utc = Column(Date, nullable=False)
    fingerprint = Column(String(128), nullable=False, default="")
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)


# ---------------------------------------------------------------------------
# Workout tracking
# ---------------------------------------------------------------------------

class WorkoutCategory(str, enum.Enum):
    GYM = "gym"
    OTHER = "other"


class WorkoutRoutine(Base):
    __tablename__ = "workout_routines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    category = Column(SAEnum(WorkoutCategory, native_enum=False, length=10), nullable=False)
    sport_type = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    days_per_week = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)

    days = relationship("WorkoutRoutineDay", back_populates="routine", cascade="all, delete-orphan",
                        order_by="WorkoutRoutineDay.display_order")
    sessions = relationship("WorkoutSession", back_populates="routine")


class WorkoutRoutineDay(Base):
    __tablename__ = "workout_routine_days"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    routine_id = Column(UUID(as_uuid=True), ForeignKey("workout_routines.id", ondelete="CASCADE"), nullable=False)
    weekday = Column(Integer, nullable=False)
    label = Column(String(100), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)

    routine = relationship("WorkoutRoutine", back_populates="days")
    exercises = relationship("WorkoutRoutineExercise", back_populates="routine_day", cascade="all, delete-orphan",
                             order_by="WorkoutRoutineExercise.display_order")
    sessions = relationship("WorkoutSession", back_populates="routine_day")


class WorkoutRoutineExercise(Base):
    __tablename__ = "workout_routine_exercises"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    routine_day_id = Column(UUID(as_uuid=True), ForeignKey("workout_routine_days.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    default_sets = Column(Integer, nullable=True)
    default_reps = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)

    routine_day = relationship("WorkoutRoutineDay", back_populates="exercises")


class WorkoutSession(Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        Index("ix_workout_sessions_user_date", "user_id", "date"),
        Index("ix_workout_sessions_user_category", "user_id", "category"),
        Index("ix_workout_sessions_user_completed", "user_id", "completed"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String, nullable=False, index=True)
    routine_id = Column(UUID(as_uuid=True), ForeignKey("workout_routines.id", ondelete="SET NULL"), nullable=True)
    routine_day_id = Column(UUID(as_uuid=True), ForeignKey("workout_routine_days.id", ondelete="SET NULL"), nullable=True)
    category = Column(SAEnum(WorkoutCategory, native_enum=False, length=10), nullable=False)
    date = Column(Date, nullable=False)
    weekday = Column(Integer, nullable=False)
    day_label = Column(String(100), nullable=True)
    sport_type = Column(String(100), nullable=True)
    free_text = Column(Text, nullable=True)
    completed = Column(Boolean, default=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now_naive)
    updated_at = Column(DateTime, default=utc_now_naive, onupdate=utc_now_naive)

    routine = relationship("WorkoutRoutine", back_populates="sessions")
    routine_day = relationship("WorkoutRoutineDay", back_populates="sessions")
    exercises = relationship("WorkoutSessionExercise", back_populates="session", cascade="all, delete-orphan",
                             order_by="WorkoutSessionExercise.display_order")


class WorkoutSessionExercise(Base):
    __tablename__ = "workout_session_exercises"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("workout_sessions.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)

    session = relationship("WorkoutSession", back_populates="exercises")
    sets = relationship("WorkoutExerciseSet", back_populates="exercise", cascade="all, delete-orphan",
                        order_by="WorkoutExerciseSet.set_number")


class WorkoutExerciseSet(Base):
    __tablename__ = "workout_exercise_sets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exercise_id = Column(UUID(as_uuid=True), ForeignKey("workout_session_exercises.id", ondelete="CASCADE"), nullable=False)
    set_number = Column(Integer, nullable=False)
    reps = Column(Integer, nullable=True)
    weight_kg = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)

    exercise = relationship("WorkoutSessionExercise", back_populates="sets")
