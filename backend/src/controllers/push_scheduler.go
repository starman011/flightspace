package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
)

// PushScheduler periodically checks upcoming launches and sends notifications.
type PushScheduler struct {
	push *PushController
	rdb  *redis.Client
	sent sync.Map // "launchID:window" → true (prevent duplicate sends)
}

// NewPushScheduler creates a scheduler that uses Redis launch cache.
func NewPushScheduler(push *PushController, rdb *redis.Client) *PushScheduler {
	return &PushScheduler{push: push, rdb: rdb}
}

// Run checks every 60s for launches approaching notification windows (30min, 5min).
func (ps *PushScheduler) Run(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	// Cleanup expired subs every hour
	cleanupTicker := time.NewTicker(1 * time.Hour)
	defer cleanupTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ps.checkAndNotify(ctx)
			ps.checkFlightLandings(ctx)
		case <-cleanupTicker.C:
			if err := ps.push.CleanupExpired(ctx); err != nil {
				log.Printf(`{"level":"error","service":"push-scheduler","msg":"cleanup failed","error":%q}`, err)
			}
		}
	}
}

func (ps *PushScheduler) checkAndNotify(ctx context.Context) {
	launches, err := ps.getUpcomingLaunches(ctx)
	if err != nil {
		return
	}

	// Evict sent-keys for launches that have dropped out of the upcoming feed,
	// otherwise the map grows for the lifetime of the process.
	live := make(map[string]bool, len(launches))
	for _, l := range launches {
		live[l.ID] = true
	}
	ps.sent.Range(func(k, _ any) bool {
		if s, ok := k.(string); ok {
			if i := strings.LastIndex(s, ":"); i > 0 && !strings.HasPrefix(s, "flight:") && !live[s[:i]] {
				ps.sent.Delete(k)
			}
		}
		return true
	})

	for _, l := range launches {
		if l.NET.IsZero() {
			continue
		}
		until := time.Until(l.NET)

		// 30-minute window: 29–31 min before launch
		if until > 29*time.Minute && until <= 31*time.Minute {
			ps.sendForWindow(ctx, l, "30min", fmt.Sprintf("🚀 %s launches in 30 minutes!", l.Name))
		}
		// 5-minute window: 4–6 min before launch
		if until > 4*time.Minute && until <= 6*time.Minute {
			ps.sendForWindow(ctx, l, "5min", fmt.Sprintf("🚀 %s launching NOW — 5 minutes!", l.Name))
		}
	}
}

type schedulerLaunch struct {
	ID   string
	Name string
	NET  time.Time
}

func (ps *PushScheduler) getUpcomingLaunches(ctx context.Context) ([]schedulerLaunch, error) {
	raw, err := ps.rdb.Get(ctx, "launches:upcoming").Result()
	if err != nil {
		return nil, err
	}

	var cached struct {
		Upcoming []struct {
			ID   string `json:"id"`
			Name string `json:"mission_name"`
			NET  string `json:"net"`
		} `json:"upcoming"`
	}
	if err := json.Unmarshal([]byte(raw), &cached); err != nil {
		return nil, err
	}

	var result []schedulerLaunch
	for _, l := range cached.Upcoming {
		t, err := time.Parse(time.RFC3339, l.NET)
		if err != nil {
			continue
		}
		result = append(result, schedulerLaunch{ID: l.ID, Name: l.Name, NET: t})
	}
	return result, nil
}

func (ps *PushScheduler) sendForWindow(ctx context.Context, l schedulerLaunch, window, body string) {
	key := l.ID + ":" + window
	if _, loaded := ps.sent.LoadOrStore(key, true); loaded {
		return // already sent for this window
	}

	subs, err := ps.push.GetSubscriptionsForLaunch(ctx, l.ID)
	if err != nil || len(subs) == 0 {
		ps.sent.Delete(key) // nothing to send: don't pin this key in memory
		return
	}

	payload := models.PushPayload{
		Title: "Launch Alert",
		Body:  body,
		Tag:   "launch-" + l.ID,
		URL:   "/launches",
	}

	sent, failed := 0, 0
	for _, sub := range subs {
		if err := ps.push.SendNotification(sub, payload); err != nil {
			log.Printf(`{"level":"warn","service":"push-scheduler","msg":"send failed","launch":%q,"error":%q}`, l.ID, err)
			failed++
		} else {
			sent++
		}
	}
	log.Printf(`{"level":"info","service":"push-scheduler","msg":"notifications sent","launch":%q,"window":%q,"sent":%d,"failed":%d}`, l.ID, window, sent, failed)
}

// ── Flight landing alerts ───────────────────────────────────────────────────
// Subscriptions for a flight reuse the launch_id column with a "flight:<icao24>"
// target, so no schema change is needed. Every tick we look at the armed
// targets, read the aircraft's live state, and when one that we have seen
// airborne reports on-ground we push once and drop the subscriptions.
func (ps *PushScheduler) checkFlightLandings(ctx context.Context) {
	rows, err := ps.push.pool.Query(ctx,
		`SELECT DISTINCT launch_id FROM push_subscriptions WHERE launch_id LIKE 'flight:%'`)
	if err != nil {
		return
	}
	targets := []string{}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err == nil {
			targets = append(targets, t)
		}
	}
	rows.Close()
	if len(targets) == 0 {
		return
	}

	for _, target := range targets {
		icao24 := strings.TrimPrefix(target, "flight:")
		raw, err := ps.rdb.HGet(ctx, aircraftLiveKey, icao24).Result()
		if err != nil || raw == "" {
			continue // out of coverage this tick — keep the alert armed
		}
		var live models.LiveAircraft
		if err := json.Unmarshal([]byte(raw), &live); err != nil {
			continue
		}

		airborneKey := target + ":airborne"
		if !live.Grnd {
			ps.sent.Store(airborneKey, true) // remember we saw it flying
			continue
		}
		if _, seenAirborne := ps.sent.Load(airborneKey); !seenAirborne {
			continue // already on the ground when armed — not a landing
		}
		ps.sent.Delete(airborneKey)

		subs, err := ps.push.GetSubscriptionsForLaunch(ctx, target)
		if err != nil || len(subs) == 0 {
			continue
		}
		callsign := strings.ToUpper(icao24)
		if live.Callsign != nil && strings.TrimSpace(*live.Callsign) != "" {
			callsign = strings.TrimSpace(*live.Callsign)
		}
		payload := models.PushPayload{
			Title: callsign + " has landed",
			Body:  "The flight you were tracking is on the ground.",
			Tag:   "landing-" + icao24,
			URL:   "/flight/" + icao24,
		}
		sent, failed := 0, 0
		for _, sub := range subs {
			if err := ps.push.SendNotification(sub, payload); err != nil {
				failed++
			} else {
				sent++
			}
		}
		// One-shot alert: clear the subscriptions once delivered.
		if _, err := ps.push.pool.Exec(ctx,
			`DELETE FROM push_subscriptions WHERE launch_id = $1`, target); err != nil {
			log.Printf(`{"level":"warn","service":"push-scheduler","msg":"landing cleanup failed","target":%q}`, target)
		}
		log.Printf(`{"level":"info","service":"push-scheduler","msg":"landing notified","flight":%q,"sent":%d,"failed":%d}`, icao24, sent, failed)
	}
}
