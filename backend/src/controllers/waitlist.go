package controllers

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/skydot/backend/src/utils"
)

var emailRE = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

type WaitlistController struct{ pool *pgxpool.Pool }

func NewWaitlistController(pool *pgxpool.Pool) *WaitlistController {
	return &WaitlistController{pool: pool}
}

// Subscribe saves an email to the waitlist. Idempotent — duplicate emails return 200.
func (c *WaitlistController) Subscribe(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email  string `json:"email"`
		Source string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid json")
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	if !emailRE.MatchString(email) {
		utils.Error(w, http.StatusBadRequest, "invalid email")
		return
	}

	source := body.Source
	if source == "" {
		source = "popup"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err := c.pool.Exec(ctx,
		`INSERT INTO waitlist_emails (email, source)
		 VALUES ($1, $2)
		 ON CONFLICT (email) DO NOTHING`,
		email, source,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "server error")
		return
	}

	utils.JSON(w, http.StatusOK, map[string]string{"status": "subscribed"})
}
