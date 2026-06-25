package controllers

import (
	"context"
	"encoding/json"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/skydot/backend/src/models"
)

// Flight-route enrichment for the arrivals/departures boards, via adsbdb.com —
// which IS reachable from our backend (unlike OpenSky's auth host). Gives each
// flight its real origin + destination airport.

// cachedRouteIATA returns a callsign's origin/destination IATA from the existing
// adsbdb route cache. Cache-only: never makes a network call, so it can't block
// the board response.
func cachedRouteIATA(ctx context.Context, rdb *redis.Client, callsign string) (origin, dest string, ok bool) {
	if callsign == "" {
		return "", "", false
	}
	cached, err := rdb.Get(ctx, "route:adsbdb:"+callsign).Result()
	if err != nil {
		return "", "", false
	}
	var r models.RouteResponse
	if json.Unmarshal([]byte(cached), &r) != nil || r.Source != "adsbdb" {
		return "", "", false
	}
	if r.DepartureIATA != nil {
		origin = *r.DepartureIATA
	}
	if r.ArrivalIATA != nil {
		dest = *r.ArrivalIATA
	}
	return origin, dest, origin != "" || dest != ""
}

// warmRoute fetches + caches a callsign's route from adsbdb in the background so
// the next board load has its origin/destination. A SetNX lock avoids a
// stampede of duplicate fetches for the same callsign.
func warmRoute(rdb *redis.Client, callsign string) {
	if callsign == "" {
		return
	}
	bg := context.Background()
	if ok, _ := rdb.SetNX(bg, "route:warm:"+callsign, "1", 60*time.Second).Result(); !ok {
		return
	}
	cacheKey := "route:adsbdb:" + callsign
	if _, err := rdb.Get(bg, cacheKey).Result(); err == nil {
		return // already cached (success or "none")
	}
	resp, err := adsbDBClient.Get("https://api.adsbdb.com/v0/callsign/" + callsign)
	if err != nil {
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		rdb.Set(bg, cacheKey, `{"source":"none"}`, 10*time.Minute)
		return
	}
	var data adsbDBResponse
	if json.NewDecoder(resp.Body).Decode(&data) != nil || data.Response.FlightRoute == nil {
		return
	}
	fr := data.Response.FlightRoute
	if fr.Origin == nil || fr.Dest == nil {
		rdb.Set(bg, cacheKey, `{"source":"none"}`, 10*time.Minute)
		return
	}
	r := models.RouteResponse{Source: "adsbdb"}
	r.DepartureICAO = &fr.Origin.ICAO
	r.DepartureIATA = &fr.Origin.IATA
	r.DepartureName = &fr.Origin.Name
	r.DepLat = &fr.Origin.Lat
	r.DepLon = &fr.Origin.Lon
	r.ArrivalICAO = &fr.Dest.ICAO
	r.ArrivalIATA = &fr.Dest.IATA
	r.ArrivalName = &fr.Dest.Name
	r.ArrLat = &fr.Dest.Lat
	r.ArrLon = &fr.Dest.Lon
	if fr.Airline != nil && fr.Airline.IATA != "" {
		ai := fr.Airline.IATA
		r.AirlineIATA = &ai
	}
	if b, err := json.Marshal(r); err == nil {
		rdb.Set(bg, cacheKey, string(b), time.Hour)
	}
}
