package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// CacheSet stores a JSON-serializable value in Redis with the given TTL.
func CacheSet(ctx context.Context, rdb *redis.Client, key string, value any, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	return rdb.Set(ctx, key, data, ttl).Err()
}

// CacheGet retrieves and JSON-deserializes a value from Redis.
// Returns (false, nil) if the key does not exist.
func CacheGet(ctx context.Context, rdb *redis.Client, key string, dest any) (bool, error) {
	data, err := rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("get: %w", err)
	}
	if err := json.Unmarshal(data, dest); err != nil {
		return false, fmt.Errorf("unmarshal: %w", err)
	}
	return true, nil
}

// CacheDel deletes one or more keys from Redis.
func CacheDel(ctx context.Context, rdb *redis.Client, keys ...string) error {
	return rdb.Del(ctx, keys...).Err()
}

// HSetPipeline sets multiple hash fields in a single Redis pipeline command.
// fields is a map of field → JSON-serialized string value.
func HSetPipeline(ctx context.Context, rdb *redis.Client, key string, fields map[string]string) error {
	if len(fields) == 0 {
		return nil
	}
	pipe := rdb.Pipeline()
	args := make([]any, 0, len(fields)*2)
	for k, v := range fields {
		args = append(args, k, v)
	}
	pipe.HSet(ctx, key, args...)
	_, err := pipe.Exec(ctx)
	return err
}

// HGetAll retrieves all fields from a Redis hash.
func HGetAll(ctx context.Context, rdb *redis.Client, key string) (map[string]string, error) {
	return rdb.HGetAll(ctx, key).Result()
}

// HGet retrieves a single field from a Redis hash.
func HGet(ctx context.Context, rdb *redis.Client, key, field string) (string, error) {
	v, err := rdb.HGet(ctx, key, field).Result()
	if err == redis.Nil {
		return "", nil
	}
	return v, err
}

// HLen returns the number of fields in a Redis hash.
func HLen(ctx context.Context, rdb *redis.Client, key string) (int64, error) {
	return rdb.HLen(ctx, key).Result()
}

// HDel removes fields from a Redis hash.
func HDel(ctx context.Context, rdb *redis.Client, key string, fields ...string) error {
	return rdb.HDel(ctx, key, fields...).Err()
}

// IncrWithExpire atomically increments a counter and sets a TTL on first creation.
func IncrWithExpire(ctx context.Context, rdb *redis.Client, key string, ttl time.Duration) (int64, error) {
	pipe := rdb.Pipeline()
	incr := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, ttl)
	if _, err := pipe.Exec(ctx); err != nil {
		return 0, err
	}
	return incr.Val(), nil
}
