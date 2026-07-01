import { useState, useEffect, useCallback } from 'react'
import styles from './AdminPage.module.css'

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

export default function AdminPage({ onClose, isAuthenticated, onSignIn }) {
  const [state, setState] = useState('loading')   // loading | denied | ready
  const [messages, setMessages] = useState([])
  const [openId, setOpenId] = useState(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(() => {
    setState('loading')
    fetch(`${API}/api/v1/admin/messages`, { credentials: 'include' })
      .then(r => {
        if (r.status === 200) return r.json()
        throw new Error(String(r.status))
      })
      .then(d => { setMessages(d.messages || []); setState('ready') })
      .catch(() => setState('denied'))
  }, [])

  useEffect(() => { load() }, [load, isAuthenticated])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openMsg = (m) => {
    setOpenId(prev => prev === m.id ? null : m.id)
    setReply('')
    if (!m.read_at) {
      fetch(`${API}/api/v1/admin/messages/${m.id}/read`, { method: 'POST', credentials: 'include' }).catch(() => {})
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x))
    }
  }

  const sendReply = (m) => {
    if (reply.trim().length < 2 || sending) return
    setSending(true)
    fetch(`${API}/api/v1/admin/messages/${m.id}/reply`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: reply.trim() }),
    })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(() => {
        setMessages(prev => prev.map(x => x.id === m.id ? { ...x, replied_at: new Date().toISOString(), reply_body: reply.trim() } : x))
        setReply('')
        setToast('Reply sent')
        setTimeout(() => setToast(null), 2500)
      })
      .catch(() => { setToast('Failed to send — try again'); setTimeout(() => setToast(null), 3000) })
      .finally(() => setSending(false))
  }

  const unread = messages.filter(m => !m.read_at).length

  return (
    <div className={styles.overlay}>
      <button className={styles.close} onClick={onClose} aria-label="Close"><CloseIcon /></button>

      <div className={styles.wrap}>
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>ObjectTracer · Admin</p>
            <h1 className={styles.title}>Contact messages{unread > 0 && <span className={styles.badge}>{unread} new</span>}</h1>
          </div>
          {state === 'ready' && <button className={styles.ghost} onClick={load}>Refresh</button>}
        </header>

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

        {state === 'ready' && messages.length === 0 && <p className={styles.info}>No messages yet.</p>}

        {state === 'ready' && messages.map(m => {
          const open = openId === m.id
          return (
            <div key={m.id} className={`${styles.card} ${!m.read_at ? styles.unread : ''}`}>
              <button className={styles.cardHead} onClick={() => openMsg(m)}>
                <div className={styles.who}>
                  <span className={styles.name}>{m.name || m.email}</span>
                  <span className={styles.email}>{m.email}</span>
                </div>
                <div className={styles.meta}>
                  {m.replied_at ? <span className={`${styles.pill} ${styles.pillReplied}`}>Replied</span>
                    : !m.read_at ? <span className={`${styles.pill} ${styles.pillNew}`}>New</span> : null}
                  <span className={styles.time}>{timeAgo(m.created_at)}</span>
                </div>
              </button>

              {open && (
                <div className={styles.body}>
                  <p className={styles.message}>{m.message}</p>

                  {m.replied_at && (
                    <div className={styles.prevReply}>
                      <span className={styles.prevLabel}>Your reply</span>
                      <p>{m.reply_body}</p>
                    </div>
                  )}

                  <textarea
                    className={styles.textarea}
                    placeholder={`Reply to ${m.name || m.email}…`}
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
