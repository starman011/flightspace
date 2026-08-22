package middlewares

import (
	"bufio"
	"compress/gzip"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
)

// gzip.NewWriter allocates a sizeable compression window every call, and this
// runs on every response, so writers are pooled and reset instead.
var gzipPool = sync.Pool{
	New: func() any {
		w, _ := gzip.NewWriterLevel(io.Discard, gzip.BestSpeed)
		return w
	},
}

// compressible reports whether a Content-Type is worth gzipping. Images, video
// and anything already gzipped are incompressible — running them through gzip
// burns CPU and usually makes the body marginally larger.
func compressible(ct string) bool {
	ct = strings.ToLower(strings.TrimSpace(strings.SplitN(ct, ";", 2)[0]))
	switch {
	case strings.HasPrefix(ct, "text/"):
		return true
	case ct == "application/json", ct == "application/javascript",
		ct == "application/xml", ct == "image/svg+xml":
		return true
	default:
		return false
	}
}

// Compress gzips responses for clients that accept it.
//
// The API previously shipped every JSON body uncompressed: /api/v1/asteroids
// alone is ~231 KB raw and ~55 KB gzipped, so roughly three quarters of the
// egress on the largest endpoint was paying to move redundant bytes.
func Compress(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(strings.ToLower(r.Header.Get("Accept-Encoding")), "gzip") {
			next.ServeHTTP(w, r)
			return
		}
		// WebSocket upgrades hijack the raw connection; they must never be
		// wrapped in a compressing writer.
		if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			next.ServeHTTP(w, r)
			return
		}

		// Cached-by-proxy responses must vary on encoding or a gzipped body can
		// be served to a client that did not ask for one.
		w.Header().Add("Vary", "Accept-Encoding")

		gw := &gzipWriter{ResponseWriter: w}
		defer gw.Close()
		next.ServeHTTP(gw, r)
	})
}

// gzipWriter decides at WriteHeader time whether this particular response is
// worth compressing, then either streams through gzip or passes bytes straight
// to the underlying writer.
type gzipWriter struct {
	http.ResponseWriter
	gz          *gzip.Writer
	wroteHeader bool
	compressing bool
}

func (g *gzipWriter) WriteHeader(status int) {
	if g.wroteHeader {
		return
	}
	g.wroteHeader = true

	h := g.Header()
	// 204/304 carry no body, and an already-encoded body must be left alone
	// (the APOD handler forwards NASA's gzipped response verbatim).
	noBody := status == http.StatusNoContent || status == http.StatusNotModified
	if !noBody && h.Get("Content-Encoding") == "" && compressible(h.Get("Content-Type")) {
		g.compressing = true
		h.Set("Content-Encoding", "gzip")
		// The length of the identity body no longer describes what is sent.
		h.Del("Content-Length")
		g.gz = gzipPool.Get().(*gzip.Writer)
		g.gz.Reset(g.ResponseWriter)
	}
	g.ResponseWriter.WriteHeader(status)
}

func (g *gzipWriter) Write(b []byte) (int, error) {
	if !g.wroteHeader {
		// Mirror net/http: an implicit 200 still needs the content sniffed, and
		// handlers that never call WriteHeader are the common case.
		if g.Header().Get("Content-Type") == "" {
			g.Header().Set("Content-Type", http.DetectContentType(b))
		}
		g.WriteHeader(http.StatusOK)
	}
	if g.compressing {
		return g.gz.Write(b)
	}
	return g.ResponseWriter.Write(b)
}

func (g *gzipWriter) Close() {
	if g.gz != nil {
		g.gz.Close()
		gzipPool.Put(g.gz)
		g.gz = nil
	}
}

// Flush keeps streaming handlers (SSE, long-lived JSON streams) working: the
// gzip buffer has to be pushed out before the underlying writer is flushed, or
// the client sits waiting on bytes that are still held in the compressor.
func (g *gzipWriter) Flush() {
	if g.gz != nil {
		g.gz.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Hijack preserves connection upgrades for anything that slips past the
// Upgrade check above.
func (g *gzipWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := g.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, errors.New("middlewares: ResponseWriter does not support hijacking")
}
