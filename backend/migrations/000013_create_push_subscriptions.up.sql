-- Push subscriptions: stores Web Push API subscriptions per launch.
-- Anonymous users identified by their push endpoint (unique per browser).
-- launch_id is the external provider's ID (The Space Devs LL2).

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint    TEXT NOT NULL,
    key_p256dh  TEXT NOT NULL,
    key_auth    TEXT NOT NULL,
    launch_id   VARCHAR(64) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (endpoint, launch_id)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_launch ON push_subscriptions(launch_id);
