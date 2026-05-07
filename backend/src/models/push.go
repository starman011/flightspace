package models

import "time"

// PushSubscription stores a Web Push API subscription for a specific launch.
type PushSubscription struct {
	ID        string    `json:"id"`
	Endpoint  string    `json:"endpoint"`
	KeyP256dh string    `json:"key_p256dh"`
	KeyAuth   string    `json:"key_auth"`
	LaunchID  string    `json:"launch_id"`
	CreatedAt time.Time `json:"created_at"`
}

// PushSubscribeRequest is the client → server payload for subscribing.
type PushSubscribeRequest struct {
	Endpoint  string `json:"endpoint"`
	KeyP256dh string `json:"key_p256dh"`
	KeyAuth   string `json:"key_auth"`
	LaunchID  string `json:"launch_id"`
}

// PushPayload is the notification payload sent to the browser.
type PushPayload struct {
	Title   string            `json:"title"`
	Body    string            `json:"body"`
	Tag     string            `json:"tag,omitempty"`
	URL     string            `json:"url,omitempty"`
	Actions []PushAction       `json:"actions,omitempty"`
}

// PushAction is a notification action button.
type PushAction struct {
	Action string `json:"action"`
	Title  string `json:"title"`
}
