package middlewares

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func jsonHandler(body string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, body)
	})
}

func TestCompressGzipsJSONWhenAccepted(t *testing.T) {
	body := strings.Repeat(`{"icao24":"abc123","lat":12.34,"lon":56.78},`, 400)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/asteroids", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()

	Compress(jsonHandler(body)).ServeHTTP(rec, req)

	if got := rec.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
	}
	if rec.Body.Len() >= len(body) {
		t.Fatalf("compressed size %d not smaller than raw %d", rec.Body.Len(), len(body))
	}
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatalf("body is not valid gzip: %v", err)
	}
	got, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("reading gzip body: %v", err)
	}
	if string(got) != body {
		t.Fatal("decompressed body does not match the original")
	}
}

func TestCompressSkippedWithoutAcceptEncoding(t *testing.T) {
	body := strings.Repeat("x", 5000)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/asteroids", nil)
	rec := httptest.NewRecorder()

	Compress(jsonHandler(body)).ServeHTTP(rec, req)

	if got := rec.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("Content-Encoding = %q, want empty for a client that did not ask", got)
	}
	if rec.Body.String() != body {
		t.Fatal("body was altered for a non-gzip client")
	}
}

// An already-encoded body (the APOD handler forwards NASA's gzipped response)
// must not be gzipped a second time.
func TestCompressLeavesPreEncodedBodyAlone(t *testing.T) {
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "gzip")
		io.WriteString(w, "already-compressed")
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/apod", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()

	Compress(h).ServeHTTP(rec, req)

	if rec.Body.String() != "already-compressed" {
		t.Fatal("pre-encoded body was re-compressed")
	}
}

func TestCompressSkipsWebSocketUpgrade(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Upgrade", "websocket")
	rec := httptest.NewRecorder()

	Compress(jsonHandler("hello")).ServeHTTP(rec, req)

	if got := rec.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("Content-Encoding = %q, want empty for a websocket upgrade", got)
	}
}

func TestCompressSetsVary(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/launches", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()

	Compress(jsonHandler(`{"ok":true}`)).ServeHTTP(rec, req)

	if !strings.Contains(rec.Header().Get("Vary"), "Accept-Encoding") {
		t.Fatalf("Vary = %q, want it to include Accept-Encoding", rec.Header().Get("Vary"))
	}
}
