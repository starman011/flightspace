package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
)

func main() {
	// Load .env file if present (development convenience)
	loadDotEnv()

	if os.Getenv("SERVER_DISABLED") == "true" {
		log.Println(`{"level":"info","service":"app","msg":"SERVER_DISABLED=true — serving 503"}`)
		port := os.Getenv("PORT")
		if port == "" {
			port = "8080"
		}
		http.ListenAndServe(":"+port, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "Service temporarily unavailable", http.StatusServiceUnavailable)
		}))
		return
	}

	cfg, err := LoadConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "configuration error: %v\n", err)
		os.Exit(1)
	}

	app, err := NewApp(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialize app: %v\n", err)
		os.Exit(1)
	}

	if err := app.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

// loadDotEnv reads a .env file from the current directory and sets env vars.
// It's a minimal implementation to avoid the godotenv dependency.
func loadDotEnv() {
	data, err := os.ReadFile(".env")
	if err != nil {
		// .env is optional; production uses real env vars
		return
	}

	lines := splitLines(data)
	for _, line := range lines {
		if len(line) == 0 || line[0] == '#' {
			continue
		}
		for i, c := range line {
			if c == '=' {
				key := line[:i]
				val := line[i+1:]
				// Only set if not already set (don't override real env)
				if os.Getenv(key) == "" {
					os.Setenv(key, val)
				}
				break
			}
		}
	}
	log.Println(`{"level":"info","service":"app","msg":"loaded .env file"}`)
}

func splitLines(data []byte) []string {
	var lines []string
	start := 0
	for i, b := range data {
		if b == '\n' {
			line := string(data[start:i])
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			lines = append(lines, line)
			start = i + 1
		}
	}
	if start < len(data) {
		lines = append(lines, string(data[start:]))
	}
	return lines
}
