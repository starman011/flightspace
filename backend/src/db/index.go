package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// Connect establishes a PostgreSQL connection pool and verifies connectivity.
func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := HealthCheckPostgres(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("health check: %w", err)
	}

	return pool, nil
}

// ConnectRedis creates and verifies a Redis client connection.
func ConnectRedis(ctx context.Context, redisURL string) (*redis.Client, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}

	opts.DialTimeout = 10 * time.Second
	opts.ReadTimeout = 5 * time.Second
	opts.WriteTimeout = 5 * time.Second
	opts.PoolSize = 10

	rdb := redis.NewClient(opts)

	if err := HealthCheckRedis(ctx, rdb); err != nil {
		rdb.Close()
		return nil, fmt.Errorf("health check: %w", err)
	}

	return rdb, nil
}

// HealthCheckPostgres verifies PostgreSQL is reachable.
func HealthCheckPostgres(ctx context.Context, pool *pgxpool.Pool) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var result int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("ping: %w", err)
	}
	return nil
}

// HealthCheckRedis verifies Redis is reachable.
func HealthCheckRedis(ctx context.Context, rdb *redis.Client) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("ping: %w", err)
	}
	return nil
}
