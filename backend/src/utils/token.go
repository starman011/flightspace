package utils

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const anonymousTokenPrefix = "skd_anon_"

// GenerateSessionToken creates a cryptographically random anonymous session token.
func GenerateSessionToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	return anonymousTokenPrefix + hex.EncodeToString(b), nil
}

// GenerateJWT creates a signed JWT for an authenticated user.
func GenerateJWT(userID, secret string, ttl time.Duration) (string, time.Time, error) {
	exp := time.Now().Add(ttl)
	claims := jwt.MapClaims{
		"id":      userID,
		"type":    "user",
		"user_id": userID,
		"exp":     exp.Unix(),
		"iat":     time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign jwt: %w", err)
	}
	return signed, exp, nil
}

// GenerateAnonymousJWT creates a short-lived JWT for anonymous sessions.
func GenerateAnonymousJWT(sessionID, secret string, ttl time.Duration) (string, time.Time, error) {
	exp := time.Now().Add(ttl)
	claims := jwt.MapClaims{
		"id":   sessionID,
		"type": "anonymous",
		"exp":  exp.Unix(),
		"iat":  time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign anonymous jwt: %w", err)
	}
	return signed, exp, nil
}
