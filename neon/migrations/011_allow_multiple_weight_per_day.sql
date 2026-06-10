ALTER TABLE weight_logs DROP CONSTRAINT IF EXISTS uq_weight_log_user_date;
ALTER TABLE weight_logs DROP CONSTRAINT IF EXISTS weight_logs_user_id_date_key;
CREATE INDEX IF NOT EXISTS ix_weight_log_user_date ON weight_logs(user_id, date);
