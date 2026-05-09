-- Persisted flight trails — archived from Redis when aircraft departs.
-- Stores the full trail as a JSONB array of {lat, lon, alt, ts} points.
-- Enables "yesterday's path" and historical playback for any tracked flight.

CREATE TABLE IF NOT EXISTS flight_trails (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    icao24      VARCHAR(6)  NOT NULL,
    callsign    VARCHAR(10),
    trail       JSONB       NOT NULL,       -- [{lat,lon,alt,ts}, ...]
    point_count INT         NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL,       -- timestamp of first trail point
    ended_at    TIMESTAMPTZ NOT NULL,       -- timestamp of last trail point
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Query by aircraft + time range
CREATE INDEX idx_flight_trails_icao24_ended ON flight_trails (icao24, ended_at DESC);

-- Cleanup old trails (retention policy)
CREATE INDEX idx_flight_trails_created ON flight_trails (created_at);
