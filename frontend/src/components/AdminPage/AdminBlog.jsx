import { useState, useEffect, useCallback } from 'react'
import styles from './AdminBlog.module.css'

const API = import.meta.env.VITE_API_URL || ''

const EMPTY = { slug: '', date: '', title: '', intro: '', body: '', image_url: '', video_url: '', publish_on: '' }

// Engineering blog editor — write, schedule, and manage the weekly series.
// Media is by URL: paste an image link and/or a YouTube/Vimeo link.
export default function AdminBlog({ sessionToken }) {
  const authH = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
  const [posts, setPosts] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(() => {
    fetch(`${API}/api/v1/admin/blog`, { credentials: 'include', headers: authH })
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(d => setPosts(d.posts || []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  useEffect(() => { load() }, [load])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = () => {
    if (!form.title.trim() || !form.body.trim()) { setMsg('Title and body are required.'); return }
    setSaving(true)
    setMsg(null)
    fetch(`${API}/api/v1/admin/blog`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authH },
      body: JSON.stringify(form),
    })
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then(d => {
        setMsg(d.published ? `Published: /blog/${d.slug}` : `Queued: /blog/${d.slug} goes live ${form.publish_on}`)
        setForm(EMPTY)
        load()
      })
      .catch(e => setMsg(e?.error || 'Save failed.'))
      .finally(() => setSaving(false))
  }

  const edit = (p) => {
    setForm({ slug: p.slug, date: p.date, title: p.title, intro: p.intro, body: p.body,
      image_url: p.image_url, video_url: p.video_url, publish_on: p.publish_on })
    setMsg(`Editing ${p.slug}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const remove = (slug) => {
    if (!window.confirm(`Delete ${slug}? This cannot be undone.`)) return
    fetch(`${API}/api/v1/admin/blog/${slug}`, { method: 'DELETE', credentials: 'include', headers: authH })
      .then(r => { if (r.ok) load() })
      .catch(() => {})
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.editor}>
        <p className={styles.kicker}>{form.slug ? 'Edit post' : 'New engineering post'}</p>

        <input className={styles.input} placeholder="Title, e.g. Week 2: Making 40,000 Aircraft Clickable"
          value={form.title} onChange={set('title')} />

        <div className={styles.row}>
          <label className={styles.field}>
            <span>Post date</span>
            <input className={styles.input} type="date" value={form.date} onChange={set('date')} />
          </label>
          <label className={styles.field}>
            <span>Publish on (blank = now)</span>
            <input className={styles.input} type="date" value={form.publish_on} onChange={set('publish_on')} />
          </label>
        </div>

        <input className={styles.input} placeholder="Intro: one-line hook shown under the title (optional)"
          value={form.intro} onChange={set('intro')} />
        <input className={styles.input} placeholder="Image URL (optional)"
          value={form.image_url} onChange={set('image_url')} />
        <input className={styles.input} placeholder="Video URL: YouTube or Vimeo link (optional)"
          value={form.video_url} onChange={set('video_url')} />

        <textarea className={styles.textarea} rows={14}
          placeholder={'Body. Line breaks are preserved exactly as written.\n\nThe problem:\n1. ...\n\nThe solution:\n1. ...'}
          value={form.body} onChange={set('body')} />

        <div className={styles.actions}>
          {form.slug && <button className={styles.ghost} onClick={() => { setForm(EMPTY); setMsg(null) }}>Cancel edit</button>}
          <button className={styles.save} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : form.publish_on ? 'Save & schedule' : 'Publish now'}
          </button>
        </div>
        {msg && <p className={styles.msg}>{msg}</p>}
      </div>

      <div className={styles.list}>
        <p className={styles.kicker}>Posts ({posts.length})</p>
        {posts.length === 0 && <p className={styles.empty}>No engineering posts yet. The form above creates the first one.</p>}
        {posts.map(p => (
          <div key={p.slug} className={styles.item}>
            <div className={styles.itemMain}>
              <span className={styles.itemTitle}>{p.title}</span>
              <span className={styles.itemMeta}>
                {p.date}
                {p.published
                  ? <span className={styles.live}>live</span>
                  : <span className={styles.queued}>queued · {p.publish_on || 'no date'}</span>}
              </span>
            </div>
            <div className={styles.itemActions}>
              <button className={styles.ghost} onClick={() => edit(p)}>Edit</button>
              <button className={styles.danger} onClick={() => remove(p.slug)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
