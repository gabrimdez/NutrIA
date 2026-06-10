-- 012: Tabla water_logs para tracking de vasos de agua diarios
CREATE TABLE IF NOT EXISTS water_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT NOT NULL,
    date        DATE NOT NULL,
    glasses     INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_water_log_user_date ON water_logs (user_id, date);
CREATE INDEX IF NOT EXISTS ix_water_logs_user_id ON water_logs (user_id);
