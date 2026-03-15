CREATE TABLE IF NOT EXISTS flight_view_history (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    icao24      VARCHAR(6) NOT NULL,
    callsign    VARCHAR(10),
    viewed_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_user ON flight_view_history(user_id, viewed_at DESC);
