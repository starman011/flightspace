package controllers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/skydot/backend/src/utils"
)

func ContactSubmit(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 8192)

	var body struct {
		Name    string `json:"name"`
		Email   string `json:"email"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid json")
		return
	}

	body.Message = strings.TrimSpace(body.Message)
	body.Name    = strings.TrimSpace(body.Name)

	email, err := utils.NormalizeEmail(body.Email)
	if err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid email")
		return
	}
	if len(body.Message) < 5 {
		utils.Error(w, http.StatusBadRequest, "message too short")
		return
	}
	if len(body.Message) > 4000 {
		utils.Error(w, http.StatusBadRequest, "message too long")
		return
	}

	go sendContactEmail(body.Name, email, body.Message)

	utils.JSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

func sendContactEmail(name, from, message string) {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		log.Println(`{"level":"warn","service":"contact","msg":"RESEND_API_KEY not set"}`)
		return
	}

	sender := from
	if name != "" {
		sender = fmt.Sprintf("%s (%s)", name, from)
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#04080f;font-family:Arial,sans-serif;">
<table width="100%%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:32px auto;">
  <tr><td style="padding:32px;background:#07101a;border:1px solid #1a2e10;border-radius:16px;">
    <p style="margin:0 0 4px;font-size:10px;font-family:'Courier New',monospace;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#b2ff1a;">&#9711; OBJECTTRACER</p>
    <p style="margin:0 0 20px;font-size:9px;font-family:'Courier New',monospace;letter-spacing:.16em;text-transform:uppercase;color:rgba(178,255,26,0.4);">New contact message</p>
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#f3f2ec;letter-spacing:-.02em;">Message from %s</h2>
    <div style="background:#0b1520;border:1px solid #162030;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
      <p style="margin:0;font-size:14px;line-height:1.8;color:#8a9ab0;white-space:pre-wrap;">%s</p>
    </div>
    <p style="margin:0;font-size:12px;color:#3a5060;font-family:'Courier New',monospace;">Reply to: %s</p>
  </td></tr>
</table>
</body>
</html>`, sender, message, from)

	payload := map[string]any{
		"from":     "ObjectTracer Contact <hello@objecttracer.com>",
		"to":       []string{"helldiver.star@gmail.com"},
		"reply_to": from,
		"subject":  fmt.Sprintf("Contact: %s", sender),
		"html":     html,
	}

	b, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(b))
	if err != nil {
		log.Printf(`{"level":"error","service":"contact","msg":"request build failed","error":%q}`, err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf(`{"level":"error","service":"contact","msg":"resend failed","error":%q}`, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf(`{"level":"error","service":"contact","msg":"resend non-2xx","status":%d}`, resp.StatusCode)
		return
	}
	log.Printf(`{"level":"info","service":"contact","msg":"message sent","from":%q}`, from)
}
