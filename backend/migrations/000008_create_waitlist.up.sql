CREATE TABLE IF NOT EXISTS waitlist_emails (
    id         BIGSERIAL PRIMARY KEY,
    email      TEXT NOT NULL,
    source     TEXT NOT NULL DEFAULT 'popup',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT waitlist_emails_email_unique UNIQUE (email)
);
