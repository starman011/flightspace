import { useState, useEffect, useRef } from 'react'
import styles from './AmbientAudio.module.css'

const STORAGE_KEY = 'fs.ambient.muted'

export default function AmbientAudio() {
  const [muted, setMuted] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')
  const [ready, setReady] = useState(false)
  const audioRef = useRef(null)

  // Create audio element once
  useEffect(() => {
    const audio = new Audio('/ambient-space.mp3')
    audio.loop = true
    audio.volume = 0.15
    audioRef.current = audio

    // Fade in after first user interaction (autoplay policy)
    const start = () => {
      if (audioRef.current.paused && !muted) {
        audioRef.current.play().catch(() => {})
      }
      setReady(true)
      window.removeEventListener('click', start)
      window.removeEventListener('touchstart', start)
      window.removeEventListener('keydown', start)
    }

    window.addEventListener('click', start, { once: false })
    window.addEventListener('touchstart', start, { once: false })
    window.addEventListener('keydown', start, { once: false })

    return () => {
      window.removeEventListener('click', start)
      window.removeEventListener('touchstart', start)
      window.removeEventListener('keydown', start)
      audio.pause()
      audio.src = ''
    }
  }, [])

  // Sync mute state
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (muted) {
      audio.pause()
      localStorage.setItem(STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(STORAGE_KEY)
      if (ready) audio.play().catch(() => {})
    }
  }, [muted, ready])

  const toggle = () => setMuted(m => !m)

  return (
    <button
      className={styles.muteBtn}
      onClick={toggle}
      title={muted ? 'Unmute ambient audio' : 'Mute ambient audio'}
      aria-label={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  )
}
