-- Engineering blog: admin-authored weekly posts alongside the APOD journal.
-- category: 'journal' (APOD poller) | 'engineering' (admin editor)
-- published/publish_on: drafts can be queued and auto-publish on their date.
ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS category   TEXT NOT NULL DEFAULT 'journal',
    ADD COLUMN IF NOT EXISTS video_url  TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS published  BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS publish_on DATE;

-- One post per day per category (APOD keeps one/day; engineering independent)
ALTER TABLE blog_posts DROP CONSTRAINT IF EXISTS blog_posts_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_posts_date_category ON blog_posts (date, category);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts (published, date DESC);
