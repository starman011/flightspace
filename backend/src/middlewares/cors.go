package middlewares

import (
	"net/http"
	"os"
	"strings"
)

// allowedOrigins returns the set of permitted origins.
// Reads ALLOWED_ORIGINS env var (comma-separated) and always includes localhost variants.
func allowedOrigins() map[string]bool {
	origins := map[string]bool{
		"http://localhost:5173":  true,
		"http://localhost:3000":  true,
		"http://127.0.0.1:5173": true,
	}
	if env := os.Getenv("ALLOWED_ORIGINS"); env != "" {
		for _, o := range strings.Split(env, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				origins[o] = true
			}
		}
	}
	return origins
}

// CORS returns a middleware that sets CORS headers.
// Only origins in the allow-list (env + localhost) are echoed back with
// credentials. Unknown origins get no ACAO header, so the browser blocks
// the response.
func CORS(next http.Handler) http.Handler {
	allowed := allowedOrigins()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Set("Vary", "Origin")

		if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
