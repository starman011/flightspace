package controllers

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// PurgeOrphanTrails must delete trail keys whose aircraft is no longer live,
// and must leave live aircraft's trails alone.
func TestPurgeOrphanTrailsRemovesOnlyOrphans(t *testing.T) {
	srv := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: srv.Addr()})
	ctx := context.Background()

	// Two aircraft are live, three trail keys exist — one is an orphan.
	if err := rdb.HSet(ctx, aircraftLiveKey, "live01", "{}", "live02", "{}").Err(); err != nil {
		t.Fatalf("seed live hash: %v", err)
	}
	for _, id := range []string{"live01", "live02", "orphan1"} {
		if err := rdb.LPush(ctx, trailKeyPrefix+id, `{"lat":1}`).Err(); err != nil {
			t.Fatalf("seed trail %s: %v", id, err)
		}
	}

	removed, err := PurgeOrphanTrails(ctx, rdb)
	if err != nil {
		t.Fatalf("PurgeOrphanTrails: %v", err)
	}
	if removed != 1 {
		t.Fatalf("removed %d keys, want exactly the 1 orphan", removed)
	}

	for _, id := range []string{"live01", "live02"} {
		n, err := rdb.Exists(ctx, trailKeyPrefix+id).Result()
		if err != nil || n != 1 {
			t.Fatalf("trail for live aircraft %s was deleted (exists=%d, err=%v)", id, n, err)
		}
	}
	if n, _ := rdb.Exists(ctx, trailKeyPrefix+"orphan1").Result(); n != 0 {
		t.Fatal("orphan trail survived the purge")
	}
	// The live hash itself must be untouched — it is not this job's business.
	if n, _ := rdb.HLen(ctx, aircraftLiveKey).Result(); n != 2 {
		t.Fatalf("live hash has %d fields, want 2 — the purge must not touch it", n)
	}
}

func TestPurgeOrphanTrailsNoopWhenNothingOrphaned(t *testing.T) {
	srv := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: srv.Addr()})
	ctx := context.Background()

	rdb.HSet(ctx, aircraftLiveKey, "abc123", "{}")
	rdb.LPush(ctx, trailKeyPrefix+"abc123", `{"lat":1}`)

	removed, err := PurgeOrphanTrails(ctx, rdb)
	if err != nil {
		t.Fatalf("PurgeOrphanTrails: %v", err)
	}
	if removed != 0 {
		t.Fatalf("removed %d keys, want 0", removed)
	}
}

// An empty keyspace must not error or try to DEL nothing.
func TestPurgeOrphanTrailsHandlesEmptyKeyspace(t *testing.T) {
	srv := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: srv.Addr()})

	removed, err := PurgeOrphanTrails(context.Background(), rdb)
	if err != nil {
		t.Fatalf("PurgeOrphanTrails on empty keyspace: %v", err)
	}
	if removed != 0 {
		t.Fatalf("removed %d keys from an empty keyspace", removed)
	}
}
