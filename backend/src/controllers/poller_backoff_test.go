package controllers

import (
	"context"
	"errors"
	"net/http"

	"github.com/skydot/backend/src/models"
	"testing"
	"time"
)

// failingTransport makes every fetch fail immediately, which is the state the
// poller used to handle by sleeping inside its tick handler.
type failingTransport struct{}

func (failingTransport) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("simulated upstream failure")
}

func TestNextDelayBacksOffOnFailureAndCaps(t *testing.T) {
	backoff := initialBackoff

	first := nextDelay(true, &backoff)
	if first != initialBackoff {
		t.Fatalf("first retry delay = %v, want %v", first, initialBackoff)
	}
	second := nextDelay(true, &backoff)
	if second != initialBackoff*2 {
		t.Fatalf("second retry delay = %v, want %v", second, initialBackoff*2)
	}

	// Keep failing; the delay must saturate rather than grow without bound.
	for i := 0; i < 20; i++ {
		nextDelay(true, &backoff)
	}
	if got := nextDelay(true, &backoff); got != maxBackoff {
		t.Fatalf("saturated delay = %v, want %v", got, maxBackoff)
	}
}

func TestNextDelayResetsAfterSuccess(t *testing.T) {
	backoff := initialBackoff
	nextDelay(true, &backoff)
	nextDelay(true, &backoff)

	if got := nextDelay(false, &backoff); got != pollInterval {
		t.Fatalf("delay after success = %v, want the steady interval %v", got, pollInterval)
	}
	// The next failure must start from the bottom of the ramp again.
	if got := nextDelay(true, &backoff); got != initialBackoff {
		t.Fatalf("delay after a success then failure = %v, want %v", got, initialBackoff)
	}
}

// The regression that mattered: the old loop slept inside the tick handler, so
// a cancelled context was not observed until the sleep expired — up to
// maxBackoff (5 minutes) — and shutdown hung.
func TestStartReturnsPromptlyWhenCancelledWhileFailing(t *testing.T) {
	p := &Poller{client: &http.Client{Transport: failingTransport{}}}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		p.Start(ctx)
		close(done)
	}()

	// Let it fail at least once so a backoff delay is pending.
	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Start did not return within 2s of cancellation; it is blocking on its backoff")
	}
}

func strp(s string) *string { return &s }

func TestDedupeLatestKeepsFreshestFixPerAircraft(t *testing.T) {
	in := []models.LiveAircraft{
		{ID: "abc123", TS: 100, Callsign: strp("OLD")},
		{ID: "def456", TS: 50},
		{ID: "abc123", TS: 200, Callsign: strp("NEW")}, // same aircraft, newer fix
		{ID: "abc123", TS: 150, Callsign: strp("MID")},
	}

	out := dedupeLatest(in)

	if len(out) != 2 {
		t.Fatalf("got %d rows, want 2 distinct aircraft", len(out))
	}
	byID := map[string]models.LiveAircraft{}
	for _, a := range out {
		byID[a.ID] = a
	}
	got, ok := byID["abc123"]
	if !ok {
		t.Fatal("abc123 missing from deduped output")
	}
	if got.TS != 200 || got.Callsign == nil || *got.Callsign != "NEW" {
		t.Fatalf("kept ts=%d callsign=%v, want the freshest fix (ts=200, NEW)", got.TS, got.Callsign)
	}
}

func TestDedupeLatestPassesThroughDistinctAircraft(t *testing.T) {
	in := []models.LiveAircraft{{ID: "a", TS: 1}, {ID: "b", TS: 2}, {ID: "c", TS: 3}}
	if got := dedupeLatest(in); len(got) != 3 {
		t.Fatalf("got %d rows, want 3", len(got))
	}
}
