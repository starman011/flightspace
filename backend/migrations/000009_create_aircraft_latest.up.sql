-- One row per aircraft — always reflects the latest known position.
-- This replaces the append-only aircraft_positions write in the hot poll loop,
-- bounding table size to ~10k rows regardless of poll frequency.
CREATE TABLE IF NOT EXISTS aircraft_latest (
    icao24          TEXT        NOT NULL PRIMARY KEY,
    callsign        TEXT,
    longitude       DOUBLE PRECISION,
    latitude        DOUBLE PRECISION,
    baro_altitude   DOUBLE PRECISION,
    velocity        DOUBLE PRECISION,
    heading         DOUBLE PRECISION,
    vertical_rate   DOUBLE PRECISION,
    on_ground       BOOLEAN     NOT NULL DEFAULT FALSE,
    time_position   TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for bounding-box queries used by the aircraft search endpoint
CREATE INDEX IF NOT EXISTS aircraft_latest_latlon
    ON aircraft_latest (latitude, longitude);
