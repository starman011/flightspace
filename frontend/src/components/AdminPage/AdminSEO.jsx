import { useMemo, useState } from 'react'
import styles from './AdminSEO.module.css'

// SEO improvement backlog, sequenced by impact (claude-seo methodology:
// PERCEIVE -> ANALYZE -> VALIDATE -> ACT). "done" reflects what already ships;
// "todo"/"input" is the prioritized work. Edit this array to update the board.
const TASKS = [
  // ── Shipped ────────────────────────────────────────────────────────────
  { cat: 'Technical',  pri: 'P0', status: 'done', title: 'Per-route SSR for crawlers',
    detail: 'Edge middleware renders full HTML for bots on /flight, /airport, /airline, /launch, /route, /satellite, /blog, /engineering, /iss.',
    improves: 'Crawlability / indexation' },
  { cat: 'Schema',     pri: 'P0', status: 'done', title: 'Entity JSON-LD (Flight / Airport / Airline / Launch)',
    detail: 'Each SSR page emits typed schema.org markup; airport/airline/launch pages also carry FAQPage.',
    improves: 'Rich results' },
  { cat: 'Schema',     pri: 'P0', status: 'done', title: 'Blog/Article structured data enriched',
    detail: 'BlogPosting/Article @graph with dateModified, description, wordCount, mainEntityOfPage, series linkage + BreadcrumbList.',
    improves: 'Rich results / AI citability' },
  { cat: 'Technical',  pri: 'P1', status: 'done', title: 'Sitemaps + robots.txt',
    detail: 'sitemap.xml (+ launches + blog) with lastmod freshness signals; robots allows all but /profile, /admin.',
    improves: 'Discovery / crawl budget' },
  { cat: 'Technical',  pri: 'P1', status: 'done', title: 'Per-route canonical + OG/Twitter',
    detail: 'Canonical, Open Graph, and Twitter cards set per route via middleware.',
    improves: 'Dedup / social CTR' },
  { cat: 'Performance', pri: 'P1', status: 'done', title: 'Core Web Vitals baseline',
    detail: 'Boot payload trimmed, compositor-only motion (no layout thrash), lazy route chunks with reload-recovery.',
    improves: 'LCP / INP / CLS' },

  // ── Next up ────────────────────────────────────────────────────────────
  { cat: 'Content / E-E-A-T', pri: 'P0', status: 'done', title: 'Named Person author on Engineering blog',
    detail: 'Engineering posts now credit Md Saqlain Khan, Founder & CTO — as schema.org Person (jobTitle + worksFor) and a visible byline.',
    improves: 'E-E-A-T' },
  { cat: 'Schema',     pri: 'P0', status: 'done', title: 'BreadcrumbList on entity pages',
    detail: 'Home > Section > Page breadcrumbs now emitted on flight, airport, and airline SSR (blog already had it).',
    improves: 'SERP breadcrumbs' },
  { cat: 'Technical',  pri: 'P0', status: 'done', title: 'Bot-render /faq (FAQPage schema)',
    detail: '/faq now SSR\'d with BreadcrumbList + 18 question-headed answers. Note: Google retired FAQ rich results (May 2026) so FAQPage schema is kept for AI/answer engines + semantics, not Google snippets. /about, /contact remain SPA-only.',
    improves: 'Indexation / rich results' },
  { cat: 'AI Search',  pri: 'P1', status: 'done', title: 'Citable answer block (GEO)',
    detail: 'Home SSR now has a self-contained ~145-word "What is ObjectTracer?" answer under a question H2 (seo-geo 134–167 word sweet spot); FAQ provides question-headed Q&A. AI crawlers (GPTBot/ClaudeBot/PerplexityBot/Google-Extended) allowed; no llms.txt (not a citation lever).',
    improves: 'AI Overviews / ChatGPT citations' },
  { cat: 'Content',    pri: 'P1', status: 'todo', title: 'Image SEO pass',
    detail: 'Audit alt text, set width/height to prevent CLS, serve WebP/AVIF where possible, descriptive filenames.',
    improves: 'Image search / CLS' },
  { cat: 'Schema',     pri: 'P1', status: 'input', title: 'Organization + author sameAs (entity authority)',
    detail: 'Add sameAs links (LinkedIn / GitHub / X / YouTube) to the Organization and Person author nodes — a measured AI-citation correlation. NEEDS the profile URLs. VideoObject on engineering posts with embeds is a follow-up.',
    improves: 'Entity authority / AI citations' },
  { cat: 'Monitoring', pri: 'P1', status: 'todo', title: 'CWV field data + coverage watch',
    detail: 'Track INP/LCP from CrUX/GSC, watch Coverage for newly-indexed vs excluded URLs after each deploy.',
    improves: 'Continuous verification' },
  { cat: 'Discovery',  pri: 'P2', status: 'todo', title: 'RSS feed + blog pagination signals',
    detail: 'Publish an RSS feed for the blog; expose rel prev/next (or a clear "load more" crawl path) on the feed.',
    improves: 'Feed discovery' },
]

const PRI = { P0: 'High', P1: 'Medium', P2: 'Low' }
const STATUS = { done: 'Shipped', todo: 'To do', input: 'Needs input' }
const FILTERS = ['all', 'todo', 'done']

export default function AdminSEO() {
  const [filter, setFilter] = useState('all')
  const counts = useMemo(() => ({
    done: TASKS.filter(t => t.status === 'done').length,
    todo: TASKS.filter(t => t.status !== 'done').length,
  }), [])
  const shown = useMemo(() => TASKS.filter(t =>
    filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done'
  ).sort((a, b) => a.pri.localeCompare(b.pri)), [filter])

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>SEO improvement board</h2>
          <p className={styles.sub}>Sequenced by impact · {counts.done} shipped · {counts.todo} open</p>
        </div>
        <div className={styles.filters}>
          {FILTERS.map(f => (
            <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.filterOn : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'todo' ? 'Open' : 'Shipped'}
            </button>
          ))}
        </div>
      </div>

      <ul className={styles.list}>
        {shown.map((t, i) => (
          <li key={i} className={`${styles.card} ${styles['s_' + t.status]}`}>
            <div className={styles.cardHead}>
              <span className={`${styles.pri} ${styles['p_' + t.pri]}`}>{t.pri} · {PRI[t.pri]}</span>
              <span className={styles.cat}>{t.cat}</span>
              <span className={`${styles.status} ${styles['st_' + t.status]}`}>{STATUS[t.status]}</span>
            </div>
            <p className={styles.cardTitle}>{t.title}</p>
            <p className={styles.detail}>{t.detail}</p>
            <p className={styles.improves}>Improves: <strong>{t.improves}</strong></p>
          </li>
        ))}
      </ul>
    </div>
  )
}
