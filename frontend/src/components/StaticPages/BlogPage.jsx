import { useEffect, useState } from 'react'
import styles from './BlogPage.module.css'

const API = import.meta.env.VITE_API_URL || ''

const PAGE_SIZE = 30

// YouTube / Vimeo URL → embeddable player URL (null → show a plain link)
export function toEmbedUrl(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.searchParams.get('v') || u.pathname.match(/\/(shorts|embed)\/([\w-]{6,})/)?.[2]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.match(/\/(\d+)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch { /* fall through */ }
  return null
}

export default function BlogPage({ onClose, initialSlug, initialTab }) {
  const [tab, setTabState] = useState(initialTab === 'engineering' ? 'engineering' : 'journal')
  // Tab ↔ URL: /engineering is the public home of the weekly series
  const setTab = (t) => {
    setTabState(t)
    window.history.replaceState(null, '', t === 'engineering' ? '/engineering' : '/blog')
  }
  const [posts, setPosts] = useState([])
  const [active, setActive] = useState(null)    // full post object
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)

  // Load first page of the current tab
  useEffect(() => {
    setLoading(true)
    setPosts([])
    fetch(`${API}/api/v1/blog?limit=${PAGE_SIZE}&offset=0&category=${tab}`)
      .then(r => r.ok ? r.json() : { posts: [], total: 0 })
      .then(d => { setPosts(d.posts || []); setTotal(d.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [tab])

  const loadMore = () => {
    setLoadingMore(true)
    fetch(`${API}/api/v1/blog?limit=${PAGE_SIZE}&offset=${posts.length}&category=${tab}`)
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(d => { setPosts(prev => [...prev, ...(d.posts || [])]); setLoadingMore(false) })
      .catch(() => setLoadingMore(false))
  }

  // Deep-link to a specific article
  useEffect(() => {
    if (!initialSlug) return
    fetch(`${API}/api/v1/blog/${initialSlug}`)
      .then(r => r.ok ? r.json() : null)
      .then(p => { if (p) { setActive(p); if (p.category === 'engineering') setTab('engineering') } })
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
    window.history.replaceState(null, '', tab === 'engineering' ? '/engineering' : '/blog')
    setActive(null)
  }

  const isEng = active?.category === 'engineering'
  const embed = isEng ? toEmbedUrl(active.video_url) : null

  return (
    <div className={styles.overlay}>
      <button className={styles.close} onClick={onClose} aria-label="Close">×</button>

      {active ? (
        <article className={styles.article}>
          <button className={styles.back} onClick={backToFeed}>← {isEng ? 'Engineering' : 'Journal'}</button>

          {isEng ? (
            <>
              {active.image_url && (
                <img className={styles.hero} src={active.hd_image_url || active.image_url} alt={active.title} />
              )}
              <p className={styles.date}>{formatDate(active.date)} · <span className={styles.engTag}>Engineering</span></p>
              <h1 className={styles.title}>{active.title}</h1>
              {active.intro && <p className={styles.intro}>{active.intro}</p>}
              {embed && (
                <div className={styles.videoWrap}>
                  <iframe src={embed} title={active.title} allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                </div>
              )}
              {!embed && active.video_url && (
                <a className={styles.videoLink} href={active.video_url} target="_blank" rel="noopener noreferrer">Watch the video</a>
              )}
              {/* Engineering posts are long-form with intentional line breaks */}
              <p className={styles.body} style={{ whiteSpace: 'pre-wrap' }}>{active.explanation}</p>
              <p className={styles.source}>ObjectTracer Engineering · building in public</p>
            </>
          ) : (
            <>
              {active.media_type === 'image' ? (
                <img className={styles.hero} src={active.hd_image_url || active.image_url} alt={active.title} />
              ) : (
                <a className={styles.videoLink} href={active.image_url} target="_blank" rel="noopener noreferrer">Watch the featured video</a>
              )}
              <p className={styles.date}>{formatDate(active.date)}</p>
              <h1 className={styles.title}>{active.title}</h1>
              <p className={styles.intro}>{active.intro}</p>
              <h2 className={styles.sectionH}>The science — from NASA's Astronomy Picture of the Day</h2>
              <p className={styles.body}>{active.explanation}</p>
              {active.copyright && <p className={styles.credit}>Image credit: {active.copyright}</p>}
              <p className={styles.source}>Source: <a href={`https://apod.nasa.gov/apod/ap${active.date.replace(/-/g,'').slice(2)}.html`} target="_blank" rel="noopener noreferrer">NASA APOD</a></p>
            </>
          )}

          <h2 className={styles.sectionH}>See it live on ObjectTracer</h2>
          <p className={styles.explore}>
            Explore what's moving above you in real time:{' '}
            <a href="/deep-space">Deep Space</a> · <a href="/iss">ISS</a> · <a href="/asteroids">Asteroids</a> · <a href="/launches">Launches</a> · <a href="/">the live globe →</a>
          </p>
        </article>
      ) : (
        <div className={styles.feed}>
          <header className={styles.feedHeader}>
            <h1 className={styles.feedTitle}>{tab === 'engineering' ? 'Engineering Blog' : 'Space Journal'}</h1>
            <p className={styles.feedSub}>
              {tab === 'engineering'
                ? 'How ObjectTracer is built — one problem a week, in depth'
                : 'Daily cosmic imagery, powered by NASA APOD'}
            </p>
            <div className={styles.tabs}>
              <button className={`${styles.tabBtn} ${tab === 'journal' ? styles.tabOn : ''}`} onClick={() => setTab('journal')}>Journal</button>
              <button className={`${styles.tabBtn} ${tab === 'engineering' ? styles.tabOn : ''}`} onClick={() => setTab('engineering')}>Engineering Blog</button>
            </div>
          </header>
          {loading && <p className={styles.loading}>Loading…</p>}
          {!loading && tab === 'engineering' && posts.length === 0 && (
            <p className={styles.loading}>First engineering post lands soon — one deep dive a week.</p>
          )}
          <div className={styles.bento}>
            {posts.map((p, i) => (
              <button
                key={p.slug}
                className={`${styles.tile} ${styles[bentoSize(i)]}`}
                style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}
                onClick={() => openPost(p.slug)}
              >
                {p.image_url
                  ? <img className={styles.tileImg} src={p.image_url} alt={p.title} loading="lazy" />
                  : p.category === 'engineering'
                    ? <div className={styles.tileEng}>{'{ }'}</div>
                    : <div className={styles.tileVideo}>▶</div>}
                <div className={styles.scrim} />
                {i === 0 && <span className={styles.featuredTag}>Latest</span>}
                <div className={styles.tileBody}>
                  <span className={styles.tileDate}>{formatDate(p.date)}</span>
                  <span className={styles.tileTitle}>{p.title}</span>
                </div>
              </button>
            ))}
          </div>
          {!loading && posts.length < total && (
            <button className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : `Load more (${posts.length} of ${total})`}
            </button>
          )}
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

// Deterministic bento rhythm: newest is the hero, then a repeating pattern of
// wide / tall / standard tiles. grid-auto-flow:dense packs the gaps.
function bentoSize(i) {
  if (i === 0) return 'hero'
  const r = i % 6
  if (r === 2) return 'wide'
  if (r === 5) return 'tall'
  return 'std'
}
