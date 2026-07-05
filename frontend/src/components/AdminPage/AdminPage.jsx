import { useState, useEffect, useCallback } from 'react'
import styles from './AdminPage.module.css'
import ArchitectureExplorer from './ArchitectureExplorer'

const API = import.meta.env.VITE_API_URL || ''

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
)

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return d.toLocaleDateString()
}

const addr = (from) => {
  const m = /<(.+?)>/.exec(from || '')
  return m ? m[1] : (from || '')
}

// Normalize both sources into one card shape.
function normalize(raw, tab) {
  if (tab === 'inbound') {
    return {
      id: raw.id,
      who: raw.from,
      email: addr(raw.from),
      subject: raw.subject || '(no subject)',
      body: raw.text || (raw.html ? '(HTML email — open in your mail app to view the full formatting)' : '(no text content)'),
      created_at: raw.created_at, read_at: raw.read_at, replied_at: raw.replied_at, reply_body: raw.reply_body,
    }
  }
  return {
    id: raw.id, who: raw.name || raw.email, email: raw.email, subject: null,
    body: raw.message, created_at: raw.created_at, read_at: raw.read_at, replied_at: raw.replied_at, reply_body: raw.reply_body,
  }
}

export default function AdminPage({ onClose, isAuthenticated, sessionToken, onSignIn }) {
  const authH = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}
  const [tab, setTab] = useState('inbound')       // inbound | contact
  const [state, setState] = useState('loading')   // loading | denied | ready
  const [items, setItems] = useState([])
  const [openId, setOpenId] = useState(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)
  const [syncId, setSyncId] = useState('')
  const [syncing, setSyncing] = useState(false)

  const listUrl = tab === 'inbound' ? `${API}/api/v1/admin/inbound` : `${API}/api/v1/admin/messages`
  const itemBase = (id) => tab === 'inbound' ? `${API}/api/v1/admin/inbound/${id}` : `${API}/api/v1/admin/messages/${id}`

  const load = useCallback(() => {
    if (tab === 'arch') { setItems([]); setState('ready'); return }  // static walkthrough — nothing to fetch
    setState('loading')
    setOpenId(null)
    fetch(listUrl, { credentials: 'include', headers: authH })
      .then(r => { if (r.status === 200) return r.json(); throw new Error(String(r.status)) })
      .then(d => { setItems((d.messages || []).map(m => normalize(m, tab))); setState('ready') })
      .catch(() => setState('denied'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listUrl, tab, sessionToken])

  useEffect(() => { load() }, [load, isAuthenticated])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openItem = (m) => {
    setOpenId(prev => prev === m.id ? null : m.id)
    setReply('')
    if (!m.read_at) {
      fetch(`${itemBase(m.id)}/read`, { method: 'POST', credentials: 'include', headers: authH }).catch(() => {})
      setItems(prev => prev.map(x => x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x))
    }
  }

  const sendReply = (m) => {
    if (reply.trim().length < 2 || sending) return
    setSending(true)
    fetch(`${itemBase(m.id)}/reply`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authH },
      body: JSON.stringify({ reply: reply.trim() }),
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(() => {
        setItems(prev => prev.map(x => x.id === m.id ? { ...x, replied_at: new Date().toISOString(), reply_body: reply.trim() } : x))
        setReply(''); setToast('Reply sent'); setTimeout(() => setToast(null), 2500)
      })
      .catch(() => { setToast('Failed to send — try again'); setTimeout(() => setToast(null), 3000) })
      .finally(() => setSending(false))
  }

  const sync = () => {
    const id = syncId.trim()
    if (!id || syncing) return
    setSyncing(true)
    fetch(`${API}/api/v1/admin/inbound/sync`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...authH },
      body: JSON.stringify({ email_id: id }),
    })
      .then(async r => { if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || '') } return r.json() })
      .then(() => { setSyncId(''); setToast('Imported'); setTimeout(() => setToast(null), 2500); load() })
      .catch(err => { setToast(err?.message ? `Import failed: ${err.message}` : 'Import failed — check the ID'); setTimeout(() => setToast(null), 6000) })
      .finally(() => setSyncing(false))
  }

  const unread = items.filter(m => !m.read_at).length

  return (
    <div className={styles.overlay}>
      <button className={styles.close} onClick={onClose} aria-label="Close"><CloseIcon /></button>

      <div className={styles.wrap}>
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>ObjectTracer · Admin</p>
            <h1 className={styles.title}>Inbox{unread > 0 && <span className={styles.badge}>{unread} new</span>}</h1>
          </div>
          {state === 'ready' && <button className={styles.ghost} onClick={load}>Refresh</button>}
        </header>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${tab === 'inbound' ? styles.tabOn : ''}`} onClick={() => setTab('inbound')}>Received emails</button>
          <button className={`${styles.tab} ${tab === 'contact' ? styles.tabOn : ''}`} onClick={() => setTab('contact')}>Contact form</button>
          <button className={`${styles.tab} ${tab === 'arch' ? styles.tabOn : ''}`} onClick={() => setTab('arch')}>How it works</button>
        </div>

        {tab === 'arch' && <ArchitectureExplorer />}

        {tab === 'inbound' && state === 'ready' && (
          <div className={styles.syncRow}>
            <input
              className={styles.syncInput}
              placeholder="Paste a Resend email ID to import history…"
              value={syncId}
              onChange={e => setSyncId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sync()}
            />
            <button className={styles.ghost} onClick={sync} disabled={syncing || !syncId.trim()}>
              {syncing ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}

        {state === 'loading' && <p className={styles.info}>Loading…</p>}

        {state === 'denied' && (
          <div className={styles.gate}>
            <h2>Admin access only</h2>
            {!isAuthenticated ? (
              <>
                <p>Sign in with the authorized ObjectTracer admin Google account to continue.</p>
                <button className={styles.primary} onClick={() => onSignIn?.()}>Sign in</button>
              </>
            ) : (
              <p>This account isn’t authorized for the admin panel.</p>
            )}
          </div>
        )}

        {state === 'ready' && tab !== 'arch' && items.length === 0 && (
          <p className={styles.info}>{tab === 'inbound' ? 'No received emails yet. New emails to your inbound address will appear here.' : 'No contact-form messages yet.'}</p>
        )}

        {state === 'ready' && items.map(m => {
          const open = openId === m.id
          return (
            <div key={m.id} className={`${styles.card} ${!m.read_at ? styles.unread : ''}`}>
              <button className={styles.cardHead} onClick={() => openItem(m)}>
                <div className={styles.who}>
                  <span className={styles.name}>{m.subject || m.who}</span>
                  <span className={styles.email}>{m.who !== m.email && m.subject ? `${m.who} · ` : ''}{m.email}</span>
                </div>
                <div className={styles.meta}>
                  {m.replied_at ? <span className={`${styles.pill} ${styles.pillReplied}`}>Replied</span>
                    : !m.read_at ? <span className={`${styles.pill} ${styles.pillNew}`}>New</span> : null}
                  <span className={styles.time}>{timeAgo(m.created_at)}</span>
                </div>
              </button>

              {open && (
                <div className={styles.body}>
                  <p className={styles.message}>{m.body}</p>

                  {m.replied_at && (
                    <div className={styles.prevReply}>
                      <span className={styles.prevLabel}>Your reply</span>
                      <p>{m.reply_body}</p>
                    </div>
                  )}

                  <textarea
                    className={styles.textarea}
                    placeholder={`Reply to ${m.email}…`}
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                  />
                  <div className={styles.actions}>
                    <a className={styles.ghost} href={`mailto:${m.email}`}>Open in mail app</a>
                    <button className={styles.primary} disabled={sending || reply.trim().length < 2} onClick={() => sendReply(m)}>
                      {sending ? 'Sending…' : m.replied_at ? 'Send another reply' : 'Send reply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
