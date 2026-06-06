# Space Journal — Auto-Generated Daily Blog (Design)

**Date:** 2026-06-06
**Status:** Approved for implementation

## Goal

A daily, auto-populated blog ("Space Journal") backed by NASA's Astronomy
Picture of the Day (APOD). Each day becomes a browsable, Google-indexable page.
Purpose: fresh daily content + ~365 instant pages for SEO, plus a genuinely
engaging space-imagery feature for users. Accessed via a tile in the PagesPill
grid (alongside Earth / Moon / Solar System) opening a full-screen blog page.

## Decisions (locked)

- **Content source:** NASA APOD (public domain US-gov content; per-image
  photographer `copyright` credit stored + displayed; always links to NASA).
- **No LLM:** posts are templated. NASA writes the explanation; we add a short
  rotating enthusiast-framed intro line chosen deterministically by date hash.
- **Backfill:** ~365 days on first boot; +1 post/day thereafter.
- **UI:** PagesPill grid tile → full-screen overlay (feed of cards → article).
- **SEO:** middleware pre-renders `/blog` + `/blog/:slug`; `sitemap-blog.xml`.

## Architecture

```
NASA APOD API ─> BlogPoller (Go, daily) ─> Postgres (blog_posts)
                                               │
                       ┌───────────────────────┤
                       ▼                        ▼
           GET /api/v1/blog (list)   GET /api/v1/blog/:slug (one)
                       │                        │
       ┌───────────────┴─────────┐             ▼
       ▼                         ▼      Vercel middleware (bots)
  SPA BlogPage           sitemap-blog.xml   → pre-rendered /blog, /blog/:slug
  (grid tile → fullscreen)
```

## Data model — `blog_posts` (Postgres)

| Column | Type | Notes |
|--------|------|-------|
| `slug` | text PRIMARY KEY | `YYYY-MM-DD-<title-slug>` |
| `date` | date UNIQUE NOT NULL | APOD date |
| `title` | text NOT NULL | NASA APOD title |
| `intro` | text | rotating templated enthusiast intro |
| `explanation` | text | NASA explanation (public domain) |
| `image_url` | text | APOD `url` |
| `hd_image_url` | text | APOD `hdurl` |
| `media_type` | text | `image` \| `video` |
| `copyright` | text NULL | APOD credit when present |
| `created_at` | timestamptz DEFAULT now() |

Index: `CREATE INDEX idx_blog_posts_date ON blog_posts (date DESC);`
Migration added to existing migration set.

## Backend

### BlogPoller (`backend/src/controllers/blog_poller.go`)
- Boot: one APOD range call (`start_date` = today-365, `end_date` = today),
  upsert each via `INSERT ... ON CONFLICT (date) DO NOTHING`. Idempotent.
- 24h `time.NewTicker` (mirrors DESI poller): fetch last 2 days, upsert.
- Slug = `${date}-${slugify(title)}` (deterministic).
- Intro: `INTRO_TEMPLATES[hash(date) % N]` filled with `{title}` — stable per post.
- Wired in `app.go` Start() alongside other pollers. Reuses `nasaAPIKey` cfg.

### Endpoints (`backend/src/routes/index.go`)
- `GET /api/v1/blog?limit=20&offset=0` → `{ posts: [...], total }`, newest first.
- `GET /api/v1/blog/{slug}` → single post or 404.
- Both rate-limited, no auth. Redis-cache the first feed page (5 min TTL).

## Frontend

- `components/StaticPages/BlogPage.jsx` + `BlogPage.module.css`:
  full-screen overlay (matches AboutPage/ContactPage pattern).
  - Feed view: cards (thumbnail, title, date, intro snippet), paginated/infinite.
  - Article view: hero image, title, date, intro, NASA explanation, "View HD"
    + NASA source link, share button, "← Journal" back.
- `PagesPill`: add "Journal" tile (icon: book/sparkle) → `onPageOpen('blog')`.
- `App.jsx`: `activePage === 'blog'` renders `<BlogPage>`; deep article via state.
- `routing.js`: `/blog` → `{ activePage: 'blog' }`; `/blog/:slug` →
  `{ activePage: 'blog', blogSlug }`. ROUTE_META entries. routeKeyFromPath maps
  `/blog/*` → `/blog`. stateToPath emits `/blog` and `/blog/:slug`.

## SEO

- Middleware (`frontend/middleware.js`):
  - matcher += `/blog`, `/blog/:path*`, `/sitemap-blog.xml`.
  - `renderBlogFeed()`: bot HTML listing recent posts w/ links to articles.
  - `renderBlogPost(slug)`: fetch `/api/v1/blog/:slug`, render full article HTML
    + JSON-LD `Article` (headline, image, datePublished, author "NASA APOD",
    publisher ObjectTracer), canonical, dynamic OG image via `/api/og`.
  - `renderBlogSitemap()`: dynamic `sitemap-blog.xml` from `/api/v1/blog`.
- `robots.txt`: add `Sitemap: .../sitemap-blog.xml`.
- SPA routes return valid state (no 404) for humans.

## Error handling

- APOD API failure on boot: log warn, skip backfill, retry next tick. Feature
  degrades to "no posts yet" — never crashes app startup (matches poller pattern).
- Missing `hdurl` (videos): fall back to `url`. `media_type=video` renders an
  embed/thumbnail link instead of `<img>`.
- Unknown slug: API 404 → middleware passes through to SPA → SPA shows feed.

## Testing

- Backend: unit-test `slugify`, intro selection determinism, range-backfill
  upsert idempotency (insert twice → one row).
- Frontend: routing.test.js cases for `/blog` and `/blog/:slug` parsing.
- Manual: verify bot pre-render (`curl -A Googlebot /blog/<slug>`) returns
  Article JSON-LD; verify grid tile opens feed; verify sitemap-blog.xml.

## Out of scope (YAGNI)

- LLM-authored voice (revisit later if desired — ~$2/yr with Haiku).
- Comments, categories, tags, RSS (can add later).
- Full 1995 archive backfill (1 year is enough for now).
