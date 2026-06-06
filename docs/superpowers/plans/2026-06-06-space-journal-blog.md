# Space Journal (APOD Daily Blog) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily auto-populated blog ("Space Journal") backed by NASA APOD — browsable in a full-screen grid-tile page and pre-rendered for SEO.

**Architecture:** A Go `BlogPoller` backfills ~365 days of APOD into a new `blog_posts` Postgres table on boot, then appends daily. REST endpoints serve the feed/articles. The SPA renders a full-screen BlogPage opened from a PagesPill grid tile. Vercel middleware pre-renders `/blog` and `/blog/:slug` for Googlebot plus a dynamic `sitemap-blog.xml`.

**Tech Stack:** Go (net/http, pgx/v5, go-redis), React 18 + Vite (CSS Modules), Vercel Edge Middleware, NASA APOD API.

---

## File Structure

- Create: `backend/migrations/000015_create_blog_posts.up.sql` / `.down.sql` — table
- Create: `backend/src/controllers/blog_poller.go` — backfill + daily fetch + slug/intro
- Create: `backend/src/controllers/blog_controller.go` — list + single endpoints
- Create: `backend/src/controllers/blog_poller_test.go` — slug/intro/idempotency tests
- Modify: `backend/app.go` — start BlogPoller, construct BlogController
- Modify: `backend/src/routes/index.go` — register `/api/v1/blog` + `/api/v1/blog/{slug}`
- Modify: `frontend/src/utils/routing.js` — `/blog`, `/blog/:slug` parsing + meta
- Modify: `frontend/src/utils/routing.test.js` — route tests
- Create: `frontend/src/components/StaticPages/BlogPage.jsx` / `.module.css` — UI
- Modify: `frontend/src/components/PagesPill/PagesPill.jsx` — grid tile
- Modify: `frontend/src/App.jsx` — render BlogPage on activePage==='blog'
- Modify: `frontend/middleware.js` — renderBlogFeed, renderBlogPost, sitemap
- Modify: `frontend/public/robots.txt` — add sitemap-blog.xml

---

## Task 1: Migration — blog_posts table

**Files:**
- Create: `backend/migrations/000015_create_blog_posts.up.sql`
- Create: `backend/migrations/000015_create_blog_posts.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- backend/migrations/000015_create_blog_posts.up.sql
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
```

- [ ] **Step 2: Write the down migration**

```sql
-- backend/migrations/000015_create_blog_posts.down.sql
DROP TABLE IF EXISTS blog_posts;
```

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/000015_create_blog_posts.up.sql backend/migrations/000015_create_blog_posts.down.sql
git commit -m "feat(db): blog_posts table for Space Journal"
```

---

## Task 2: Blog poller core — slug, intro, APOD types (TDD)

**Files:**
- Create: `backend/src/controllers/blog_poller.go`
- Test: `backend/src/controllers/blog_poller_test.go`

- [ ] **Step 1: Write failing tests**

```go
// backend/src/controllers/blog_poller_test.go
package controllers

import "testing"

func TestBlogSlug(t *testing.T) {
	got := blogSlug("2026-06-06", "The Cosmic Cliffs of Carina!")
	want := "2026-06-06-the-cosmic-cliffs-of-carina"
	if got != want {
		t.Fatalf("blogSlug = %q, want %q", got, want)
	}
}

func TestBlogSlugCollapsesSymbols(t *testing.T) {
	got := blogSlug("2026-01-02", "M31: Andromeda & Friends   (Wide)")
	want := "2026-01-02-m31-andromeda-friends-wide"
	if got != want {
		t.Fatalf("blogSlug = %q, want %q", got, want)
	}
}

func TestBlogIntroDeterministic(t *testing.T) {
	a := blogIntro("2026-06-06", "Nebula")
	b := blogIntro("2026-06-06", "Nebula")
	if a != b {
		t.Fatal("blogIntro not deterministic for same date")
	}
	if a == "" {
		t.Fatal("blogIntro empty")
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./src/controllers/ -run TestBlog -v`
Expected: FAIL — `undefined: blogSlug`, `undefined: blogIntro`

- [ ] **Step 3: Write the poller scaffolding + helpers**

```go
// backend/src/controllers/blog_poller.go
package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// BlogPoller backfills ~365 days of NASA APOD into blog_posts on boot,
// then appends one post per day. Mirrors the other poller patterns.
type BlogPoller struct {
	db     *pgxpool.Pool
	apiKey string
	client *http.Client
}

func NewBlogPoller(db *pgxpool.Pool, apiKey string) *BlogPoller {
	return &BlogPoller{db: db, apiKey: apiKey, client: &http.Client{Timeout: 30 * time.Second}}
}

// apodEntry is one item from the NASA APOD API.
type apodEntry struct {
	Date        string `json:"date"`
	Title       string `json:"title"`
	Explanation string `json:"explanation"`
	URL         string `json:"url"`
	HDURL       string `json:"hdurl"`
	MediaType   string `json:"media_type"`
	Copyright   string `json:"copyright"`
}

var slugNonWord = regexp.MustCompile(`[^a-z0-9]+`)

// blogSlug builds a stable URL slug: "<date>-<title-slug>".
func blogSlug(date, title string) string {
	s := strings.ToLower(title)
	s = slugNonWord.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 60 {
		s = strings.Trim(s[:60], "-")
	}
	return date + "-" + s
}

// blogIntro picks a stable enthusiast intro line by hashing the date.
func blogIntro(date, title string) string {
	templates := []string{
		"The universe showed off again today — %s. Here is what NASA captured:",
		"Another stunning view from the cosmos: %s. NASA explains:",
		"Today's window into deep space — %s. The story behind the image:",
		"Space never stops amazing us. Today: %s. Here is the science:",
		"A fresh look at our universe — %s. NASA's take:",
		"Look up and wonder — today's cosmic highlight is %s:",
	}
	h := fnv.New32a()
	h.Write([]byte(date))
	return fmt.Sprintf(templates[int(h.Sum32())%len(templates)], title)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./src/controllers/ -run TestBlog -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/blog_poller.go backend/src/controllers/blog_poller_test.go
git commit -m "feat(blog): poller scaffolding with slug + intro helpers"
```

---

## Task 3: Blog poller — fetch, upsert, backfill, daily ticker

**Files:**
- Modify: `backend/src/controllers/blog_poller.go`
- Modify: `backend/app.go`

- [ ] **Step 1: Add fetch + upsert + Start to blog_poller.go**

Append to `backend/src/controllers/blog_poller.go`:

```go
func (p *BlogPoller) key() string {
	if p.apiKey != "" {
		return p.apiKey
	}
	return "DEMO_KEY"
}

// fetchRange pulls APOD entries for [start, end] (inclusive) in one call.
func (p *BlogPoller) fetchRange(ctx context.Context, start, end string) ([]apodEntry, error) {
	url := fmt.Sprintf("https://api.nasa.gov/planetary/apod?api_key=%s&start_date=%s&end_date=%s",
		p.key(), start, end)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("APOD API status %d", resp.StatusCode)
	}
	var entries []apodEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return nil, err
	}
	return entries, nil
}

// upsert writes one entry; ON CONFLICT(date) keeps the existing row (idempotent).
func (p *BlogPoller) upsert(ctx context.Context, e apodEntry) error {
	if e.Date == "" || e.Title == "" {
		return nil
	}
	slug := blogSlug(e.Date, e.Title)
	intro := blogIntro(e.Date, e.Title)
	mt := e.MediaType
	if mt == "" {
		mt = "image"
	}
	_, err := p.db.Exec(ctx,
		`INSERT INTO blog_posts (slug, date, title, intro, explanation, image_url, hd_image_url, media_type, copyright)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''))
		 ON CONFLICT (date) DO NOTHING`,
		slug, e.Date, e.Title, intro, e.Explanation, e.URL, e.HDURL, mt, e.Copyright)
	return err
}

// Start backfills ~365 days on boot, then refreshes every 24h.
func (p *BlogPoller) Start(ctx context.Context) {
	log.Println(`{"level":"info","service":"blog_poller","msg":"starting"}`)
	p.backfill(ctx)
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.daily(ctx)
		}
	}
}

func (p *BlogPoller) backfill(ctx context.Context) {
	end := time.Now().UTC()
	start := end.AddDate(0, 0, -365)
	entries, err := p.fetchRange(ctx, start.Format("2006-01-02"), end.Format("2006-01-02"))
	if err != nil {
		log.Printf(`{"level":"warn","service":"blog_poller","msg":"backfill failed","error":%q}`, err)
		return
	}
	n := 0
	for _, e := range entries {
		if err := p.upsert(ctx, e); err == nil {
			n++
		}
	}
	log.Printf(`{"level":"info","service":"blog_poller","msg":"backfill done","entries":%d}`, n)
}

func (p *BlogPoller) daily(ctx context.Context) {
	end := time.Now().UTC()
	start := end.AddDate(0, 0, -2)
	entries, err := p.fetchRange(ctx, start.Format("2006-01-02"), end.Format("2006-01-02"))
	if err != nil {
		log.Printf(`{"level":"warn","service":"blog_poller","msg":"daily failed","error":%q}`, err)
		return
	}
	for _, e := range entries {
		_ = p.upsert(ctx, e)
	}
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 3: Wire poller into app.go**

In `backend/app.go`, inside `Start()`, after the existing weather poller block (near `weatherCtrl.StartPoller(ctx)`), add:

```go
	// Start Space Journal blog poller (NASA APOD — daily, backfills 1 year on boot)
	blogPoller := controllers.NewBlogPoller(a.db, a.cfg.NASAAPIKey)
	go blogPoller.Start(ctx)
```

- [ ] **Step 4: Verify build**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/blog_poller.go backend/app.go
git commit -m "feat(blog): APOD backfill + daily poller wired into app"
```

---

## Task 4: Blog API endpoints

**Files:**
- Create: `backend/src/controllers/blog_controller.go`
- Modify: `backend/src/routes/index.go`

- [ ] **Step 1: Write blog_controller.go**

```go
// backend/src/controllers/blog_controller.go
package controllers

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type BlogController struct {
	db *pgxpool.Pool
}

func NewBlogController(db *pgxpool.Pool) *BlogController {
	return &BlogController{db: db}
}

type blogPost struct {
	Slug        string  `json:"slug"`
	Date        string  `json:"date"`
	Title       string  `json:"title"`
	Intro       string  `json:"intro"`
	Explanation string  `json:"explanation"`
	ImageURL    string  `json:"image_url"`
	HDImageURL  string  `json:"hd_image_url"`
	MediaType   string  `json:"media_type"`
	Copyright   *string `json:"copyright,omitempty"`
}

// GetBlogList serves a paginated feed (newest first).
func (c *BlogController) GetBlogList(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	limit := 20
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 50 {
			limit = n
		}
	}
	offset := 0
	if o := r.URL.Query().Get("offset"); o != "" {
		if n, err := strconv.Atoi(o); err == nil && n >= 0 {
			offset = n
		}
	}

	rows, err := c.db.Query(ctx,
		`SELECT slug, to_char(date,'YYYY-MM-DD'), title, intro, explanation,
		        image_url, hd_image_url, media_type, copyright
		 FROM blog_posts ORDER BY date DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		http.Error(w, `{"error":"db"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	posts := []blogPost{}
	for rows.Next() {
		var p blogPost
		if err := rows.Scan(&p.Slug, &p.Date, &p.Title, &p.Intro, &p.Explanation,
			&p.ImageURL, &p.HDImageURL, &p.MediaType, &p.Copyright); err == nil {
			posts = append(posts, p)
		}
	}

	var total int
	_ = c.db.QueryRow(ctx, `SELECT COUNT(*) FROM blog_posts`).Scan(&total)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	json.NewEncoder(w).Encode(map[string]interface{}{"posts": posts, "total": total})
}

// GetBlogPost serves a single post by slug.
func (c *BlogController) GetBlogPost(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	slug := r.PathValue("slug")
	var p blogPost
	err := c.db.QueryRow(ctx,
		`SELECT slug, to_char(date,'YYYY-MM-DD'), title, intro, explanation,
		        image_url, hd_image_url, media_type, copyright
		 FROM blog_posts WHERE slug = $1`, slug).
		Scan(&p.Slug, &p.Date, &p.Title, &p.Intro, &p.Explanation,
			&p.ImageURL, &p.HDImageURL, &p.MediaType, &p.Copyright)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	json.NewEncoder(w).Encode(p)
}
```

- [ ] **Step 2: Register routes in index.go**

In `backend/src/routes/index.go`, near the APOD registration (`mux.Handle("GET /api/v1/apod", ...)`), add:

```go
	// Space Journal blog
	blog := controllers.NewBlogController(pool)
	mux.Handle("GET /api/v1/blog", rateLimit(http.HandlerFunc(blog.GetBlogList)))
	mux.Handle("GET /api/v1/blog/{slug}", rateLimit(http.HandlerFunc(blog.GetBlogPost)))
```

- [ ] **Step 3: Verify build**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/blog_controller.go backend/src/routes/index.go
git commit -m "feat(blog): list + single blog API endpoints"
```

---

## Task 5: Frontend routing for /blog and /blog/:slug (TDD)

**Files:**
- Modify: `frontend/src/utils/routing.js`
- Modify: `frontend/src/utils/routing.test.js`

- [ ] **Step 1: Write failing tests**

Add to `frontend/src/utils/routing.test.js` inside the `parseInitialState` describe block:

```javascript
  it('parses /blog as activePage blog', () => {
    const s = parseInitialState('/blog')
    expect(s.activePage).toBe('blog')
    expect(s.notFound).toBe(false)
  })

  it('parses /blog/:slug with blogSlug', () => {
    const s = parseInitialState('/blog/2026-06-06-cosmic-cliffs')
    expect(s.activePage).toBe('blog')
    expect(s.blogSlug).toBe('2026-06-06-cosmic-cliffs')
  })
```

And in the `ROUTE_META` describe block, extend the sitemap list test:

```javascript
    // /blog included in metadata
    expect(ROUTE_META['/blog'], '/blog missing from ROUTE_META').toBeDefined()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- --run routing`
Expected: FAIL — blog cases fail

- [ ] **Step 3: Add routing support**

In `frontend/src/utils/routing.js`:

a) Add to `ROUTE_META` (after the `/iss` entry):

```javascript
  '/blog':         { title: 'Space Journal — Daily Astronomy & Space Imagery | ObjectTracer',
                     description: 'A daily space journal featuring NASA\'s Astronomy Picture of the Day — stunning cosmic imagery with the science behind each one.' },
```

b) In `routeKeyFromPath`, add before `return path`:

```javascript
  if (path.startsWith('/blog/')) return '/blog'
```

c) Add `blogSlug: null` to the `base` object in `parseInitialState`.

d) In `parseInitialState`, add before the final `return { ...base, notFound: true }`:

```javascript
  if (pathname === '/blog')             return { ...base, activePage: 'blog' }
  if (pathname.startsWith('/blog/'))    return { ...base, activePage: 'blog', blogSlug: pathname.replace('/blog/', '') }
```

e) In `stateToPath`, add after the `activePage === 'donate'` line:

```javascript
  if (activePage === 'blog')     return '/blog'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- --run routing`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/routing.js frontend/src/utils/routing.test.js
git commit -m "feat(blog): SPA routing for /blog and /blog/:slug"
```

---

## Task 6: BlogPage component (feed + article)

**Files:**
- Create: `frontend/src/components/StaticPages/BlogPage.jsx`
- Create: `frontend/src/components/StaticPages/BlogPage.module.css`

- [ ] **Step 1: Write BlogPage.jsx**

```jsx
// frontend/src/components/StaticPages/BlogPage.jsx
import { useEffect, useState } from 'react'
import styles from './BlogPage.module.css'

const API = import.meta.env.VITE_API_URL || ''

export default function BlogPage({ onClose, initialSlug }) {
  const [posts, setPosts] = useState([])
  const [active, setActive] = useState(null)   // full post object
  const [loading, setLoading] = useState(true)

  // Load feed
  useEffect(() => {
    fetch(`${API}/api/v1/blog?limit=40`)
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(d => { setPosts(d.posts || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Deep-link to a specific article
  useEffect(() => {
    if (!initialSlug) return
    fetch(`${API}/api/v1/blog/${initialSlug}`)
      .then(r => r.ok ? r.json() : null)
      .then(p => { if (p) setActive(p) })
      .catch(() => {})
  }, [initialSlug])

  const openPost = (slug) => {
    window.history.replaceState(null, '', `/blog/${slug}`)
    fetch(`${API}/api/v1/blog/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then(p => { if (p) setActive(p) })
      .catch(() => {})
  }

  const backToFeed = () => {
    window.history.replaceState(null, '', '/blog')
    setActive(null)
  }

  return (
    <div className={styles.overlay}>
      <button className={styles.close} onClick={onClose} aria-label="Close">×</button>

      {active ? (
        <article className={styles.article}>
          <button className={styles.back} onClick={backToFeed}>← Journal</button>
          {active.media_type === 'image' ? (
            <img className={styles.hero} src={active.hd_image_url || active.image_url} alt={active.title} />
          ) : (
            <a className={styles.videoLink} href={active.image_url} target="_blank" rel="noopener noreferrer">▶ Watch the featured video</a>
          )}
          <p className={styles.date}>{formatDate(active.date)}</p>
          <h1 className={styles.title}>{active.title}</h1>
          <p className={styles.intro}>{active.intro}</p>
          <p className={styles.body}>{active.explanation}</p>
          {active.copyright && <p className={styles.credit}>Image credit: {active.copyright}</p>}
          <p className={styles.source}>Source: <a href={`https://apod.nasa.gov/apod/ap${active.date.replace(/-/g,'').slice(2)}.html`} target="_blank" rel="noopener noreferrer">NASA APOD</a></p>
        </article>
      ) : (
        <div className={styles.feed}>
          <header className={styles.feedHeader}>
            <h1 className={styles.feedTitle}>Space Journal</h1>
            <p className={styles.feedSub}>Daily cosmic imagery, powered by NASA APOD</p>
          </header>
          {loading && <p className={styles.loading}>Loading the cosmos…</p>}
          <div className={styles.grid}>
            {posts.map(p => (
              <button key={p.slug} className={styles.card} onClick={() => openPost(p.slug)}>
                {p.media_type === 'image'
                  ? <img className={styles.thumb} src={p.image_url} alt={p.title} loading="lazy" />
                  : <div className={styles.thumbVideo}>▶</div>}
                <div className={styles.cardBody}>
                  <span className={styles.cardDate}>{formatDate(p.date)}</span>
                  <span className={styles.cardTitle}>{p.title}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatDate(d) {
  try {
    return new Date(d + 'T00:00:00Z').toLocaleDateString(undefined,
      { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  } catch { return d }
}
```

- [ ] **Step 2: Write BlogPage.module.css**

```css
/* frontend/src/components/StaticPages/BlogPage.module.css */
.overlay {
  position: fixed; inset: 0; z-index: 4000;
  background: #050a0f; overflow-y: auto;
  font-family: var(--font-body, system-ui, sans-serif); color: #e8f4ff;
}
.close {
  position: fixed; top: 16px; right: 16px; z-index: 10;
  width: 40px; height: 40px; border-radius: 50%;
  background: rgba(6,12,18,0.8); border: 1px solid rgba(255,255,255,0.12);
  color: #e8f4ff; font-size: 22px; cursor: pointer;
}
.feed { max-width: 1100px; margin: 0 auto; padding: 56px 20px 80px; }
.feedHeader { margin-bottom: 28px; }
.feedTitle { font-family: var(--font-display, sans-serif); font-size: 2rem; margin: 0; color: #fff; }
.feedSub { color: rgba(178,255,26,0.75); font-family: var(--font-mono, monospace); font-size: 0.85rem; margin-top: 6px; }
.loading { color: rgba(200,220,240,0.5); font-family: var(--font-mono, monospace); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.card {
  display: flex; flex-direction: column; text-align: left; padding: 0; cursor: pointer;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px; overflow: hidden; transition: border-color .2s, transform .2s;
}
.card:hover { border-color: rgba(178,255,26,0.5); transform: translateY(-2px); }
.thumb { width: 100%; height: 150px; object-fit: cover; display: block; }
.thumbVideo { width: 100%; height: 150px; display: flex; align-items: center; justify-content: center;
  background: rgba(178,255,26,0.08); color: #b2ff1a; font-size: 28px; }
.cardBody { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.cardDate { font-family: var(--font-mono, monospace); font-size: 0.7rem; color: rgba(178,255,26,0.7); }
.cardTitle { font-size: 0.92rem; color: #fff; line-height: 1.3; }
.article { max-width: 760px; margin: 0 auto; padding: 56px 20px 80px; }
.back { background: none; border: none; color: #b2ff1a; cursor: pointer;
  font-family: var(--font-mono, monospace); font-size: 0.85rem; padding: 0 0 18px; }
.hero { width: 100%; border-radius: 12px; margin-bottom: 18px; }
.videoLink { display: inline-block; margin-bottom: 18px; color: #b2ff1a; }
.date { font-family: var(--font-mono, monospace); font-size: 0.78rem; color: rgba(178,255,26,0.7); margin: 0 0 6px; }
.title { font-family: var(--font-display, sans-serif); font-size: 1.7rem; color: #fff; margin: 0 0 14px; }
.intro { font-size: 1.05rem; color: rgba(200,220,240,0.9); font-style: italic; margin: 0 0 18px; }
.body { font-size: 1rem; line-height: 1.7; color: rgba(200,220,240,0.78); white-space: pre-wrap; }
.credit { margin-top: 20px; font-size: 0.8rem; color: rgba(200,220,240,0.5); }
.source { margin-top: 6px; font-size: 0.8rem; }
.source a, .credit a { color: #b2ff1a; }
@media (max-width: 600px) { .feedTitle { font-size: 1.5rem; } .title { font-size: 1.4rem; } }
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`
Expected: builds (component not yet imported — that's Task 7)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StaticPages/BlogPage.jsx frontend/src/components/StaticPages/BlogPage.module.css
git commit -m "feat(blog): BlogPage feed + article UI"
```

---

## Task 7: Grid tile + App wiring

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/PagesPill/PagesPill.jsx`

- [ ] **Step 1: Import + render BlogPage in App.jsx**

In `frontend/src/App.jsx`, add the import near the other StaticPages imports:

```jsx
import BlogPage from './components/StaticPages/BlogPage'
```

Find the static-pages render block (where `activePage === 'about'` etc. are rendered) and add:

```jsx
      {activePage === 'blog' && <BlogPage onClose={() => setActivePage(null)} initialSlug={init.blogSlug} />}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: builds; visiting `/blog` now opens the feed.

- [ ] **Step 3: Add grid tile to PagesPill.jsx**

Open `frontend/src/components/PagesPill/PagesPill.jsx`. It receives `onPageOpen` (used by TopRightPill) — confirm a prop path to open pages. If PagesPill already calls `onScaleChange` for tiles, add a "Journal" tile that instead calls a new `onPageOpen('blog')` prop. Concretely:

a) Add `onPageOpen` to the component's destructured props.

b) Add a tile button alongside the existing scale tiles:

```jsx
        <button
          className={styles.tile}
          onClick={() => onPageOpen?.('blog')}
          title="Space Journal — daily astronomy"
        >
          <span className="material-symbols-outlined">auto_stories</span>
          <span className={styles.tileLabel}>Journal</span>
        </button>
```

(Match the exact class names already used by sibling tiles in this file.)

- [ ] **Step 4: Pass onPageOpen from App.jsx to PagesPill**

In `frontend/src/App.jsx`, find `<PagesPill ... />` and add the prop:

```jsx
        onPageOpen={setActivePage}
```

- [ ] **Step 5: Verify build + manual check**

Run: `cd frontend && npm run build`
Expected: builds. Manually: the PagesPill shows a "Journal" tile that opens the blog feed; `/blog/:slug` opens the article.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/PagesPill/PagesPill.jsx
git commit -m "feat(blog): Journal grid tile + App wiring"
```

---

## Task 8: SEO — middleware pre-render + sitemap

**Files:**
- Modify: `frontend/middleware.js`
- Modify: `frontend/public/robots.txt`

- [ ] **Step 1: Extend the matcher**

In `frontend/middleware.js`, add `'/blog'`, `'/blog/:path*'`, `'/sitemap-blog.xml'` to the `config.matcher` array.

- [ ] **Step 2: Add route dispatch**

In the default `middleware` function, alongside the other `parts[0] === ...` checks, add:

```javascript
  if (pathname === '/blog') {
    return renderBlogFeed()
  }
  if (parts[0] === 'blog' && parts[1]) {
    return renderBlogPost(parts.slice(1).join('/'))
  }
  if (pathname === '/sitemap-blog.xml') {
    return renderBlogSitemap()
  }
```

- [ ] **Step 3: Add the three renderers**

Add before the `// ── Shared helpers ──` section in `frontend/middleware.js`:

```javascript
// ── Space Journal blog ────────────────────────────────────────────────────────
async function renderBlogFeed() {
  let posts = []
  try {
    const res = await fetch(`${API}/api/v1/blog?limit=30`, { headers: { 'x-render': 'bot' } })
    if (res.ok) { const d = await res.json(); posts = d.posts || [] }
  } catch (_) {}

  const canonical = `${SITE}/blog`
  const title = 'Space Journal — Daily Astronomy & Space Imagery | ObjectTracer'
  const desc  = 'A daily space journal featuring NASA’s Astronomy Picture of the Day — stunning cosmic imagery with the science behind each image.'
  const items = posts.map(p =>
    `<li><a href="${SITE}/blog/${esc(p.slug)}"><strong>${esc(p.title)}</strong><span>${esc(p.date)}</span></a></li>`
  ).join('\n')
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Blog', name: 'ObjectTracer Space Journal',
    url: canonical, description: desc,
  }
  const body = `
    <h1>Space Journal</h1>
    <p>Daily cosmic imagery powered by NASA's Astronomy Picture of the Day, with the science behind each image.</p>
    <ul class="cards">${items}</ul>`
  return html(canonical, title, desc, jsonLd, body, 'SPACE JOURNAL')
}

async function renderBlogPost(slug) {
  let p = null
  try {
    const res = await fetch(`${API}/api/v1/blog/${encodeURIComponent(slug)}`, { headers: { 'x-render': 'bot' } })
    if (res.ok) p = await res.json()
  } catch (_) {}
  if (!p) return // unknown slug → SPA

  const canonical = `${SITE}/blog/${slug}`
  const title = `${p.title} — Space Journal | ObjectTracer`
  const desc  = (p.explanation || p.intro || '').slice(0, 200)
  const img = p.image_url || `${SITE}/og-image.png`
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: p.title, image: img, datePublished: p.date,
    author: { '@type': 'Organization', name: 'NASA APOD' },
    publisher: { '@type': 'Organization', name: 'ObjectTracer', logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` } },
    url: canonical,
  }
  const imgTag = p.media_type === 'image'
    ? `<img src="${esc(img)}" alt="${esc(p.title)}" style="width:100%;border-radius:10px;margin:16px 0" />` : ''
  const body = `
    <p style="font-family:monospace;color:rgba(178,255,26,0.7);font-size:.85rem">${esc(p.date)}</p>
    <h1>${esc(p.title)}</h1>
    ${imgTag}
    <p style="font-style:italic;color:rgba(200,220,240,0.9)">${esc(p.intro)}</p>
    <p>${esc(p.explanation)}</p>
    ${p.copyright ? `<p style="font-size:.8rem;opacity:.6">Image credit: ${esc(p.copyright)}</p>` : ''}
    <p><a href="${SITE}/blog">← All Space Journal entries</a></p>`
  // Article OG image is the actual APOD image (passed as ogImageOverride)
  return html(canonical, title, desc, jsonLd, body, 'SPACE JOURNAL', img)
}

async function renderBlogSitemap() {
  let posts = []
  try {
    const res = await fetch(`${API}/api/v1/blog?limit=50`, { headers: { 'x-render': 'bot' } })
    if (res.ok) { const d = await res.json(); posts = d.posts || [] }
  } catch (_) {}
  const urls = posts.map(p =>
    `  <url><loc>${SITE}/blog/${p.slug}</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`
  ).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/blog</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n${urls}\n</urlset>`
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}
```

- [ ] **Step 4: Let html() accept an OG image override (for the real APOD image)**

In `frontend/middleware.js`, change the `html()` signature from:

```javascript
function html(canonical, title, desc, jsonLd, body, ogBadge) {
  const ogImg = ogImageUrl(title, desc, ogBadge)
```

to:

```javascript
function html(canonical, title, desc, jsonLd, body, ogBadge, ogImageOverride) {
  const ogImg = ogImageOverride || ogImageUrl(title, desc, ogBadge)
```

This is backward-compatible (existing callers pass no 7th arg → `ogImageOverride` is undefined → falls back to the generated OG image). `renderBlogPost` (Step 3) already passes the APOD image as the 7th arg.

- [ ] **Step 5: Add blog sitemap to robots.txt**

In `frontend/public/robots.txt`, under the existing Sitemap lines add:

```
Sitemap: https://www.objecttracer.com/sitemap-blog.xml
```

- [ ] **Step 6: Verify build + syntax**

Run: `cd frontend && npm run build && node -c middleware.js`
Expected: builds; "middleware.js syntax OK" (no output from node -c means OK)

- [ ] **Step 7: Commit**

```bash
git add frontend/middleware.js frontend/public/robots.txt
git commit -m "feat(blog): SEO pre-render for /blog + /blog/:slug + sitemap-blog.xml"
```

---

## Task 9: Add /blog to main sitemap + final verification

**Files:**
- Modify: `frontend/public/sitemap.xml`

- [ ] **Step 1: Add /blog to the core section of sitemap.xml**

Add near the other core pages:

```xml
  <url><loc>https://www.objecttracer.com/blog</loc><lastmod>2026-06-06</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>
```

- [ ] **Step 2: Commit + push (triggers deploy)**

```bash
git add frontend/public/sitemap.xml
git commit -m "feat(blog): add /blog to main sitemap"
git push
```

- [ ] **Step 3: Verify on deploy**

After backend (Railway) + frontend (Vercel) deploy:

```bash
# Backend: blog API returns posts (after poller backfill runs ~1 min)
curl -s "https://api.objecttracer.com/api/v1/blog?limit=2"
# Expect: {"posts":[{...}],"total":>0}

# Bot pre-render of feed + an article
curl -s -A "Googlebot" https://www.objecttracer.com/blog | grep -o '<title>[^<]*</title>'
# Expect: Space Journal title

# Sitemap
curl -s https://www.objecttracer.com/sitemap-blog.xml | head -5
```

Manual: open `/blog` in a browser → feed of cards; click one → article; the PagesPill "Journal" tile opens it.

---

## Notes for the implementer

- Backend deploys to Railway (auto on push); the poller backfills ~365 entries on boot via ONE NASA APOD range call — safe within rate limits.
- `NASA_API_KEY` already exists in Railway env (used by APOD/NEO). No new secret needed.
- The poller is idempotent (`ON CONFLICT (date) DO NOTHING`) — restarts won't duplicate.
- If `go test` needs Docker (per CLAUDE.md), the Task 2 unit tests are pure functions and run without it.
