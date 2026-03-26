package db

import (
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RunMigrations applies all pending up migrations from the ./migrations directory.
func RunMigrations(databaseURL string) error {
	m, err := migrate.New("file://migrations", databaseURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("migrate up: %w", err)
	}
	return nil
}

// GetPoolStats returns a snapshot of the connection pool statistics.
func GetPoolStats(pool *pgxpool.Pool) map[string]int32 {
	s := pool.Stat()
	return map[string]int32{
		"total":     s.TotalConns(),
		"idle":      s.IdleConns(),
		"acquired":  s.AcquiredConns(),
		"max_conns": s.MaxConns(),
	}
}
