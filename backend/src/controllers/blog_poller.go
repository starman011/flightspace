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
	return &BlogPoller{db: db, apiKey: apiKey, client: &http.Client{Timeout: 60 * time.Second}}
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
		"The universe showed off again today: %s. Here is what NASA captured:",
		"Another stunning view from the cosmos: %s. NASA explains:",
		"Today's window into deep space: %s. The story behind the image:",
		"Space never stops amazing us. Today: %s. Here is the science:",
		"A fresh look at our universe: %s. NASA's take:",
		"Look up and wonder. Today's cosmic highlight is %s:",
	}
	h := fnv.New32a()
	h.Write([]byte(date))
	return fmt.Sprintf(templates[int(h.Sum32())%len(templates)], title)
}

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
		`INSERT INTO blog_posts (slug, date, title, intro, explanation, image_url, hd_image_url, media_type, copyright, category)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULLIF($9,''),'journal')
		 ON CONFLICT (date, category) DO NOTHING`,
		slug, e.Date, e.Title, intro, e.Explanation, e.URL, e.HDURL, mt, e.Copyright)
	return err
}

// publishDue flips queued posts live once their publish date arrives —
// this is what delivers the weekly engineering series on schedule.
func (p *BlogPoller) publishDue(ctx context.Context) {
	tag, err := p.db.Exec(ctx,
		`UPDATE blog_posts SET published = TRUE
		 WHERE published = FALSE AND publish_on IS NOT NULL AND publish_on <= CURRENT_DATE`)
	if err != nil {
		log.Printf(`{"level":"error","service":"blog_poller","msg":"publish due failed","error":%q}`, err.Error())
		return
	}
	if n := tag.RowsAffected(); n > 0 {
		log.Printf(`{"level":"info","service":"blog_poller","msg":"published scheduled posts","count":%d}`, n)
	}
}

// Start backfills ~365 days on boot, then refreshes every 24h.
// Also publishes due scheduled posts hourly (weekly engineering series).
func (p *BlogPoller) Start(ctx context.Context) {
	log.Println(`{"level":"info","service":"blog_poller","msg":"starting"}`)
	p.backfill(ctx)
	p.publishDue(ctx)
	ticker := time.NewTicker(24 * time.Hour)
	pubTicker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	defer pubTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.daily(ctx)
		case <-pubTicker.C:
			p.publishDue(ctx)
		}
	}
}

// backfill walks ~365 days in 30-day chunks. A single 365-day APOD request
// returns ~435KB and takes >30s (times out); chunking keeps each request fast
// (~3s) and lets partial failures not lose the whole backfill.
func (p *BlogPoller) backfill(ctx context.Context) {
	end := time.Now().UTC()
	earliest := end.AddDate(0, 0, -365)
	total := 0
	for cursor := end; cursor.After(earliest); cursor = cursor.AddDate(0, 0, -30) {
		chunkEnd := cursor
		chunkStart := cursor.AddDate(0, 0, -29)
		if chunkStart.Before(earliest) {
			chunkStart = earliest
		}
		entries, err := p.fetchRange(ctx, chunkStart.Format("2006-01-02"), chunkEnd.Format("2006-01-02"))
		if err != nil {
			log.Printf(`{"level":"warn","service":"blog_poller","msg":"backfill chunk failed","start":%q,"error":%q}`,
				chunkStart.Format("2006-01-02"), err)
			continue
		}
		for _, e := range entries {
			if err := p.upsert(ctx, e); err == nil {
				total++
			}
		}
	}
	log.Printf(`{"level":"info","service":"blog_poller","msg":"backfill done","entries":%d}`, total)
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
