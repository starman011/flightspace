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
	Category    string  `json:"category"`
	VideoURL    string  `json:"video_url,omitempty"`
}

const blogCols = `slug, to_char(date,'YYYY-MM-DD'), title, intro, explanation,
	image_url, hd_image_url, media_type, copyright, category, video_url`

func scanPost(row interface{ Scan(...any) error }, p *blogPost) error {
	return row.Scan(&p.Slug, &p.Date, &p.Title, &p.Intro, &p.Explanation,
		&p.ImageURL, &p.HDImageURL, &p.MediaType, &p.Copyright, &p.Category, &p.VideoURL)
}

// GetBlogList serves a paginated feed of published posts (newest first).
// Optional ?category=journal|engineering narrows the feed.
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
	category := r.URL.Query().Get("category")
	if category != "journal" && category != "engineering" {
		category = "" // any
	}

	rows, err := c.db.Query(ctx,
		`SELECT `+blogCols+`
		 FROM blog_posts
		 WHERE published = TRUE AND ($3 = '' OR category = $3)
		 ORDER BY date DESC LIMIT $1 OFFSET $2`, limit, offset, category)
	if err != nil {
		http.Error(w, `{"error":"db"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	posts := []blogPost{}
	for rows.Next() {
		var p blogPost
		if err := scanPost(rows, &p); err == nil {
			posts = append(posts, p)
		}
	}

	var total int
	_ = c.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM blog_posts WHERE published = TRUE AND ($1 = '' OR category = $1)`,
		category).Scan(&total)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=300")
	json.NewEncoder(w).Encode(map[string]interface{}{"posts": posts, "total": total})
}

// GetFeatured serves a server-rotated set of recent image posts for the home
// page wallpaper. The order is rotated by day-of-year so the "featured" set
// changes daily without any client logic.
func (c *BlogController) GetFeatured(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	rows, err := c.db.Query(ctx,
		`SELECT `+blogCols+`
		 FROM blog_posts WHERE media_type = 'image' AND published = TRUE
		 ORDER BY date DESC LIMIT 30`)
	if err != nil {
		http.Error(w, `{"error":"db"}`, http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	posts := []blogPost{}
	for rows.Next() {
		var p blogPost
		if err := scanPost(rows, &p); err == nil {
			posts = append(posts, p)
		}
	}

	// Rotate the order by day-of-year so the featured set varies each day.
	if n := len(posts); n > 0 {
		shift := time.Now().UTC().YearDay() % n
		posts = append(posts[shift:], posts[:shift]...)
	}
	if len(posts) > 12 {
		posts = posts[:12]
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	json.NewEncoder(w).Encode(map[string]interface{}{"posts": posts})
}

// GetBlogPost serves a single published post by slug.
func (c *BlogController) GetBlogPost(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	slug := r.PathValue("slug")
	var p blogPost
	err := scanPost(c.db.QueryRow(ctx,
		`SELECT `+blogCols+`
		 FROM blog_posts WHERE slug = $1 AND published = TRUE`, slug), &p)
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	json.NewEncoder(w).Encode(p)
}
