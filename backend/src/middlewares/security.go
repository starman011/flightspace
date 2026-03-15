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
		// HSTS: enforce HTTPS for 2 years — also applies behind Railway/Cloudflare proxy
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		}
		// Content Security Policy — tight policy for an API-only server
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; object-src 'none'")
		// Prevent cross-origin window attacks
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		// Allow cross-origin fetch of API responses (needed by the SPA)
		h.Set("Cross-Origin-Resource-Policy", "cross-origin")
		// Prevent referrer leakage
		h.Set("Referrer-Policy", "no-referrer")
		// Remove server fingerprint
		h.Del("Server")
		next.ServeHTTP(w, r)
	})
}
