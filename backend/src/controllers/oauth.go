package controllers

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
)

// OAuthController handles Google and Apple sign-in.
type OAuthController struct {
	pool           *pgxpool.Pool
	rdb            *redis.Client
	jwtSecret      string
	googleClientID string
	appleClientID  string
}

func NewOAuthController(pool *pgxpool.Pool, rdb *redis.Client, jwtSecret, googleClientID, appleClientID string) *OAuthController {
	return &OAuthController{
		pool: pool, rdb: rdb, jwtSecret: jwtSecret,
		googleClientID: googleClientID, appleClientID: appleClientID,
	}
}

// ── Google Sign-In ───────────────────────────────────────────────────────────

type googleOAuthReq struct {
	IDToken string `json:"id_token"`
}

// GoogleLogin verifies a Google ID token and creates/logs in the user.
// POST /api/v1/auth/google
func (oc *OAuthController) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req googleOAuthReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDToken == "" {
		utils.Error(w, http.StatusBadRequest, "id_token is required")
		return
	}

	// Verify token with Google's tokeninfo endpoint
	resp, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + req.IDToken)
	if err != nil {
		utils.Error(w, http.StatusBadGateway, "failed to verify Google token")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		utils.Error(w, http.StatusUnauthorized, "invalid Google token")
		return
	}

	var claims struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified string `json:"email_verified"`
		Name          string `json:"name"`
		Aud           string `json:"aud"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		utils.Error(w, http.StatusBadGateway, "failed to parse Google response")
		return
	}

	// Verify audience matches our client ID
	if strings.TrimSpace(claims.Aud) != strings.TrimSpace(oc.googleClientID) {
		fmt.Printf("[OAUTH DEBUG] aud mismatch: token_aud=%q config_id=%q\n", claims.Aud, oc.googleClientID)
		utils.Error(w, http.StatusUnauthorized, "token not issued for this application")
		return
	}
	if claims.EmailVerified != "true" {
		utils.Error(w, http.StatusUnauthorized, "email not verified")
		return
	}

	oc.oauthUpsert(w, r, "google", claims.Sub, claims.Email, claims.Name)
}

// ── Apple Sign-In ────────────────────────────────────────────────────────────

type appleOAuthReq struct {
	IDToken  string  `json:"id_token"`
	FullName *string `json:"full_name,omitempty"` // Apple only sends name on first sign-in
}

// Apple JWKS cache
var (
	appleKeys   []appleJWK
	appleKeysMu sync.RWMutex
	appleKeysAt time.Time
)

type appleJWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func fetchAppleKeys() ([]appleJWK, error) {
	appleKeysMu.RLock()
	if time.Since(appleKeysAt) < 1*time.Hour && len(appleKeys) > 0 {
		defer appleKeysMu.RUnlock()
		return appleKeys, nil
	}
	appleKeysMu.RUnlock()

	resp, err := http.Get("https://appleid.apple.com/auth/keys")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Keys []appleJWK `json:"keys"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}

	appleKeysMu.Lock()
	appleKeys = result.Keys
	appleKeysAt = time.Now()
	appleKeysMu.Unlock()

	return result.Keys, nil
}

func appleKeyFunc(keys []appleJWK) jwt.Keyfunc {
	return func(token *jwt.Token) (any, error) {
		kid, ok := token.Header["kid"].(string)
		if !ok {
			return nil, fmt.Errorf("missing kid in token header")
		}
		for _, k := range keys {
			if k.Kid == kid && k.Kty == "RSA" {
				nBytes, _ := base64.RawURLEncoding.DecodeString(k.N)
				eBytes, _ := base64.RawURLEncoding.DecodeString(k.E)
				n := new(big.Int).SetBytes(nBytes)
				e := 0
				for _, b := range eBytes {
					e = e<<8 + int(b)
				}
				return &rsa.PublicKey{N: n, E: e}, nil
			}
		}
		return nil, fmt.Errorf("no matching key found for kid %s", kid)
	}
}

// AppleLogin verifies an Apple ID token and creates/logs in the user.
// POST /api/v1/auth/apple
func (oc *OAuthController) AppleLogin(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req appleOAuthReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDToken == "" {
		utils.Error(w, http.StatusBadRequest, "id_token is required")
		return
	}

	keys, err := fetchAppleKeys()
	if err != nil {
		utils.Error(w, http.StatusBadGateway, "failed to fetch Apple public keys")
		return
	}

	token, err := jwt.Parse(req.IDToken, appleKeyFunc(keys),
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithIssuer("https://appleid.apple.com"),
		jwt.WithAudience(oc.appleClientID),
	)
	if err != nil || !token.Valid {
		utils.Error(w, http.StatusUnauthorized, "invalid Apple token")
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		utils.Error(w, http.StatusUnauthorized, "invalid token claims")
		return
	}

	sub, _ := claims["sub"].(string)
	email, _ := claims["email"].(string)
	emailVerified, _ := claims["email_verified"].(bool)
	// Apple sometimes sends email_verified as string
	if !emailVerified {
		if ev, ok := claims["email_verified"].(string); ok && ev == "true" {
			emailVerified = true
		}
	}

	if sub == "" {
		utils.Error(w, http.StatusUnauthorized, "missing subject in token")
		return
	}
	if email != "" && !emailVerified {
		utils.Error(w, http.StatusUnauthorized, "email not verified")
		return
	}

	name := ""
	if req.FullName != nil {
		name = *req.FullName
	}

	oc.oauthUpsert(w, r, "apple", sub, email, name)
}

// ── Shared upsert: find-or-create user by provider ──────────────────────────

func (oc *OAuthController) oauthUpsert(w http.ResponseWriter, r *http.Request, provider, providerID, email, name string) {
	ctx := r.Context()

	email = strings.ToLower(strings.TrimSpace(email))

	// 1. Try to find existing user by provider + provider_id
	var userID string
	var displayName *string
	err := oc.pool.QueryRow(ctx,
		`SELECT id, display_name FROM users WHERE auth_provider=$1 AND provider_id=$2`,
		provider, providerID,
	).Scan(&userID, &displayName)

	if err != nil {
		// 2. Check if email exists with different provider
		if email != "" {
			err = oc.pool.QueryRow(ctx,
				`SELECT id, display_name FROM users WHERE email=$1`,
				email,
			).Scan(&userID, &displayName)
		}

		if err != nil {
			// 3. New user — create
			userID = uuid.New().String()
			var namePtr *string
			if name != "" {
				namePtr = &name
			}
			_, err = oc.pool.Exec(ctx,
				`INSERT INTO users (id, email, auth_provider, provider_id, display_name)
				 VALUES ($1, $2, $3, $4, $5)`,
				userID, email, provider, providerID, namePtr,
			)
			if err != nil {
				utils.Error(w, http.StatusInternalServerError, "failed to create user")
				return
			}
			displayName = namePtr
		} else {
			// Email match — link provider to existing account
			_, _ = oc.pool.Exec(ctx,
				`UPDATE users SET auth_provider=$1, provider_id=$2, updated_at=NOW() WHERE id=$3`,
				provider, providerID, userID,
			)
		}
	}

	// Update display name if we got one and user doesn't have one
	if displayName == nil && name != "" {
		_, _ = oc.pool.Exec(ctx,
			`UPDATE users SET display_name=$1, updated_at=NOW() WHERE id=$2`,
			name, userID,
		)
		displayName = &name
	}

	token, expiresAt, err := utils.GenerateJWT(userID, oc.jwtSecret, jwtTTL)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	setAuthCookie(w, r, token, expiresAt)
	utils.JSON(w, http.StatusOK, models.AuthResponse{
		UserID:      userID,
		Token:       token,
		DisplayName: displayName,
		ExpiresAt:   expiresAt,
	})
}
