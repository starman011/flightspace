package controllers

import (
	"context"
	"errors"
	"net/http"
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
