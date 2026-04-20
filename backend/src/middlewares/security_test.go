package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	handler := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	expected := map[string]string{
		"X-Frame-Options":            "DENY",
		"X-Content-Type-Options":     "nosniff",
		"X-XSS-Protection":          "1; mode=block",
		"Content-Security-Policy":    "default-src 'none'; frame-ancestors 'none'; object-src 'none'",
		"Cross-Origin-Opener-Policy": "same-origin",
		"Referrer-Policy":            "no-referrer",
	}

	for header, want := range expected {
		got := rr.Header().Get(header)
		if got != want {
			t.Errorf("%s = %q, want %q", header, got, want)
		}
	}

	// Server header should be removed
	if rr.Header().Get("Server") != "" {
		t.Error("Server header should be removed")
	}
}

func TestSecurityHeaders_HSTS_HTTPS(t *testing.T) {
	handler := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Simulate HTTPS behind proxy
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	hsts := rr.Header().Get("Strict-Transport-Security")
	if hsts == "" {
		t.Error("HSTS should be set for HTTPS requests")
	}
	if hsts != "max-age=63072000; includeSubDomains; preload" {
		t.Errorf("HSTS = %q, unexpected value", hsts)
	}
}

func TestSecurityHeaders_NoHSTS_HTTP(t *testing.T) {
	handler := SecurityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Header().Get("Strict-Transport-Security") != "" {
		t.Error("HSTS should NOT be set for plain HTTP requests")
	}
}
