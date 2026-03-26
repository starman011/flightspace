CREATE TABLE IF NOT EXISTS aircraft_static (
    icao24           VARCHAR(6) PRIMARY KEY,
    registration     VARCHAR(20),
    type_code        VARCHAR(4),
    type_description VARCHAR(200),
    operator_icao    VARCHAR(4),
    operator_name    VARCHAR(200),
    owner            VARCHAR(100),
    is_helicopter    BOOLEAN NOT NULL DEFAULT FALSE,
    last_updated     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aircraft_type ON aircraft_static(type_code);
CREATE INDEX IF NOT EXISTS idx_aircraft_operator ON aircraft_static(operator_icao);
CREATE INDEX IF NOT EXISTS idx_aircraft_is_heli ON aircraft_static(is_helicopter);
