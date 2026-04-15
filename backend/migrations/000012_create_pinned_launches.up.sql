-- Pinned launches: users save upcoming space launch events to their account
-- so that pins survive across devices and sign-ins. Anonymous users keep
-- their pins in localStorage; on sign-in the frontend can replay them here.
--
-- launch_id is the external provider's ID (currently The Space Devs LL2),
-- stored as opaque text — we don't FK to a launches table because launch
-- data lives in Redis with a TTL, not Postgres.

CREATE TABLE IF NOT EXISTS pinned_launches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    launch_id   VARCHAR(64) NOT NULL,
    name        VARCHAR(200),
    net_time    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, launch_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_launches_user ON pinned_launches(user_id);
