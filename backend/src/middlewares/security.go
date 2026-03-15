package middlewares

import "net/http"

// SecurityHeaders adds defensive HTTP headers to every response.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		// Prevent clickjacking
		h.Set("X-Frame-Options", "DENY")
		// Disable MIME sniffing
		h.Set("X-Content-Type-Options", "nosniff")
		// XSS protection (legacy browsers)
		h.Set("X-XSS-Protection", "1; mode=block")
		// HSTS: enforce HTTPS for 1 year (only set if connection is TLS)
		if r.TLS != nil {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		// Content Security Policy — tight policy for an API-only server
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		// Prevent referrer leakage
		h.Set("Referrer-Policy", "no-referrer")
		// Remove server fingerprint
		h.Del("Server")
		next.ServeHTTP(w, r)
	})
}
