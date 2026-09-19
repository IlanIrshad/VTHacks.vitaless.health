-- Tiger Data / TimescaleDB schema for biometric time-series logging.
-- Run once via `npm run db:init`, or paste into your Tiger Data console.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS biometric_samples (
    time                    TIMESTAMPTZ       NOT NULL DEFAULT now(),
    user_id                 TEXT              NOT NULL,
    heart_rate_bpm          DOUBLE PRECISION,
    respiration_rate_bpm    DOUBLE PRECISION,
    stress_level            DOUBLE PRECISION, -- 0-1
    focus_level             DOUBLE PRECISION, -- 0-1
    energy_level            DOUBLE PRECISION, -- 0-1
    source                  TEXT              NOT NULL DEFAULT 'simulated', -- 'presage' | 'simulated'
    routine_id              TEXT
);

-- Turns the table into a hypertable partitioned on time — this is the
-- Tiger Data / TimescaleDB feature that makes high-frequency biometric
-- inserts and range queries fast at scale.
SELECT create_hypertable('biometric_samples', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_biometric_samples_user_time
    ON biometric_samples (user_id, time DESC);

-- Example continuous aggregate for a live "stress over the last hour"
-- dashboard tile — a Tiger Data feature called out directly in the sponsor
-- rubric. Materializes 1-minute averages incrementally instead of scanning
-- raw rows on every dashboard refresh.
CREATE MATERIALIZED VIEW IF NOT EXISTS biometric_samples_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    user_id,
    avg(heart_rate_bpm) AS avg_heart_rate_bpm,
    avg(stress_level) AS avg_stress_level,
    avg(focus_level) AS avg_focus_level,
    avg(energy_level) AS avg_energy_level
FROM biometric_samples
GROUP BY bucket, user_id
WITH NO DATA;

-- REQUIRED: without a refresh policy the view above materializes nothing, ever,
-- and the trends view renders permanently empty. This job incrementally
-- materializes 1-minute buckets once a minute.
SELECT add_continuous_aggregate_policy('biometric_samples_1min',
    start_offset      => INTERVAL '1 hour',
    end_offset        => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists     => TRUE);

-- NOTE: anything shown live during the demo should query the raw hypertable,
-- not this aggregate. Whether un-materialized recent rows appear here depends on
-- the `materialized_only` setting, whose default has changed between TimescaleDB
-- versions -- don't let a 90-second demo depend on a background job having run.
