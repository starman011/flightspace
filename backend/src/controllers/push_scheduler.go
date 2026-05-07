package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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
