package middlewares

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-jwt-secret-for-unit-tests!!"

func makeTestJWT(claims jwt.MapClaims, secret string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := token.SignedString([]byte(secret))
	return signed
}

func TestAuthRequired_NoToken(t *testing.T) {
	handler := AuthRequired(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called without token")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthRequired_InvalidToken(t *testing.T) {
	handler := AuthRequired(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with invalid token")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer totally-not-a-jwt")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthRequired_ExpiredToken(t *testing.T) {
	token := makeTestJWT(jwt.MapClaims{
		"id":   "user-1",
		"type": "user",
		"exp":  time.Now().Add(-1 * time.Hour).Unix(),
	}, testSecret)

	handler := AuthRequired(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with expired token")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthRequired_WrongSecret(t *testing.T) {
	token := makeTestJWT(jwt.MapClaims{
		"id":   "user-1",
		"type": "user",
		"exp":  time.Now().Add(1 * time.Hour).Unix(),
	}, "different-secret-key-here!!!")

	handler := AuthRequired(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with wrong-secret token")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthRequired_ValidToken(t *testing.T) {
	token := makeTestJWT(jwt.MapClaims{
		"id":      "session-1",
		"type":    "user",
		"user_id": "user-123",
		"exp":     time.Now().Add(1 * time.Hour).Unix(),
	}, testSecret)

	called := false
	handler := AuthRequired(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		session := GetSession(r)
		if session == nil {
			t.Fatal("session should not be nil")
		}
		if session.ID != "session-1" {
			t.Errorf("session.ID = %q, want session-1", session.ID)
		}
		if session.UserID == nil || *session.UserID != "user-123" {
			t.Errorf("session.UserID = %v, want user-123", session.UserID)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Error("handler should have been called")
	}
	if rr.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rr.Code, http.StatusOK)
	}
}

func TestAuthOptional_NoToken(t *testing.T) {
	called := false
	handler := AuthOptional(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		session := GetSession(r)
		if session != nil {
			t.Error("session should be nil without token")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if !called {
		t.Error("handler should be called even without token")
	}
}

func TestAuthRequired_NoneAlgorithm(t *testing.T) {
	// JWT with alg:none — classic attack vector
	token := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
		"id":   "user-1",
		"type": "user",
		"exp":  time.Now().Add(1 * time.Hour).Unix(),
	})
	signed, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

	handler := AuthRequired(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with alg:none token")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("alg:none should be rejected, got status %d", rr.Code)
	}
}

func TestAuthRequired_MissingClaims(t *testing.T) {
	// Valid JWT but missing required claims (id, type)
	token := makeTestJWT(jwt.MapClaims{
		"exp": time.Now().Add(1 * time.Hour).Unix(),
	}, testSecret)

	handler := AuthRequired(testSecret)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with missing claims")
	}))

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("missing claims should be rejected, got status %d", rr.Code)
	}
}

func TestExtractToken_Sources(t *testing.T) {
	tests := []struct {
		name   string
		setup  func(*http.Request)
		want   string
	}{
		{"bearer header", func(r *http.Request) {
			r.Header.Set("Authorization", "Bearer test-token-123")
		}, "test-token-123"},
		{"x-session-token header", func(r *http.Request) {
			r.Header.Set("X-Session-Token", "session-abc")
		}, "session-abc"},
		{"cookie", func(r *http.Request) {
			r.AddCookie(&http.Cookie{Name: "session_token", Value: "cookie-token"})
		}, "cookie-token"},
		{"no token", func(r *http.Request) {}, ""},
		{"bearer priority over cookie", func(r *http.Request) {
			r.Header.Set("Authorization", "Bearer bearer-wins")
			r.AddCookie(&http.Cookie{Name: "session_token", Value: "cookie-loses"})
		}, "bearer-wins"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			tt.setup(req)
			got := extractToken(req)
			if got != tt.want {
				t.Errorf("extractToken() = %q, want %q", got, tt.want)
			}
		})
	}
}
