package controllers

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
	"golang.org/x/crypto/bcrypt"
)

var emailRe = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// AuthController handles registration and login.
type AuthController struct {
	pool      *pgxpool.Pool
	rdb       *redis.Client
	jwtSecret string
}

// NewAuthController creates an AuthController.
func NewAuthController(pool *pgxpool.Pool, rdb *redis.Client, jwtSecret string) *AuthController {
	return &AuthController{pool: pool, rdb: rdb, jwtSecret: jwtSecret}
}

// Register handles POST /api/v1/auth/register.
func (ac *AuthController) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || req.Password == "" {
		utils.Error(w, http.StatusBadRequest, "email and password are required")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if !emailRe.MatchString(req.Email) {
		utils.Error(w, http.StatusBadRequest, "invalid email format")
		return
	}
	if len(req.Password) < 8 {
		utils.Error(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	ctx := r.Context()

	// Check existing user
	var exists bool
	_ = ac.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email=$1)`, req.Email).Scan(&exists)
	if exists {
		utils.Error(w, http.StatusConflict, "email already registered")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to hash password")
		return
	}
	hashStr := string(hash)

	userID := uuid.New().String()
	_, err = ac.pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, auth_provider, display_name)
		 VALUES ($1, $2, $3, 'email', $4)`,
		userID, req.Email, hashStr, req.DisplayName,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	token, expiresAt, err := utils.GenerateJWT(userID, ac.jwtSecret, jwtTTL)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	setAuthCookie(w, r, token, expiresAt)
	utils.JSON(w, http.StatusCreated, models.AuthResponse{
		UserID:      userID,
		Token:       token,
		DisplayName: req.DisplayName,
		ExpiresAt:   expiresAt,
	})
}

// Login handles POST /api/v1/auth/login.
func (ac *AuthController) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()

	if req.Email != nil && req.Password != nil {
		// Email/password login
		email := strings.ToLower(strings.TrimSpace(*req.Email))
		var userID, hashStr string
		var displayName *string
		err := ac.pool.QueryRow(ctx,
			`SELECT id, password_hash, display_name FROM users WHERE email=$1 AND auth_provider='email'`,
			email,
		).Scan(&userID, &hashStr, &displayName)
		if err != nil {
			utils.Error(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(hashStr), []byte(*req.Password)); err != nil {
			utils.Error(w, http.StatusUnauthorized, "invalid credentials")
			return
		}

		token, expiresAt, err := utils.GenerateJWT(userID, ac.jwtSecret, jwtTTL)
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
		return
	}

	utils.Error(w, http.StatusBadRequest, "email and password are required")
}

// Logout handles POST /api/v1/auth/logout — clears the session cookie.
func (ac *AuthController) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:    "session_token",
		Value:   "",
		Path:    "/",
		Expires: time.Unix(0, 0),
		MaxAge:  -1,
	})
	utils.JSON(w, http.StatusOK, map[string]string{"status": "logged out"})
}

func setAuthCookie(w http.ResponseWriter, r *http.Request, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session_token",
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteStrictMode, // STRICT is safer than Lax for auth cookies
	})
}
