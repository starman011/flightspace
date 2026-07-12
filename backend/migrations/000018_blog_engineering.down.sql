DROP INDEX IF EXISTS idx_blog_posts_published;
DROP INDEX IF EXISTS uq_blog_posts_date_category;
-- Restore single-per-day uniqueness (delete engineering rows first — they may
-- share dates with journal rows and would violate the restored constraint).
DELETE FROM blog_posts WHERE category <> 'journal';
ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_date_key UNIQUE (date);
ALTER TABLE blog_posts
    DROP COLUMN IF EXISTS publish_on,
    DROP COLUMN IF EXISTS published,
    DROP COLUMN IF EXISTS video_url,
    DROP COLUMN IF EXISTS category;
