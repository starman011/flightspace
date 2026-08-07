package controllers

import (
	"testing"

	"github.com/skydot/backend/src/models"
)

func ac(id string, lat float64) models.LiveAircraft {
	return models.LiveAircraft{ID: id, Lat: lat, Lon: 1}
}

func TestMergeAircraft_AddsOnlyNovelIDs(t *testing.T) {
	base := []models.LiveAircraft{ac("aaa111", 10), ac("bbb222", 20)}
	extra := []models.LiveAircraft{ac("bbb222", 99), ac("ccc333", 30)}

	got := mergeAircraft(base, extra)

	if len(got) != 3 {
		t.Fatalf("want 3 aircraft, got %d", len(got))
	}
	byID := map[string]models.LiveAircraft{}
	for _, a := range got {
		byID[a.ID] = a
	}
	// base must win the conflict — it comes from the faster global poll.
	if byID["bbb222"].Lat != 20 {
		t.Errorf("supplement overwrote a fresher base entry: lat=%v, want 20", byID["bbb222"].Lat)
	}
	if _, ok := byID["ccc333"]; !ok {
		t.Error("novel supplement aircraft was dropped")
	}
}

func TestMergeAircraft_DedupesWithinExtra(t *testing.T) {
	// Hub points overlap at 250nm radius, so the same aircraft can be
	// returned by two neighbouring queries.
	base := []models.LiveAircraft{ac("aaa111", 10)}
	extra := []models.LiveAircraft{ac("ddd444", 1), ac("ddd444", 2), ac("ddd444", 3)}

	got := mergeAircraft(base, extra)

	if len(got) != 2 {
		t.Fatalf("overlapping hub results not deduped: got %d aircraft, want 2", len(got))
	}
}

func TestMergeAircraft_EmptyExtraIsNoop(t *testing.T) {
	base := []models.LiveAircraft{ac("aaa111", 10)}
	if got := mergeAircraft(base, nil); len(got) != 1 {
		t.Fatalf("want 1, got %d", len(got))
	}
}

func TestSupplementPoints_AvoidCoveredRegions(t *testing.T) {
	// adsb.lol already covers North America and Europe densely; a hub there
	// would spend a request on aircraft we already have.
	for _, p := range supplementPoints {
		inNA := p.Lat >= 15 && p.Lat <= 72 && p.Lon >= -170 && p.Lon <= -52
		inEU := p.Lat >= 35 && p.Lat <= 72 && p.Lon >= -10 && p.Lon <= 25
		if inNA || inEU {
			t.Errorf("hub (%.4f, %.4f) sits in an already-covered region", p.Lat, p.Lon)
		}
	}
}

func TestSupplementInterval_KeepsAircraftAlive(t *testing.T) {
	// Supplement-only aircraft are refreshed every supplementEvery polls. If
	// that gap ever exceeds staleThreshold they get evicted from Redis
	// between runs and flicker on the globe.
	gapSeconds := int(pollInterval.Seconds()) * supplementEvery
	if gapSeconds >= staleThreshold {
		t.Fatalf("supplement gap %ds >= stale threshold %ds — supplement-only aircraft would flicker",
			gapSeconds, staleThreshold)
	}
}
