package controllers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/skydot/backend/src/utils"
)

// Admin blog editor — create/update/schedule engineering posts.
// Media is by URL (Option A, $0 stack): image_url for photos, video_url for a
// YouTube/Vimeo embed. Auth: AuthRequired middleware + the isAdmin allowlist.

type adminBlogPayload struct {
	Slug      string `json:"slug"`       // empty on create → derived from date+title
	Date      string `json:"date"`       // YYYY-MM-DD; empty → today (UTC)
	Title     string `json:"title"`
	Intro     string `json:"intro"`
	Body      string `json:"body"`       // stored in explanation
	ImageURL  string `json:"image_url"`
	VideoURL  string `json:"video_url"`
	PublishOn string `json:"publish_on"` // YYYY-MM-DD; empty → publish immediately
}

// UpsertBlogPost creates or updates an engineering post. If publish_on is in
// the future the post is stored unpublished and the hourly scheduler flips it
// live on that date — this is how the weekly series is queued in advance.
func (ac *AdminController) UpsertBlogPost(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB — long-form posts fit easily

	var p adminBlogPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		utils.Error(w, http.StatusBadRequest, "invalid json")
		return
	}
	p.Title = strings.TrimSpace(p.Title)
	p.Body = strings.TrimSpace(p.Body)
	if p.Title == "" || p.Body == "" {
		utils.Error(w, http.StatusBadRequest, "title and body are required")
		return
	}
	if p.Date == "" {
		p.Date = time.Now().UTC().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", p.Date); err != nil {
		utils.Error(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}
	published := true
	var publishOn *string
	if p.PublishOn != "" {
		d, err := time.Parse("2006-01-02", p.PublishOn)
		if err != nil {
			utils.Error(w, http.StatusBadRequest, "publish_on must be YYYY-MM-DD")
			return
		}
		publishOn = &p.PublishOn
		published = !d.After(time.Now().UTC()) // future date → queued draft
	}
	if p.Slug == "" {
		p.Slug = blogSlug(p.Date, p.Title)
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	_, err := ac.pool.Exec(ctx,
		`INSERT INTO blog_posts (slug, date, title, intro, explanation, image_url,
		                         media_type, category, video_url, published, publish_on)
		 VALUES ($1,$2,$3,$4,$5,$6,'image','engineering',$7,$8,$9)
		 ON CONFLICT (slug) DO UPDATE SET
		   title = EXCLUDED.title, intro = EXCLUDED.intro,
		   explanation = EXCLUDED.explanation, image_url = EXCLUDED.image_url,
		   video_url = EXCLUDED.video_url, published = EXCLUDED.published,
		   publish_on = EXCLUDED.publish_on`,
		p.Slug, p.Date, p.Title, p.Intro, p.Body, p.ImageURL, p.VideoURL, published, publishOn)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "store failed")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]any{"slug": p.Slug, "published": published})
}

// ListBlogPosts returns all engineering posts including queued drafts.
func (ac *AdminController) ListBlogPosts(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	rows, err := ac.pool.Query(ctx,
		`SELECT slug, to_char(date,'YYYY-MM-DD'), title, intro, explanation, image_url,
		        video_url, published, COALESCE(to_char(publish_on,'YYYY-MM-DD'),'')
		 FROM blog_posts WHERE category = 'engineering'
		 ORDER BY date DESC LIMIT 100`)
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "db")
		return
	}
	defer rows.Close()
	type row struct {
		Slug      string `json:"slug"`
		Date      string `json:"date"`
		Title     string `json:"title"`
		Intro     string `json:"intro"`
		Body      string `json:"body"`
		ImageURL  string `json:"image_url"`
		VideoURL  string `json:"video_url"`
		Published bool   `json:"published"`
		PublishOn string `json:"publish_on"`
	}
	out := []row{}
	for rows.Next() {
		var x row
		if err := rows.Scan(&x.Slug, &x.Date, &x.Title, &x.Intro, &x.Body,
			&x.ImageURL, &x.VideoURL, &x.Published, &x.PublishOn); err == nil {
			out = append(out, x)
		}
	}
	utils.JSON(w, http.StatusOK, map[string]any{"posts": out})
}

// DeleteBlogPost removes an engineering post (journal posts are untouchable).
func (ac *AdminController) DeleteBlogPost(w http.ResponseWriter, r *http.Request) {
	if !ac.isAdmin(r) {
		utils.Error(w, http.StatusForbidden, "forbidden")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	_, err := ac.pool.Exec(ctx,
		`DELETE FROM blog_posts WHERE slug = $1 AND category = 'engineering'`,
		r.PathValue("slug"))
	if err != nil {
		utils.Error(w, http.StatusInternalServerError, "delete failed")
		return
	}
	utils.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
