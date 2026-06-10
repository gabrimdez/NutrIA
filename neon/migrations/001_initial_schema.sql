-- NutrIA: Initial Schema
-- All tables use UUID primary keys to align with Supabase auth.users

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Profiles
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT UNIQUE NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    sex VARCHAR(10),
    birth_year INTEGER,
    height_cm REAL,
    current_weight_kg REAL,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);

-- User Preferences
CREATE TABLE user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    dietary_preferences JSONB DEFAULT '[]',
    disliked_foods JSONB DEFAULT '[]',
    allergies JSONB DEFAULT '[]',
    preferred_meals_per_day INTEGER DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Goals
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    goal_type VARCHAR(20) NOT NULL,
    target_weight_kg REAL,
    activity_level VARCHAR(20) NOT NULL,
    training_days_per_week INTEGER DEFAULT 4,
    training_type VARCHAR(20) DEFAULT 'hypertrophy',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily Targets
CREATE TABLE daily_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    calories_kcal REAL NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    steps_target INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    rationale TEXT
);

CREATE INDEX idx_daily_targets_user ON daily_targets(user_id);

-- Food Catalog
CREATE TABLE food_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL DEFAULT 'generic',
    external_id VARCHAR(100),
    barcode VARCHAR(50),
    name VARCHAR(300) NOT NULL,
    name_es VARCHAR(300),
    category VARCHAR(100),
    kcal_per_100g REAL NOT NULL,
    protein_per_100g REAL NOT NULL,
    carbs_per_100g REAL NOT NULL,
    fat_per_100g REAL NOT NULL,
    fiber_per_100g REAL,
    serving_size_g REAL,
    serving_description VARCHAR(200),
    is_verified BOOLEAN DEFAULT FALSE,
    source_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_food_catalog_name ON food_catalog USING gin (name gin_trgm_ops);
CREATE INDEX idx_food_catalog_name_es ON food_catalog USING gin (name_es gin_trgm_ops);
CREATE INDEX idx_food_catalog_barcode ON food_catalog(barcode);
CREATE INDEX idx_food_catalog_provider ON food_catalog(provider, external_id);

-- Food Aliases
CREATE TABLE food_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    food_id UUID NOT NULL REFERENCES food_catalog(id) ON DELETE CASCADE,
    alias VARCHAR(300) NOT NULL,
    language VARCHAR(5) DEFAULT 'es'
);

CREATE INDEX idx_food_aliases_alias ON food_aliases USING gin (alias gin_trgm_ops);

-- Meal Entries (immutable macros at save time)
CREATE TABLE meal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    meal_type VARCHAR(20) NOT NULL,
    title VARCHAR(200),
    photo_url VARCHAR(500),
    total_kcal REAL NOT NULL DEFAULT 0,
    total_protein_g REAL NOT NULL DEFAULT 0,
    total_carbs_g REAL NOT NULL DEFAULT 0,
    total_fat_g REAL NOT NULL DEFAULT 0,
    ai_confidence VARCHAR(10),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_meal_entries_user_date ON meal_entries(user_id, date);

-- Meal Entry Items (snapshot of macros)
CREATE TABLE meal_entry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meal_entry_id UUID NOT NULL REFERENCES meal_entries(id) ON DELETE CASCADE,
    food_catalog_id UUID REFERENCES food_catalog(id),
    custom_name VARCHAR(200),
    grams REAL NOT NULL,
    kcal REAL NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved Meals
CREATE TABLE saved_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name VARCHAR(200) NOT NULL,
    total_kcal REAL NOT NULL,
    total_protein_g REAL NOT NULL,
    total_carbs_g REAL NOT NULL,
    total_fat_g REAL NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_meals_user ON saved_meals(user_id);

CREATE TABLE saved_meal_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    saved_meal_id UUID NOT NULL REFERENCES saved_meals(id) ON DELETE CASCADE,
    food_catalog_id UUID REFERENCES food_catalog(id),
    custom_name VARCHAR(200),
    grams REAL NOT NULL,
    kcal REAL NOT NULL,
    protein_g REAL NOT NULL,
    carbs_g REAL NOT NULL,
    fat_g REAL NOT NULL
);

-- Diet Plans (versioned)
CREATE TABLE diet_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    target_kcal REAL NOT NULL,
    target_protein_g REAL NOT NULL,
    target_carbs_g REAL NOT NULL,
    target_fat_g REAL NOT NULL,
    rationale TEXT,
    change_reason TEXT,
    caveats JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_diet_plans_user ON diet_plans(user_id);

CREATE TABLE diet_plan_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES diet_plans(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    day_label VARCHAR(20)
);

CREATE TABLE diet_plan_meals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_id UUID NOT NULL REFERENCES diet_plan_days(id) ON DELETE CASCADE,
    meal_type VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    foods JSONB NOT NULL DEFAULT '[]',
    total_kcal REAL NOT NULL,
    total_protein_g REAL NOT NULL,
    total_carbs_g REAL NOT NULL,
    total_fat_g REAL NOT NULL
);

-- Shopping Lists
CREATE TABLE shopping_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    plan_id UUID REFERENCES diet_plans(id),
    name VARCHAR(200) DEFAULT 'Lista de la compra',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shopping_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    food_name VARCHAR(200) NOT NULL,
    quantity VARCHAR(100),
    category VARCHAR(100),
    checked BOOLEAN DEFAULT FALSE
);

-- Weight Logs
CREATE TABLE weight_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE INDEX idx_weight_logs_user ON weight_logs(user_id, date);

-- Activity Logs
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    steps INTEGER,
    training_type VARCHAR(50),
    training_duration_min INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_user ON activity_logs(user_id, date);

-- Chat Sessions
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    title VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);

-- Chat Messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    tool_calls JSONB,
    tool_results JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Safety Events
CREATE TABLE ai_safety_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Provider Sync Logs
CREATE TABLE provider_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    records_processed INTEGER DEFAULT 0,
    errors JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_food_catalog_updated_at BEFORE UPDATE ON food_catalog FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_meal_entries_updated_at BEFORE UPDATE ON meal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_saved_meals_updated_at BEFORE UPDATE ON saved_meals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
