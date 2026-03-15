package middlewares

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/skydot/backend/src/models"
)

type contextKey string

const SessionContextKey contextKey = "session"

// AuthOptional loads session from cookie/header if present. Never rejects unauthenticated requests.
func AuthOptional(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractToken(r)
			if token != "" {
				if session := validateToken(token, secret); session != nil {
					ctx := context.WithValue(r.Context(), SessionContextKey, session)
					r = r.WithContext(ctx)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// AuthRequired rejects requests without a valid session token.
func AuthRequired(secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractToken(r)
			if token == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			session := validateToken(token, secret)
			if session == nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), SessionContextKey, session)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetSession retrieves the SessionContext stored by auth middleware.
func GetSession(r *http.Request) *models.SessionContext {
	v, _ := r.Context().Value(SessionContextKey).(*models.SessionContext)
	return v
}

func extractToken(r *http.Request) string {
	// 1. Authorization: Bearer <token>
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	// 2. X-Session-Token header
	if t := r.Header.Get("X-Session-Token"); t != "" {
		return t
	}
	// 3. session_token cookie
	if c, err := r.Cookie("session_token"); err == nil {
		return c.Value
	}
	return ""
}

func validateToken(tokenStr, secret string) *models.SessionContext {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return nil
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil
	}
	id, _ := claims["id"].(string)
	typ, _ := claims["type"].(string)
	if id == "" || typ == "" {
		return nil
	}
	session := &models.SessionContext{ID: id, Type: typ}
	if uid, ok := claims["user_id"].(string); ok {
		session.UserID = &uid
	}
	return session
}
