-- Contact form submissions, stored so the admin can review and reply in-app.
CREATE TABLE IF NOT EXISTS contact_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT,
    email       TEXT NOT NULL,
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at     TIMESTAMPTZ,
    replied_at  TIMESTAMPTZ,
    reply_body  TEXT
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at DESC);
