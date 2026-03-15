package middlewares

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"time"
)

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// Hijack implements http.Hijacker so gorilla/websocket can upgrade the connection.
func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := rw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("underlying ResponseWriter does not implement http.Hijacker")
	}
	return h.Hijack()
}

// RequestLogger logs each HTTP request as structured JSON.
func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rw, r)

		entry := map[string]interface{}{
			"timestamp": start.UTC().Format(time.RFC3339),
			"level":     "info",
			"service":   "http",
			"method":    r.Method,
			"path":      r.URL.Path,
			"status":    rw.statusCode,
			"latency_ms": time.Since(start).Milliseconds(),
			"ip":        extractIP(r),
		}
		if b, err := json.Marshal(entry); err == nil {
			log.Println(string(b))
		}
	})
}
