CREATE TABLE IF NOT EXISTS watchlists (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callsign    VARCHAR(10),
    icao24      VARCHAR(6),
    label       VARCHAR(100),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_watchlist_target CHECK (callsign IS NOT NULL OR icao24 IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlists(user_id);
