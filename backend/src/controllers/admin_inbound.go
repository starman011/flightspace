package controllers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/skydot/backend/src/utils"
)

// ── Resend inbound webhook ─────────────────────────────────────────────────
// Resend fires `email.received` (metadata only); we then pull the full body
// from the Received emails API and store it so the admin can read + reply.

func verifySvix(secret, id, ts string, body []byte, sigHeader string) bool {
	secret = strings.TrimSpace(secret)
	if secret == "" || id == "" || ts == "" || sigHeader == "" {
		return false
	}
	key := secret
	if strings.HasPrefix(key, "whsec_") {
		key = key[len("whsec_"):]
	}
	rawKey, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, rawKey)
	mac.Write([]byte(id + "." + ts + "."))
	mac.Write(body)
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	// svix-signature is space-separated "v1,<sig>" entries
	for _, part := range strings.Fields(sigHeader) {
		if i := strings.IndexByte(part, ','); i >= 0 {
			if hmac.Equal([]byte(part[i+1:]), []byte(expected)) {
				return true
			}
		}
	}
	return false
}

func (ac *AdminController) ResendWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		utils.Error(w, http.StatusBadRequest, "read failed")
		return
	}

	// Verify signature when a secret is configured (recommended).
	if secret := os.Getenv("RESEND_WEBHOOK_SECRET"); secret != "" {
		if !verifySvix(secret, r.Header.Get("svix-id"), r.Header.Get("svix-timestamp"), body, r.Header.Get("svix-signature")) {
			utils.Error(w, http.StatusUnauthorized, "invalid signature")
			return
		}
	} else {
		log.Println(`{"level":"warn","service":"webhook","msg":"RESEND_WEBHOOK_SECRET not set — accepting unverified"}`)
	}

	var evt struct {
		Type string `json:"type"`
		Data struct {
			EmailID string `json:"email_id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &evt); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid json")
		return
	}

	if evt.Type == "email.received" && evt.Data.EmailID != "" {
		if err := ac.fetchAndStoreReceived(r.Context(), evt.Data.EmailID); err != nil {
			// 5xx so Resend retries.
			log.Printf(`{"level":"error","service":"webhook","msg":"store failed","error":%q}`, err)
			utils.Error(w, http.StatusInternalServerError, "processing failed")
			return
		}
	}
	utils.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (ac *AdminController) fetchAndStoreReceived(ctx context.Context, emailID string) error {
	// Reading received emails needs a full-access key. Prefer a dedicated
	// RESEND_READ_API_KEY (so the send key can stay restricted); fall back to
	// RESEND_API_KEY if it already has full access.
	apiKey := os.Getenv("RESEND_READ_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("RESEND_API_KEY")
	}
	if apiKey == "" {
		return fmt.Errorf("RESEND_READ_API_KEY / RESEND_API_KEY not set")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		"https://api.resend.com/emails/receiving/"+emailID, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	resp, err := (&http.Client{Timeout: 12 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("resend receiving status %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	var e struct {
		From      string   `json:"from"`
		To        []string `json:"to"`
		Subject   string   `json:"subject"`
		Text      *string  `json:"text"`
		HTML      *string  `json:"html"`
		CreatedAt string   `json:"created_at"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&e); err != nil {
		return err
	}

	var receivedAt *time.Time
	if t, err := time.Parse(time.RFC3339, e.CreatedAt); err == nil {
		receivedAt = &t
	}

	_, err = ac.pool.Exec(ctx,
		`INSERT INTO inbound_emails (resend_id, from_addr, to_addrs, subject, text_body, html_body, received_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (resend_id) DO UPDATE
		   SET text_body = EXCLUDED.text_body, html_body = EXCLUDED.html_body, subject = EXCLUDED.subject`,
		emailID, e.From, strings.Join(e.To, ", "), e.Subject, e.Text, e.HTML, receivedAt,
	)
	return err
}

// ── Admin: inbound list / read / reply ─────────────────────────────────────

type inboundEmail struct {
	ID        string  `json:"id"`
	From      string  `json:"from"`
	To        *string `json:"to,omitempty"`
	Subject   *string `json:"subject,omitempty"`
	Text      *string `json:"text,omitempty"`
	HTML      *string `json:"html,omitempty"`
	CreatedAt string  `json:"created_at"`
	ReadAt    *string `json:"read_at,omitempty"`
	RepliedAt *string `json:"replied_at,omitempty"`
	ReplyBody *string `json:"reply_body,omitempty"`
}

func (ac *AdminController) ListInbound(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	rows, err := ac.pool.Query(r.Context(),
		`SELECT id, from_addr, to_addrs, subject, text_body, html_body,
		        COALESCE(received_at, created_at), read_at, replied_at, reply_body
		   FROM inbound_emails ORDER BY COALESCE(received_at, created_at) DESC LIMIT 300`)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	defer rows.Close()

	out := make([]inboundEmail, 0, 64)
	for rows.Next() {
		var m inboundEmail
		var created time.Time
		var readAt, repliedAt *time.Time
		if err := rows.Scan(&m.ID, &m.From, &m.To, &m.Subject, &m.Text, &m.HTML, &created, &readAt, &repliedAt, &m.ReplyBody); err != nil {
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
		out = append(out, m)
	}
	utils.JSON(w, http.StatusOK, map[string]any{"messages": out})
}

// SyncInbound imports a specific received email by its Resend id (backfill /
// history for emails that arrived before the webhook was live, or if it missed one).
func (ac *AdminController) SyncInbound(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var body struct {
		EmailID string `json:"email_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid json")
		return
	}
	id := strings.TrimSpace(body.EmailID)
	if id == "" || len(id) > 80 || strings.ContainsAny(id, "/ \t\r\n?#&") {
		utils.Error(w, http.StatusBadRequest, "invalid email id")
		return
	}
	if err := ac.fetchAndStoreReceived(r.Context(), id); err != nil {
		log.Printf(`{"level":"error","service":"admin","msg":"sync failed","id":%q,"error":%q}`, id, err)
		utils.Error(w, http.StatusBadGateway, "Resend fetch failed: "+err.Error())
		return
	}
	utils.JSON(w, http.StatusOK, map[string]string{"status": "synced"})
}

func (ac *AdminController) InboundRead(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	if _, err := ac.pool.Exec(r.Context(),
		`UPDATE inbound_emails SET read_at = COALESCE(read_at, NOW()) WHERE id = $1`, id); err != nil {
		utils.Error(w, http.StatusBadRequest, "update failed")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (ac *AdminController) InboundReply(w http.ResponseWriter, r *http.Request) {
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
	if len(body.Reply) < 2 || len(body.Reply) > 8000 {
		utils.Error(w, http.StatusBadRequest, "invalid reply length")
		return
	}

	var from string
	var subject *string
	if err := ac.pool.QueryRow(r.Context(),
		`SELECT from_addr, subject FROM inbound_emails WHERE id = $1`, id).Scan(&from, &subject); err != nil {
		utils.Error(w, http.StatusNotFound, "message not found")
		return
	}
	subj := "Re: your message to ObjectTracer"
	if subject != nil && strings.TrimSpace(*subject) != "" {
		subj = "Re: " + *subject
	}
	// from may be "Name <addr@x.com>" — extract the address for the To field.
	to := from
	if i := strings.LastIndexByte(from, '<'); i >= 0 {
		if j := strings.IndexByte(from[i:], '>'); j >= 0 {
			to = strings.TrimSpace(from[i+1 : i+j])
		}
	}

	if err := sendInboundReply(to, subj, body.Reply); err != nil {
		log.Printf(`{"level":"error","service":"admin","msg":"inbound reply failed","error":%q}`, err)
		utils.Error(w, http.StatusBadGateway, "email send failed")
		return
	}

	if _, err := ac.pool.Exec(r.Context(),
		`UPDATE inbound_emails SET replied_at = NOW(), reply_body = $2, read_at = COALESCE(read_at, NOW()) WHERE id = $1`,
		id, body.Reply); err != nil {
		log.Printf(`{"level":"error","service":"admin","msg":"mark inbound replied failed","error":%q}`, err)
	}
	utils.JSON(w, http.StatusOK, map[string]string{"status": "replied"})
}

func sendInboundReply(to, subject, reply string) error {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("RESEND_API_KEY not set")
	}
	htmlBody := fmt.Sprintf(`<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#04080f;font-family:Arial,sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:32px auto;">
  <tr><td style="padding:32px;background:#07101a;border:1px solid #1a2e10;border-radius:16px;">
    <p style="margin:0 0 20px;font-size:10px;font-family:'Courier New',monospace;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#bce419;">&#9711; OBJECTTRACER</p>
    <div style="font-size:14px;line-height:1.8;color:#c8d2e1;white-space:pre-wrap;">%s</div>
  </td></tr>
</table></body></html>`, html.EscapeString(reply))

	payload := map[string]any{
		"from":     "ObjectTracer <hello@objecttracer.com>",
		"to":       []string{to},
		"reply_to": "hello@objecttracer.com",
		"subject":  subject,
		"html":     htmlBody,
	}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("resend status %d", resp.StatusCode)
	}
	return nil
}
