-- Free/Premium: tier en perfil y contadores de uso (visión, regeneración semanal)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS ck_profiles_subscription_tier;
ALTER TABLE profiles
  ADD CONSTRAINT ck_profiles_subscription_tier
  CHECK (subscription_tier IN ('free', 'premium'));

CREATE TABLE IF NOT EXISTS user_feature_usage (
  user_id TEXT NOT NULL,
  metric VARCHAR(32) NOT NULL,
  period_key VARCHAR(32) NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, metric, period_key)
);

CREATE INDEX IF NOT EXISTS ix_user_feature_usage_user_metric
  ON user_feature_usage (user_id, metric);
