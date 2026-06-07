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
