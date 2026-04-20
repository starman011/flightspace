package utils

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestGenerateSessionToken(t *testing.T) {
	token, err := GenerateSessionToken()
	if err != nil {
		t.Fatalf("GenerateSessionToken() error = %v", err)
	}
	if !strings.HasPrefix(token, "skd_anon_") {
		t.Errorf("token missing prefix, got %q", token)
	}
	// 32 random bytes = 64 hex chars + prefix
	if len(token) != len("skd_anon_")+64 {
		t.Errorf("token length = %d, want %d", len(token), len("skd_anon_")+64)
	}

	// Uniqueness
	token2, _ := GenerateSessionToken()
	if token == token2 {
		t.Error("two tokens should not be identical")
	}
}

func TestGenerateJWT(t *testing.T) {
	secret := "test-secret-key-32chars-minimum!!"
	userID := "user-123"
	ttl := 1 * time.Hour

	signed, expiresAt, err := GenerateJWT(userID, secret, ttl)
	if err != nil {
		t.Fatalf("GenerateJWT() error = %v", err)
	}
	if signed == "" {
		t.Fatal("signed token should not be empty")
	}
	if expiresAt.Before(time.Now()) {
		t.Error("expiresAt should be in the future")
	}

	// Verify the token
	token, err := jwt.Parse(signed, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		t.Fatalf("token should be valid, err = %v", err)
	}

	claims := token.Claims.(jwt.MapClaims)
	if claims["user_id"] != userID {
		t.Errorf("user_id = %v, want %v", claims["user_id"], userID)
	}
	if claims["type"] != "user" {
		t.Errorf("type = %v, want user", claims["type"])
	}
}

func TestGenerateJWT_WrongSecret(t *testing.T) {
	signed, _, _ := GenerateJWT("user-1", "correct-secret-32chars!!", 1*time.Hour)

	// Parse with wrong secret should fail
	_, err := jwt.Parse(signed, func(t *jwt.Token) (interface{}, error) {
		return []byte("wrong-secret-32chars!!!"), nil
	})
	if err == nil {
		t.Error("parsing with wrong secret should fail")
	}
}

func TestGenerateJWT_AlgorithmEnforcement(t *testing.T) {
	secret := "test-secret"
	signed, _, _ := GenerateJWT("user-1", secret, 1*time.Hour)

	// Verify it uses HMAC (not 'none' or RSA)
	token, _ := jwt.Parse(signed, func(tok *jwt.Token) (interface{}, error) {
		if _, ok := tok.Method.(*jwt.SigningMethodHMAC); !ok {
			t.Errorf("unexpected signing method: %v", tok.Header["alg"])
		}
		return []byte(secret), nil
	})
	if !token.Valid {
		t.Error("token should be valid")
	}
}

func TestGenerateAnonymousJWT(t *testing.T) {
	secret := "test-secret"
	sessionID := "session-abc"

	signed, _, err := GenerateAnonymousJWT(sessionID, secret, 24*time.Hour)
	if err != nil {
		t.Fatalf("GenerateAnonymousJWT() error = %v", err)
	}

	token, _ := jwt.Parse(signed, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	claims := token.Claims.(jwt.MapClaims)
	if claims["type"] != "anonymous" {
		t.Errorf("type = %v, want anonymous", claims["type"])
	}
	// Anonymous JWTs should NOT have user_id
	if _, ok := claims["user_id"]; ok {
		t.Error("anonymous JWT should not contain user_id")
	}
}
