-- Enforce ASCII-only, lowercase email invariants at the DB level.
--
-- Defense in depth: even if a future code path forgets to call
-- utils.NormalizeEmail, the database will reject the insert. This prevents
-- account-confusion attacks from homoglyphs (raj@gmáil.com vs raj@gmail.com)
-- and ensures the unique index works on canonical byte-exact values.
--
-- Rationale:
--   email ~ '^[\x20-\x7E]+$'   → printable ASCII only (no Unicode)
--   email = lower(email)        → canonical lowercase form
--   email LIKE '%_@_%.__%'      → RFC-ish shape sanity check
--
-- The regex uses POSIX character class \x20-\x7E (space through tilde) which
-- covers every ASCII printable character — faster than listing [a-zA-Z0-9...]
-- and future-proof against RFC 5321 special chars we might need later.

ALTER TABLE users
    ADD CONSTRAINT users_email_ascii_lowercase
    CHECK (
        email ~ '^[\x20-\x7E]+$'
        AND email = lower(email)
        AND email LIKE '%_@_%.__%'
    );

ALTER TABLE waitlist_emails
    ADD CONSTRAINT waitlist_email_ascii_lowercase
    CHECK (
        email ~ '^[\x20-\x7E]+$'
        AND email = lower(email)
        AND email LIKE '%_@_%.__%'
    );
