package middlewares

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	rateLimitRequests = 100
	rateLimitWindow   = 60 * time.Second
)

// skipPaths are exempt from rate limiting.
var skipPaths = map[string]bool{
	"/api/v1/health":  true,
	"/api/v1/metrics": true,
}

// RateLimit returns a middleware that enforces 100 req/min per IP using Redis.
func RateLimit(rdb *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if skipPaths[r.URL.Path] {
				next.ServeHTTP(w, r)
				return
			}

			ip := extractIP(r)
			key := fmt.Sprintf("rate:%s", ip)

			count, err := increment(r.Context(), rdb, key, rateLimitWindow)
			if err != nil {
				// Redis unavailable — fail closed to prevent DoS
				http.Error(w, `{"error":"service temporarily unavailable"}`, http.StatusServiceUnavailable)
				return
			}

			w.Header().Set("X-RateLimit-Limit", strconv.Itoa(rateLimitRequests))
			w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(max(0, rateLimitRequests-int(count))))

			if count > rateLimitRequests {
				w.Header().Set("Retry-After", strconv.Itoa(int(rateLimitWindow.Seconds())))
				http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// increment atomically increments the counter and sets its TTL on first creation.
func increment(ctx context.Context, rdb *redis.Client, key string, window time.Duration) (int64, error) {
	pipe := rdb.Pipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, window)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}

// extractIP returns the real client IP. Proxy headers are only trusted when
// TRUST_PROXY=1 is set, to prevent clients from spoofing their IP.
func extractIP(r *http.Request) string {
	if os.Getenv("TRUST_PROXY") == "1" {
		if cf := r.Header.Get("CF-Connecting-IP"); cf != "" {
			return cf
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			if ip := strings.TrimSpace(parts[0]); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
