-- Recreate aircraft_positions (partitioned, default partition only).
CREATE TABLE IF NOT EXISTS aircraft_positions (
    id              BIGSERIAL,
    icao24          VARCHAR(6) NOT NULL,
    callsign        VARCHAR(10),
    longitude       DOUBLE PRECISION NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    baro_altitude   DOUBLE PRECISION,
    geo_altitude    DOUBLE PRECISION,
    velocity        DOUBLE PRECISION,
    heading         DOUBLE PRECISION,
    vertical_rate   DOUBLE PRECISION,
    on_ground       BOOLEAN NOT NULL DEFAULT FALSE,
    origin_country  VARCHAR(50),
    squawk          INTEGER,
    position_source INTEGER DEFAULT 0,
    time_position   TIMESTAMP WITH TIME ZONE NOT NULL,
    received_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, received_at)
) PARTITION BY RANGE (received_at);

CREATE TABLE IF NOT EXISTS aircraft_positions_default
    PARTITION OF aircraft_positions DEFAULT;

CREATE INDEX IF NOT EXISTS idx_positions_icao24 ON aircraft_positions(icao24);
CREATE INDEX IF NOT EXISTS idx_positions_callsign ON aircraft_positions(callsign);
CREATE INDEX IF NOT EXISTS idx_positions_time ON aircraft_positions(time_position DESC);
CREATE INDEX IF NOT EXISTS idx_positions_received ON aircraft_positions(received_at DESC);
