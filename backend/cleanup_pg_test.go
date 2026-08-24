package main

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// The purge passes trailRetention.String() — Go's "48h0m0s" — as a bind
// parameter cast with $1::interval. psql accepts that spelling as a literal,
// but a bound text parameter is a different code path, so exercise the real one.
//
// Skipped unless TEST_DATABASE_URL is set, so it never blocks a build.
func TestFlightTrailPurgeUsesAValidInterval(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS flight_trails (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			icao24 VARCHAR(6) NOT NULL, callsign VARCHAR(10),
			trail JSONB NOT NULL, point_count INT NOT NULL,
			started_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); err != nil {
		t.Fatalf("create table: %v", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM flight_trails WHERE icao24 LIKE 'zz%'`); err != nil {
		t.Fatalf("clear fixtures: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO flight_trails (icao24, trail, point_count, started_at, ended_at, created_at) VALUES
		  ('zz0001','[]'::jsonb,1,NOW(),NOW(),NOW()),
		  ('zz0002','[]'::jsonb,1,NOW(),NOW(),NOW() - interval '47 hours'),
		  ('zz0003','[]'::jsonb,1,NOW(),NOW(),NOW() - interval '49 hours'),
		  ('zz0004','[]'::jsonb,1,NOW(),NOW(),NOW() - interval '30 days')`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Byte-for-byte the statement and argument runCleanup uses.
	tag, err := pool.Exec(ctx,
		`DELETE FROM flight_trails WHERE created_at < NOW() - $1::interval AND icao24 LIKE 'zz%'`,
		trailRetention.String())
	if err != nil {
		t.Fatalf("purge failed — the bound interval is not valid: %v", err)
	}
	if tag.RowsAffected() != 2 {
		t.Fatalf("purged %d rows, want 2 (the 49h and 30d rows)", tag.RowsAffected())
	}

	var survivors int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM flight_trails WHERE icao24 LIKE 'zz%'`).Scan(&survivors); err != nil {
		t.Fatalf("count survivors: %v", err)
	}
	if survivors != 2 {
		t.Fatalf("%d rows survived, want 2 (the fresh and 47h rows)", survivors)
	}

	if trailRetention != 48*time.Hour {
		t.Fatalf("trailRetention = %v, test assumes 48h", trailRetention)
	}
	pool.Exec(ctx, `DELETE FROM flight_trails WHERE icao24 LIKE 'zz%'`)
}
