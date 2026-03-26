package controllers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
	dbpkg "github.com/skydot/backend/src/db"
	"github.com/skydot/backend/src/utils"
)

const (
	anonSessionTTL = 30 * 24 * time.Hour // 30 days
	jwtTTL         = 7 * 24 * time.Hour  // 7 days
	sessionCacheKey = "session:"
)

// SessionController handles anonymous session creation.
type SessionController struct {
	pool      *pgxpool.Pool
	rdb       *redis.Client
	jwtSecret string
}

// NewSessionController creates a SessionController.
func NewSessionController(pool *pgxpool.Pool, rdb *redis.Client, jwtSecret string) *SessionController {
	return &SessionController{pool: pool, rdb: rdb, jwtSecret: jwtSecret}
}

// CreateSession handles POST /api/v1/session.
// Creates an anonymous session, stores it in DB + Redis, sets a cookie, and returns a JWT.
func (sc *SessionController) CreateSession(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	sessionID := uuid.New().String()
	token, err := utils.GenerateSessionToken()
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to generate session token")
		return
	}

	expiresAt := time.Now().Add(anonSessionTTL)

	// Persist to PostgreSQL
	_, err = sc.pool.Exec(ctx,
		`INSERT INTO anonymous_sessions (id, session_token, expires_at)
		 VALUES ($1, $2, $3)`,
		sessionID, token, expiresAt,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Cache session in Redis
	sessionCtx := models.SessionContext{
		ID:   sessionID,
		Type: "anonymous",
	}
	if b, err := json.Marshal(sessionCtx); err == nil {
		sc.rdb.Set(ctx, sessionCacheKey+token, b, anonSessionTTL)
	}

	// Generate JWT
	jwt, _, err := utils.GenerateAnonymousJWT(sessionID, sc.jwtSecret, anonSessionTTL)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	// Set HTTP-only cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    jwt,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
		SameSite: http.SameSiteLaxMode,
	})

	utils.JSON(w, http.StatusCreated, models.SessionCreateResponse{
		SessionID: sessionID,
		Token:     jwt,
		ExpiresAt: expiresAt,
	})
}

// LoadSession retrieves a SessionContext from Redis (with DB fallback).
func LoadSession(ctx context.Context, rdb *redis.Client, pool *pgxpool.Pool, token string) (*models.SessionContext, error) {
	// Try Redis first
	var cached models.SessionContext
	if found, _ := dbpkg.CacheGet(ctx, rdb, sessionCacheKey+token, &cached); found {
		return &cached, nil
	}

	// Fallback to PostgreSQL
	var sess models.AnonymousSession
	err := pool.QueryRow(ctx,
		`SELECT id, session_token, preferences, created_at, last_seen_at, expires_at
		 FROM anonymous_sessions WHERE session_token = $1 AND expires_at > NOW()`,
		token,
	).Scan(&sess.ID, &sess.SessionToken, &sess.Preferences, &sess.CreatedAt, &sess.LastSeenAt, &sess.ExpiresAt)
	if err != nil {
		return nil, err
	}

	sc := &models.SessionContext{
		ID:          sess.ID,
		Type:        "anonymous",
		Preferences: sess.Preferences,
	}

	// Repopulate Redis cache
	if b, err := json.Marshal(sc); err == nil {
		rdb.Set(ctx, sessionCacheKey+token, b, time.Until(sess.ExpiresAt))
	}

	return sc, nil
}
