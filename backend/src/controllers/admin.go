package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/skydot/backend/src/middlewares"
	"github.com/skydot/backend/src/utils"
)

// AdminController serves the single-admin panel: reviewing and replying to
// contact-form messages. Every handler is gated to one allowlisted email.
type AdminController struct {
	pool *pgxpool.Pool
}

func NewAdminController(pool *pgxpool.Pool) *AdminController {
	return &AdminController{pool: pool}
}

// adminEmail is the only account allowed into the admin panel.
func adminEmail() string {
	e := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL")))
	if e == "" {
		return "forprogrammingonly01@gmail.com"
	}
	return e
}

// isAdmin reports whether the request is from the allowlisted admin's verified
// Google account. Enforced server-side on every admin endpoint.
func (ac *AdminController) isAdmin(r *http.Request) bool {
	s := middlewares.GetSession(r)
	if s == nil || s.UserID == nil || *s.UserID == "" {
		return false
	}
	var email string
	if err := ac.pool.QueryRow(r.Context(),
		`SELECT COALESCE(email, '') FROM users WHERE id = $1`, *s.UserID,
	).Scan(&email); err != nil {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(email), adminEmail())
}

type adminMessage struct {
	ID        string  `json:"id"`
	Name      *string `json:"name,omitempty"`
	Email     string  `json:"email"`
	Message   string  `json:"message"`
	CreatedAt string  `json:"created_at"`
	ReadAt    *string `json:"read_at,omitempty"`
	RepliedAt *string `json:"replied_at,omitempty"`
	ReplyBody *string `json:"reply_body,omitempty"`
}

// GetMe reports whether the caller is the admin (used by the frontend to gate UI).
func (ac *AdminController) GetMe(w http.ResponseWriter, r *http.Request) {
	utils.JSON(w, http.StatusOK, map[string]any{"admin": ac.isAdmin(r), "email": adminEmail()})
}

// ListMessages returns the most recent contact submissions.
func (ac *AdminController) ListMessages(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	rows, err := ac.pool.Query(r.Context(),
		`SELECT id, name, email, message, created_at, read_at, replied_at, reply_body
		   FROM contact_messages ORDER BY created_at DESC LIMIT 300`)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	msgs := make([]adminMessage, 0, 64)
	for rows.Next() {
		var m adminMessage
		var created time.Time
		var readAt, repliedAt *time.Time
		if err := rows.Scan(&m.ID, &m.Name, &m.Email, &m.Message, &created, &readAt, &repliedAt, &m.ReplyBody); err != nil {
			continue
		}
		m.CreatedAt = created.UTC().Format(time.RFC3339)
		if readAt != nil {
			s := readAt.UTC().Format(time.RFC3339)
			m.ReadAt = &s
		}
		if repliedAt != nil {
			s := repliedAt.UTC().Format(time.RFC3339)
			m.RepliedAt = &s
		}
		msgs = append(msgs, m)
	}
	utils.JSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

// MarkRead flags a message as read.
func (ac *AdminController) MarkRead(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if _, err := ac.pool.Exec(r.Context(),
		`UPDATE contact_messages SET read_at = COALESCE(read_at, NOW()) WHERE id = $1`, id,
	); err != nil {
		utils.Error(w, http.StatusBadRequest, "update failed")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Reply emails a reply to the sender via Resend and records it.
func (ac *AdminController) Reply(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))

	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	var body struct {
		Reply string `json:"reply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid json")
		return
	}
	body.Reply = strings.TrimSpace(body.Reply)
	if len(body.Reply) < 2 {
		utils.Error(w, http.StatusBadRequest, "reply too short")
		return
	}
	if len(body.Reply) > 8000 {
		utils.Error(w, http.StatusBadRequest, "reply too long")
		return
	}

	var toEmail, name, original string
	if err := ac.pool.QueryRow(r.Context(),
		`SELECT email, COALESCE(name, ''), message FROM contact_messages WHERE id = $1`, id,
	).Scan(&toEmail, &name, &original); err != nil {
		utils.Error(w, http.StatusNotFound, "message not found")
		return
	}

	if err := sendReplyEmail(toEmail, name, body.Reply, original); err != nil {
		log.Printf(`{"level":"error","service":"admin","msg":"reply send failed","error":%q}`, err)
		utils.Error(w, http.StatusBadGateway, "email send failed")
		return
	}

	if _, err := ac.pool.Exec(r.Context(),
		`UPDATE contact_messages SET replied_at = NOW(), reply_body = $2, read_at = COALESCE(read_at, NOW()) WHERE id = $1`,
		id, body.Reply,
	); err != nil {
		log.Printf(`{"level":"error","service":"admin","msg":"mark replied failed","error":%q}`, err)
	}

	utils.JSON(w, http.StatusOK, map[string]string{"status": "replied"})
}

// sendReplyEmail sends the admin's reply to the original sender via Resend.
func sendReplyEmail(to, name, reply, original string) error {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("RESEND_API_KEY not set")
	}

	greeting := "Hi,"
	if name != "" {
		greeting = fmt.Sprintf("Hi %s,", html.EscapeString(name))
	}

	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#04080f;font-family:Arial,sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:32px auto;">
  <tr><td style="padding:32px;background:#07101a;border:1px solid #1a2e10;border-radius:16px;">
    <p style="margin:0 0 20px;font-size:10px;font-family:'Courier New',monospace;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#bce419;">&#9711; OBJECTTRACER</p>
    <p style="margin:0 0 12px;font-size:14px;color:#c8d2e1;">%s</p>
    <div style="font-size:14px;line-height:1.8;color:#c8d2e1;white-space:pre-wrap;">%s</div>
    <hr style="border:none;border-top:1px solid #162030;margin:24px 0;" />
    <p style="margin:0;font-size:11px;color:#3a5060;font-family:'Courier New',monospace;white-space:pre-wrap;">You wrote:\n%s</p>
  </td></tr>
</table>
</body>
</html>`, greeting, html.EscapeString(reply), html.EscapeString(original))

	payload := map[string]any{
		"from":     "ObjectTracer <hello@objecttracer.com>",
		"to":       []string{to},
		"reply_to": "hello@objecttracer.com",
		"subject":  "Re: your message to ObjectTracer",
		"html":     htmlBody,
	}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("resend status %d", resp.StatusCode)
	}
	return nil
}
