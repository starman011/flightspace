package controllers

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/skydot/backend/src/utils"
)

type WaitlistController struct{ pool *pgxpool.Pool }

func NewWaitlistController(pool *pgxpool.Pool) *WaitlistController {
	return &WaitlistController{pool: pool}
}

// Subscribe saves an email to the waitlist and sends a confirmation via Resend.
// Idempotent — duplicate emails are silently accepted (no second email sent).
func (c *WaitlistController) Subscribe(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var body struct {
		Email  string `json:"email"`
		Source string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid json")
		return
	}

	email, err := utils.NormalizeEmail(body.Email)
	if err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid email")
		return
	}

	source := body.Source
	if source == "" {
		source = "popup"
	}
	if len(source) > 50 {
		utils.Error(w, http.StatusBadRequest, "source too long")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// rowsAffected = 0 means duplicate — skip the confirmation email
	tag, err := c.pool.Exec(ctx,
		`INSERT INTO waitlist_emails (email, source)
		 VALUES ($1, $2)
		 ON CONFLICT (email) DO NOTHING`,
		email, source,
	)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "server error")
		return
	}

	if tag.RowsAffected() > 0 {
		go sendWaitlistEmail(email)
	}

	utils.JSON(w, http.StatusOK, map[string]string{"status": "subscribed"})
}

// sendWaitlistEmail fires a confirmation email via Resend in a goroutine.
// Failures are logged but never surface to the user.
func sendWaitlistEmail(to string) {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		log.Println(`{"level":"warn","service":"waitlist","msg":"RESEND_API_KEY not set — skipping email"}`)
		return
	}

	payload := map[string]any{
		"from":    "ObjectTracer <hello@objecttracer.com>",
		"to":      []string{to},
		"subject": "You're on the ObjectTracer waitlist",
		"html": `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#050a0f;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:40px auto;">
    <tr>
      <td style="padding:40px 32px;background:#0a1018;border:1px solid rgba(0,229,255,0.12);border-radius:16px;">

        <!-- Wordmark -->
        <div style="margin-bottom:28px;">
          <p style="margin:0;font-size:13px;font-family:monospace;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#00e5ff;">&#9711; FLIGHTSPACE</p>
        </div>

        <p style="margin:0 0 6px;font-size:10px;font-family:monospace;letter-spacing:.2em;text-transform:uppercase;color:rgba(0,229,255,0.6);">
          SIGNAL RECEIVED
        </p>
        <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;color:#fff;letter-spacing:-.02em;line-height:1.2;">
          You're on the<br>ObjectTracer waitlist.
        </h1>

        <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:rgba(195,245,255,0.6);">
          We're building a one-stop platform for everything in space and moving —
          satellites, launches, asteroids, the ISS, and beyond.
          You'll be among the first to know when new features go live.
        </p>

        <div style="background:rgba(0,229,255,0.05);border:1px solid rgba(0,229,255,0.12);border-radius:10px;padding:16px 20px;margin-bottom:28px;">
          <p style="margin:0 0 4px;font-size:10px;font-family:monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(0,229,255,0.45);">CURRENTLY TRACKING</p>
          <p style="margin:0;font-size:14px;color:rgba(195,245,255,0.8);">
            ✦ Live aircraft &amp; satellite positions<br>
            ✦ ISS real-time trajectory<br>
            ✦ Upcoming rocket launches<br>
            ✦ Near-Earth asteroids
          </p>
        </div>

        <a href="https://objecttracer.com" style="display:inline-block;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.3);border-radius:8px;padding:10px 22px;font-size:12px;font-family:monospace;letter-spacing:.1em;text-transform:uppercase;color:#00e5ff;text-decoration:none;">
          Open ObjectTracer
        </a>

        <p style="margin:28px 0 0;font-size:11px;color:rgba(195,245,255,0.2);line-height:1.6;">
          You're receiving this because you signed up at objecttracer.com.<br>
          No spam — only launch announcements.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
	}

	b, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(b))
	if err != nil {
		log.Printf(`{"level":"error","service":"waitlist","msg":"resend request build failed","error":%q}`, err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf(`{"level":"error","service":"waitlist","msg":"resend send failed","error":%q}`, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf(`{"level":"error","service":"waitlist","msg":"resend non-2xx","status":%d}`, resp.StatusCode)
		return
	}

	log.Printf(`{"level":"info","service":"waitlist","msg":"confirmation sent","to":%q}`, to)
}
