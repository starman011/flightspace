-- Inbound emails received via Resend (email.received webhook + Received emails API).
CREATE TABLE IF NOT EXISTS inbound_emails (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resend_id   TEXT UNIQUE,
    from_addr   TEXT NOT NULL,
    to_addrs    TEXT,
    subject     TEXT,
    text_body   TEXT,
    html_body   TEXT,
    received_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at     TIMESTAMPTZ,
    replied_at  TIMESTAMPTZ,
    reply_body  TEXT
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_created ON inbound_emails(created_at DESC);
