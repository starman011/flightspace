package controllers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/skydot/backend/src/models"
	"github.com/skydot/backend/src/utils"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 5 * 60 * time.Second // 5 minutes idle timeout
	pingPeriod     = 30 * time.Second
	maxMessageSize = 1024
)

// WSController handles WebSocket upgrade and per-client read/write loops.
type WSController struct {
	hub            *Hub
	jwtSecret      string
	allowedOrigins map[string]bool
}

// NewWSController creates a WSController with JWT secret and allowed origins
// derived from the ALLOWED_ORIGINS environment variable.
func NewWSController(hub *Hub, jwtSecret string) *WSController {
	return &WSController{
		hub:            hub,
		jwtSecret:      jwtSecret,
		allowedOrigins: buildAllowedOrigins(),
	}
}

// buildAllowedOrigins constructs the set of permitted WebSocket origins from
// the ALLOWED_ORIGINS env var plus hardcoded localhost variants.
func buildAllowedOrigins() map[string]bool {
	origins := map[string]bool{
		"http://localhost:5173":  true,
		"http://localhost:3000":  true,
		"http://127.0.0.1:5173": true,
	}
	if env := os.Getenv("ALLOWED_ORIGINS"); env != "" {
		for _, o := range strings.Split(env, ",") {
			if o = strings.TrimSpace(o); o != "" {
				origins[o] = true
			}
		}
	}
	return origins
}

// newUpgrader creates a websocket.Upgrader with proper origin checking.
func (wc *WSController) newUpgrader() websocket.Upgrader {
	return websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 4096,
		CheckOrigin: func(r *http.Request) bool {
			origin := r.Header.Get("Origin")
			// Allow empty origin (same-origin / non-browser clients)
			if origin == "" {
				return true
			}
			// Allow any localhost or 127.0.0.1 origin (any port) for local dev
			if strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:") {
				return true
			}
			return wc.allowedOrigins[origin]
		},
	}
}

// ServeWS upgrades the HTTP connection to WebSocket and manages the client lifecycle.
func (wc *WSController) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		token = r.Header.Get("X-Session-Token")
	}
	if token == "" {
		utils.Error(w, http.StatusUnauthorized, "missing session token")
		return
	}
	// Validate the JWT token
	if !validateWSToken(token, wc.jwtSecret) {
		utils.Error(w, http.StatusUnauthorized, "invalid session token")
		return
	}

	upgrader := wc.newUpgrader()
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf(`{"level":"error","service":"ws","msg":"upgrade failed","error":%q}`, err)
		return
	}

	client := &Client{
		hub:  wc.hub,
		conn: conn,
		send: make(chan []byte, 64),
	}

	if !wc.hub.Register(client) {
		errMsg, _ := json.Marshal(models.NewWSMessage(models.WSTypeError, models.WSError{
			Code:    models.WSErrRateLimited,
			Message: "maximum connections reached",
		}))
		conn.WriteMessage(websocket.TextMessage, errMsg)
		conn.Close()
		return
	}

	go client.writePump()
	client.readPump()
}

// readPump handles inbound messages from the client.
func (c *Client) readPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf(`{"level":"warn","service":"ws","msg":"unexpected close","error":%q}`, err)
			}
			return
		}

		// Per-client rate limit: max 20 messages per 10 seconds
		now := time.Now().UnixNano()
		if now > c.msgWindowEnd {
			c.msgWindowEnd = now + int64(10*time.Second)
			c.msgCount = 0
		}
		c.msgCount++
		if c.msgCount > 20 {
			continue // silently drop excess messages
		}

		var msg models.WSClientMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case models.WSTypePing:
			// Reset deadline and respond with pong
			c.conn.SetReadDeadline(time.Now().Add(pongWait))
			pong, _ := json.Marshal(models.NewWSMessage(models.WSTypePong, nil))
			select {
			case c.send <- pong:
			default:
			}

		case models.WSTypeSetBounds:
			// Re-marshal data field and decode as WSSetBounds
			dataBytes, err := json.Marshal(msg.Data)
			if err != nil {
				continue
			}
			var bounds models.WSSetBounds
			if err := json.Unmarshal(dataBytes, &bounds); err != nil {
				continue
			}
			c.mu.Lock()
			c.bounds = &bounds
			c.mu.Unlock()
			// Send a fresh snapshot with new bounds
			go c.hub.sendSnapshot(c)

		case models.WSTypeWatchObject:
			// Client is viewing a specific object — track for viewer count
			objectID := ""
			if s, ok := msg.Data.(string); ok {
				objectID = s
			} else if m, ok := msg.Data.(map[string]interface{}); ok {
				if id, ok := m["object_id"].(string); ok {
					objectID = id
				}
			}
			c.hub.WatchObject(c, objectID)
			// Send current count immediately
			count := c.hub.GetViewerCount(objectID)
			if objectID != "" && count > 0 {
				resp := models.NewWSMessage(models.WSTypeViewerCount, models.WSViewerCount{
					ObjectID: objectID,
					Count:    count,
				})
				if data, err := json.Marshal(resp); err == nil {
					select {
					case c.send <- data:
					default:
					}
				}
			}
		}
	}
}

// writePump sends queued messages to the WebSocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// validateWSToken verifies the JWT token is valid and unexpired.
func validateWSToken(tokenStr, secret string) bool {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	return err == nil && token.Valid
}
