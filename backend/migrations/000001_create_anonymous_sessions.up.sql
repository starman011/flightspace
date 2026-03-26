CREATE TABLE IF NOT EXISTS anonymous_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token   VARCHAR(128) NOT NULL UNIQUE,
    preferences     JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_anon_sessions_token ON anonymous_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_anon_sessions_expires ON anonymous_sessions(expires_at);
