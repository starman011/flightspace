-- Drop the unbounded aircraft_positions table. Trail history now lives in Redis
-- as a bounded per-aircraft list (aircraft:trail:<icao24>) capped at 200 points
-- with a 4-hour TTL — zero disk growth.
DROP TABLE IF EXISTS aircraft_positions CASCADE;
