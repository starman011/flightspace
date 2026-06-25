package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// OpenSky Network REST API (OAuth2 client-credentials). Provides real
// by-airport arrivals/departures with origin/destination airports — far more
// accurate than our live-position heuristic. Free tier: ~4000 credits/day, so
// every airport response is cached in Redis for 20 minutes.
//
// Credentials come from env (set on Railway): OPENSKY_CLIENT_ID / _SECRET.
// Create an API client at OpenSky → Account → API Clients.

const (
	openSkyTokenURL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
	openSkyAPIBase  = "https://opensky-network.org/api"
)

type openSkyFlight struct {
	ICAO24              string `json:"icao24"`
	Callsign            string `json:"callsign"`
	FirstSeen           int64  `json:"firstSeen"`
	LastSeen            int64  `json:"lastSeen"`
	EstDepartureAirport string `json:"estDepartureAirport"` // origin ICAO
	EstArrivalAirport   string `json:"estArrivalAirport"`   // destination ICAO
}

var (
	// Generous timeout: only used off the request path (background goroutine),
	// and the OpenSky auth endpoint can be slow from some hosts.
	osHTTP     = &http.Client{Timeout: 20 * time.Second}
	osTokenMu  sync.Mutex
	osToken    string
	osTokenExp time.Time
)

// OpenSkyEnabled reports whether OAuth2 credentials are configured.
func OpenSkyEnabled() bool {
	return os.Getenv("OPENSKY_CLIENT_ID") != "" && os.Getenv("OPENSKY_CLIENT_SECRET") != ""
}

// openSkyAccessToken returns a cached bearer token, refreshing when near expiry.
func openSkyAccessToken(ctx context.Context) (string, error) {
	osTokenMu.Lock()
	defer osTokenMu.Unlock()
	if osToken != "" && time.Now().Before(osTokenExp) {
		return osToken, nil
	}
	form := url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {os.Getenv("OPENSKY_CLIENT_ID")},
		"client_secret": {os.Getenv("OPENSKY_CLIENT_SECRET")},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openSkyTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := osHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("opensky token: status %d", resp.StatusCode)
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil {
		return "", err
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("opensky token: empty")
	}
	osToken = tok.AccessToken
	ttl := tok.ExpiresIn
	if ttl <= 0 {
		ttl = 1800 // 30 min default
	}
	osTokenExp = time.Now().Add(time.Duration(ttl-60) * time.Second)
	return osToken, nil
}

// fetchOpenSkyFlights returns recent flights for an airport from the Redis
// cache ONLY — it never makes a network call on the request path (OpenSky can
// take many seconds, which would block the airport endpoint and cause 499s).
// On a cache miss it kicks off a background refresh and returns nothing; the
// data appears on a subsequent request once the cache is warm.
func fetchOpenSkyFlights(ctx context.Context, rdb *redis.Client, kind, icao string) ([]openSkyFlight, bool) {
	if !OpenSkyEnabled() || icao == "" {
		return nil, false
	}
	cacheKey := "opensky:" + kind + ":" + icao
	if cached, err := rdb.Get(ctx, cacheKey).Result(); err == nil {
		var fs []openSkyFlight
		if json.Unmarshal([]byte(cached), &fs) == nil {
			return fs, true
		}
		return nil, false
	}
	go refreshOpenSky(kind, icao, rdb) // warm the cache off the request path
	return nil, false
}

// refreshOpenSky fetches + caches one airport's flights in the background.
// A short Redis lock prevents a stampede of concurrent fetches.
func refreshOpenSky(kind, icao string, rdb *redis.Client) {
	bg := context.Background()
	lockKey := "opensky:lock:" + kind + ":" + icao
	if ok, _ := rdb.SetNX(bg, lockKey, "1", 30*time.Second).Result(); !ok {
		return
	}
	ctx, cancel := context.WithTimeout(bg, 45*time.Second)
	defer cancel()

	token, err := openSkyAccessToken(ctx)
	if err != nil {
		log.Printf("[opensky] token error: %v", err)
		return
	}
	end := time.Now().Unix()
	begin := end - 12*3600 // last 12 hours (within the 2-day limit)
	u := fmt.Sprintf("%s/flights/%s?airport=%s&begin=%d&end=%d", openSkyAPIBase, kind, url.QueryEscape(icao), begin, end)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := osHTTP.Do(req)
	if err != nil {
		log.Printf("[opensky] %s %s request error: %v", kind, icao, err)
		return
	}
	defer resp.Body.Close()
	cacheKey := "opensky:" + kind + ":" + icao
	if resp.StatusCode != http.StatusOK {
		log.Printf("[opensky] %s %s -> HTTP %d", kind, icao, resp.StatusCode)
		if resp.StatusCode == http.StatusNotFound {
			rdb.Set(bg, cacheKey, "[]", 10*time.Minute) // no flights in window
		}
		return
	}
	var flights []openSkyFlight
	if err := json.NewDecoder(resp.Body).Decode(&flights); err != nil {
		return
	}
	log.Printf("[opensky] %s %s -> %d flights", kind, icao, len(flights))
	if b, err := json.Marshal(flights); err == nil {
		rdb.Set(bg, cacheKey, b, 20*time.Minute)
	}
}
