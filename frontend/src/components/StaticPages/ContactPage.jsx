import { useState } from 'react'
import styles from './StaticPages.module.css'

export default function ContactPage({ onClose }) {
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState('')
  const [status,  setStatus]  = useState('idle')
  const [errMsg,  setErrMsg]  = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (message.trim().length < 5) { setErrMsg('Please write at least a few words'); setStatus('error'); return }
    setStatus('loading')
    try {
      const API = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${API}/api/v1/contact`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), email: email.trim(), message: message.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || '')
      }
      setStatus('done')
    } catch (err) {
      setErrMsg(err?.message || '')
      setStatus('error')
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <button className={styles.heroClose} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className={styles.hero}>
          <img className={styles.heroImg} src="/night-sky.jpg" alt="The Milky Way over a wildflower hillside" />
          <div className={styles.heroOverlay} />
          <div className={styles.heroText}>
            <p className={styles.heroKicker}>ObjectTracer</p>
            <h1 className={styles.heroTitle}>Get in touch</h1>
          </div>
        </div>

        <div className={styles.body}>
          {status === 'done' ? (
            <>
              <p style={{ color: '#a3e635', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>
                Message sent.
              </p>
              <p>We'll get back to you at <strong>{email}</strong>. We read every message.</p>
              <button className={styles.formSubmit} onClick={onClose} style={{ marginTop: 16 }}>
                Close
              </button>
            </>
          ) : (
            <>
              <p>Have feedback, found a bug, or want to collaborate? We read everything.</p>
              <form onSubmit={submit}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Name (optional)</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={status === 'loading'}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email</label>
                  <input
                    className={styles.formInput}
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={status === 'loading'}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Message</label>
                  <textarea
                    className={styles.formTextarea}
                    placeholder="Tell us what's on your mind..."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    required
                    disabled={status === 'loading'}
                  />
                </div>
                {status === 'error' && (
                  <p style={{ color: 'rgba(255,100,100,0.8)', fontSize: 12, fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                    {errMsg ? errMsg.charAt(0).toUpperCase() + errMsg.slice(1) + '.' : 'Something went wrong — please try again.'}
                  </p>
                )}
                <button
                  type="submit"
                  className={styles.formSubmit}
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? 'Sending…' : 'Send Message'}
                </button>
              </form>

              <h3>Other ways to reach us</h3>
              <p>
                Email us directly at{' '}
                <a href="mailto:hello@objecttracer.com">hello@objecttracer.com</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
