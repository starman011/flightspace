package controllers

import (
	"strings"

	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"github.com/skydot/backend/src/middlewares"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
	"golang.org/x/crypto/hkdf"
)

// PushController handles push subscription management and notification sending.
type PushController struct {
	pool       *pgxpool.Pool
	vapidPub   string // base64url-encoded VAPID public key
	vapidPriv  *ecdsa.PrivateKey
	vapidEmail string
}

// NewPushController creates a PushController from base64url-encoded VAPID keys.
func NewPushController(pool *pgxpool.Pool, pubKey, privKey, email string) (*PushController, error) {
	pubBytes, err := base64.RawURLEncoding.DecodeString(pubKey)
	if err != nil {
		return nil, fmt.Errorf("decode VAPID public key: %w", err)
	}
	privBytes, err := base64.RawURLEncoding.DecodeString(privKey)
	if err != nil {
		return nil, fmt.Errorf("decode VAPID private key: %w", err)
	}
	x, y := elliptic.Unmarshal(elliptic.P256(), pubBytes)
	if x == nil {
		return nil, fmt.Errorf("invalid VAPID public key")
	}
	priv := &ecdsa.PrivateKey{
		PublicKey: ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y},
		D:         new(big.Int).SetBytes(privBytes),
	}
	return &PushController{pool: pool, vapidPub: pubKey, vapidPriv: priv, vapidEmail: email}, nil
}

// HandleSubscribe stores a push subscription for a launch or a flight.
//
// SECURITY: flight targets ("flight:<icao24>") require an authenticated
// session. This is enforced HERE, on the server — the UI gate is a courtesy,
// not a control. An open subscribe endpoint lets anyone register unlimited
// subscriptions against our VAPID sender and get it throttled or blocked.
func (pc *PushController) HandleSubscribe(w http.ResponseWriter, r *http.Request) {
	var req models.PushSubscribeRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Endpoint == "" || req.KeyP256dh == "" || req.KeyAuth == "" || req.LaunchID == "" {
		utils.Error(w, http.StatusBadRequest, "missing required fields")
		return
	}

	if strings.HasPrefix(req.LaunchID, "flight:") {
		if sess := middlewares.GetSession(r); sess == nil || sess.UserID == nil || *sess.UserID == "" {
			utils.Error(w, http.StatusUnauthorized, "sign in to set a flight alert")
			return
		}
	}

	_, err := pc.pool.Exec(r.Context(),
		`INSERT INTO push_subscriptions (endpoint, key_p256dh, key_auth, launch_id)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (endpoint, launch_id) DO NOTHING`,
		req.Endpoint, req.KeyP256dh, req.KeyAuth, req.LaunchID)
	if err != nil {
		log.Printf(`{"level":"error","service":"push","msg":"subscribe failed","error":%q}`, err)
		utils.Error(w, http.StatusInternalServerError, "failed to subscribe")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]string{"status": "subscribed"})
}

// HandleUnsubscribe removes a push subscription for a launch.
func (pc *PushController) HandleUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Endpoint string `json:"endpoint"`
		LaunchID string `json:"launch_id"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Endpoint == "" || req.LaunchID == "" {
		utils.Error(w, http.StatusBadRequest, "missing required fields")
		return
	}

	_, err := pc.pool.Exec(r.Context(),
		`DELETE FROM push_subscriptions WHERE endpoint = $1 AND launch_id = $2`,
		req.Endpoint, req.LaunchID)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "failed to unsubscribe")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]string{"status": "unsubscribed"})
}

// HandleGetVAPIDKey returns the public VAPID key for the client.
func (pc *PushController) HandleGetVAPIDKey(w http.ResponseWriter, r *http.Request) {
	utils.JSON(w, http.StatusOK, map[string]string{"public_key": pc.vapidPub})
}

// HandleCheckSubscription checks if a subscription exists for a launch.
func (pc *PushController) HandleCheckSubscription(w http.ResponseWriter, r *http.Request) {
	endpoint := r.URL.Query().Get("endpoint")
	launchID := r.URL.Query().Get("launch_id")
	if endpoint == "" || launchID == "" {
		utils.Error(w, http.StatusBadRequest, "missing endpoint or launch_id")
		return
	}
	var exists bool
	err := pc.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM push_subscriptions WHERE endpoint = $1 AND launch_id = $2)`,
		endpoint, launchID).Scan(&exists)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "query failed")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]bool{"subscribed": exists})
}

// SendNotification sends a Web Push notification using stdlib crypto (RFC 8291 + VAPID).
func (pc *PushController) SendNotification(sub models.PushSubscription, payload models.PushPayload) error {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	encrypted, localPub, salt, err := encryptPayload(sub.KeyP256dh, sub.KeyAuth, payloadBytes)
	if err != nil {
		return fmt.Errorf("encrypt: %w", err)
	}

	body := buildPushBody(encrypted, localPub, salt)

	vapidHeader, err := pc.buildVAPIDAuth(sub.Endpoint)
	if err != nil {
		return fmt.Errorf("vapid: %w", err)
	}

	req, _ := http.NewRequest("POST", sub.Endpoint, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("TTL", "86400")
	req.Header.Set("Authorization", vapidHeader)
	req.Header.Set("Content-Length", fmt.Sprintf("%d", len(body)))

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 410 || resp.StatusCode == 404 {
		// Subscription expired — clean up
		pc.pool.Exec(context.Background(),
			`DELETE FROM push_subscriptions WHERE endpoint = $1`, sub.Endpoint)
		return fmt.Errorf("subscription expired (status %d)", resp.StatusCode)
	}
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("push failed: status %d, body: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// GetSubscriptionsForLaunch returns all push subscriptions for a launch ID.
func (pc *PushController) GetSubscriptionsForLaunch(ctx context.Context, launchID string) ([]models.PushSubscription, error) {
	rows, err := pc.pool.Query(ctx,
		`SELECT id, endpoint, key_p256dh, key_auth, launch_id, created_at FROM push_subscriptions WHERE launch_id = $1`,
		launchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subs []models.PushSubscription
	for rows.Next() {
		var s models.PushSubscription
		if err := rows.Scan(&s.ID, &s.Endpoint, &s.KeyP256dh, &s.KeyAuth, &s.LaunchID, &s.CreatedAt); err != nil {
			continue
		}
		subs = append(subs, s)
	}
	return subs, nil
}

// ── VAPID JWT ──────────────────────────────────────────────────────────────────

func (pc *PushController) buildVAPIDAuth(endpoint string) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	aud := fmt.Sprintf("%s://%s", u.Scheme, u.Host)

	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"aud": aud,
		"exp": time.Now().Add(12 * time.Hour).Unix(),
		"sub": "mailto:" + pc.vapidEmail,
	})
	signed, err := token.SignedString(pc.vapidPriv)
	if err != nil {
		return "", err
	}

	pubBytes := elliptic.Marshal(elliptic.P256(), pc.vapidPriv.PublicKey.X, pc.vapidPriv.PublicKey.Y)
	k := base64.RawURLEncoding.EncodeToString(pubBytes)

	return fmt.Sprintf("vapid t=%s, k=%s", signed, k), nil
}

// ── RFC 8291 payload encryption (aes128gcm) ───────────────────────────────────

func encryptPayload(clientPubB64, clientAuthB64 string, plaintext []byte) ([]byte, []byte, []byte, error) {
	clientPubBytes, err := base64.RawURLEncoding.DecodeString(clientPubB64)
	if err != nil {
		return nil, nil, nil, err
	}
	clientAuth, err := base64.RawURLEncoding.DecodeString(clientAuthB64)
	if err != nil {
		return nil, nil, nil, err
	}

	// Generate ephemeral ECDH key pair
	localPriv, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, nil, err
	}
	localPub := localPriv.PublicKey().Bytes()

	// Parse client public key for ECDH
	clientECDH, err := ecdh.P256().NewPublicKey(clientPubBytes)
	if err != nil {
		return nil, nil, nil, err
	}

	// ECDH shared secret
	shared, err := localPriv.ECDH(clientECDH)
	if err != nil {
		return nil, nil, nil, err
	}

	// Generate 16-byte salt
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, nil, nil, err
	}

	// IKM via HKDF-SHA256 with auth secret
	ikm := hkdfExpand(shared, clientAuth, buildInfo("WebPush: info\x00", clientPubBytes, localPub), 32)

	// Derive content encryption key and nonce
	cek := hkdfExpand(ikm, salt, []byte("Content-Encoding: aes128gcm\x00"), 16)
	nonce := hkdfExpand(ikm, salt, []byte("Content-Encoding: nonce\x00"), 12)

	// AES-128-GCM encrypt
	block, err := aes.NewCipher(cek)
	if err != nil {
		return nil, nil, nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, nil, err
	}

	// Pad plaintext with delimiter byte (RFC 8188)
	padded := append(plaintext, 2) // 2 = final record delimiter

	encrypted := gcm.Seal(nil, nonce, padded, nil)
	return encrypted, localPub, salt, nil
}

func buildInfo(prefix string, clientPub, serverPub []byte) []byte {
	var buf bytes.Buffer
	buf.WriteString(prefix)
	binary.Write(&buf, binary.BigEndian, uint16(len(clientPub)))
	buf.Write(clientPub)
	binary.Write(&buf, binary.BigEndian, uint16(len(serverPub)))
	buf.Write(serverPub)
	return buf.Bytes()
}

func hkdfExpand(secret, salt, info []byte, length int) []byte {
	h := hkdf.New(sha256.New, secret, salt, info)
	out := make([]byte, length)
	io.ReadFull(h, out)
	return out
}

func buildPushBody(encrypted, localPub, salt []byte) []byte {
	// aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
	rs := uint32(4096)
	var buf bytes.Buffer
	buf.Write(salt)
	binary.Write(&buf, binary.BigEndian, rs)
	buf.WriteByte(byte(len(localPub)))
	buf.Write(localPub)
	buf.Write(encrypted)
	return buf.Bytes()
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

// CleanupExpired removes subscriptions for launches that have already happened.
func (pc *PushController) CleanupExpired(ctx context.Context) error {
	// Remove launch subs older than 48h (the launch has passed). Flight alerts
	// are excluded: a long-haul armed >48h before landing would be silently
	// dropped and never fire. They self-delete once the landing push is sent.
	_, err := pc.pool.Exec(ctx,
		`DELETE FROM push_subscriptions
		 WHERE created_at < NOW() - INTERVAL '48 hours'
		   AND launch_id NOT LIKE 'flight:%'`)
	return err
}
