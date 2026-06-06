-- Space Journal posts, sourced daily from NASA APOD (public domain).
CREATE TABLE IF NOT EXISTS blog_posts (
    slug         TEXT PRIMARY KEY,
    date         DATE NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    intro        TEXT NOT NULL DEFAULT '',
    explanation  TEXT NOT NULL DEFAULT '',
    image_url    TEXT NOT NULL DEFAULT '',
    hd_image_url TEXT NOT NULL DEFAULT '',
    media_type   TEXT NOT NULL DEFAULT 'image',
    copyright    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blog_posts_date ON blog_posts (date DESC);
