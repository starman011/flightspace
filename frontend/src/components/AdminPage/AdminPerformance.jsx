import { useState } from 'react'
import styles from './AdminPerformance.module.css'

// Live Google performance data (PageSpeed Insights v5 → Lighthouse lab + CrUX
// field). Works without a key at low volume; an API key (Tier 0) raises quota.
// Key is stored locally in the browser only — never sent to our backend.
const PSI = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'
const SITE = 'https://www.objecttracer.com/'

const RATE = {          // Core Web Vitals thresholds (good / needs-improvement)
  lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], fcp: [1800, 3000],
}
function band(metric, v) {
  if (v == null) return 'na'
  const [g, n] = RATE[metric]
  return v <= g ? 'good' : v <= n ? 'ni' : 'poor'
}
const fmtMs = v => v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`
const fmtCls = v => v == null ? '—' : v.toFixed(3)

async function runPSI(strategy, key) {
  const u = new URL(PSI)
  u.searchParams.set('url', SITE)
  u.searchParams.set('strategy', strategy)
  u.searchParams.append('category', 'performance')
  if (key) u.searchParams.set('key', key)
  const r = await fetch(u)
  if (!r.ok) throw new Error(`PSI ${r.status}`)
  const d = await r.json()
  const lh = d.lighthouseResult
  const field = d.loadingExperience?.metrics || {}
  return {
    score: lh?.categories?.performance?.score != null ? Math.round(lh.categories.performance.score * 100) : null,
    lab: {
      lcp: lh?.audits?.['largest-contentful-paint']?.numericValue,
      cls: lh?.audits?.['cumulative-layout-shift']?.numericValue,
      fcp: lh?.audits?.['first-contentful-paint']?.numericValue,
      tbt: lh?.audits?.['total-blocking-time']?.numericValue,
    },
    field: {
      lcp: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
      inp: field.INTERACTION_TO_NEXT_PAINT?.percentile,
      cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
      fcp: field.FIRST_CONTENTFUL_PAINT_MS?.percentile,
      hasData: !!d.loadingExperience?.metrics,
    },
  }
}

function Metric({ label, metric, value, fmt }) {
  return (
    <div className={`${styles.metric} ${styles['b_' + band(metric, value)]}`}>
      <span className={styles.mLabel}>{label}</span>
      <span className={styles.mValue}>{fmt(value)}</span>
    </div>
  )
}

function Panel({ strategy, r }) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.strategy}>{strategy === 'mobile' ? 'Mobile' : 'Desktop'}</span>
        <span className={`${styles.score} ${styles['b_' + (r.score >= 90 ? 'good' : r.score >= 50 ? 'ni' : 'poor')]}`}>{r.score ?? '—'}</span>
      </div>
      <p className={styles.group}>Field data (CrUX — real users)</p>
      {r.field.hasData ? (
        <div className={styles.metrics}>
          <Metric label="LCP" metric="lcp" value={r.field.lcp} fmt={fmtMs} />
          <Metric label="INP" metric="inp" value={r.field.inp} fmt={fmtMs} />
          <Metric label="CLS" metric="cls" value={r.field.cls} fmt={fmtCls} />
        </div>
      ) : <p className={styles.noField}>Not enough field data yet (needs more real traffic).</p>}
      <p className={styles.group}>Lab data (Lighthouse)</p>
      <div className={styles.metrics}>
        <Metric label="LCP" metric="lcp" value={r.lab.lcp} fmt={fmtMs} />
        <Metric label="CLS" metric="cls" value={r.lab.cls} fmt={fmtCls} />
        <Metric label="FCP" metric="fcp" value={r.lab.fcp} fmt={fmtMs} />
        <Metric label="TBT" metric="inp" value={r.lab.tbt} fmt={fmtMs} />
      </div>
    </div>
  )
}

export default function AdminPerformance() {
  const [key, setKey] = useState(() => { try { return localStorage.getItem('ot-psi-key') || '' } catch { return '' } })
  const [state, setState] = useState('idle')   // idle | loading | ready | error
  const [err, setErr] = useState('')
  const [data, setData] = useState(null)
  const [ranAt, setRanAt] = useState(null)

  const saveKey = (v) => { setKey(v); try { localStorage.setItem('ot-psi-key', v) } catch { /* private mode */ } }

  const run = async () => {
    setState('loading'); setErr('')
    try {
      const [mobile, desktop] = await Promise.all([runPSI('mobile', key), runPSI('desktop', key)])
      setData({ mobile, desktop }); setRanAt(new Date()); setState('ready')
    } catch (e) {
      setErr(String(e.message || e)); setState('error')
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Search performance — Core Web Vitals</h2>
          <p className={styles.sub}>Live from Google PageSpeed Insights (Lighthouse lab + CrUX field){ranAt ? ` · ran ${ranAt.toLocaleTimeString()}` : ''}</p>
        </div>
        <button className={styles.run} onClick={run} disabled={state === 'loading'}>
          {state === 'loading' ? 'Running…' : 'Run check'}
        </button>
      </div>

      <div className={styles.keyRow}>
        <input
          className={styles.keyInput}
          type="password"
          placeholder="Optional Google API key (PageSpeed / CrUX) — stored in this browser only"
          value={key}
          onChange={e => saveKey(e.target.value)}
        />
        <a className={styles.keyHint} href="https://developers.google.com/speed/docs/insights/v5/get-started" target="_blank" rel="noopener noreferrer">Get a key ↗</a>
      </div>

      {state === 'error' && <p className={styles.error}>Couldn't reach PageSpeed Insights: {err}. Without a key the API is rate-limited — add one above and retry.</p>}
      {state === 'idle' && <p className={styles.idle}>Run a live check against objecttracer.com. Field data (real Chrome users) appears when there's enough traffic; lab data always does.</p>}

      {data && (
        <div className={styles.panels}>
          <Panel strategy="mobile" r={data.mobile} />
          <Panel strategy="desktop" r={data.desktop} />
        </div>
      )}

      <p className={styles.note}>
        Targets: LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1. Search Console query data and the Indexing API need OAuth —
        connect those in Google's own console; this card covers the credential-free performance tier.
      </p>
    </div>
  )
}
