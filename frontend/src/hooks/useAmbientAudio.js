import { useState, useEffect, useRef, useCallback } from 'react'

const STORAGE_KEY = 'fs.ambient.muted'

export function useAmbientAudio() {
  const [muted, setMuted] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')
  const [ready, setReady] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    const audio = new Audio('/ambient-space.mp3')
    audio.loop = true
    audio.volume = 0.12
    audioRef.current = audio

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

  const toggle = useCallback(() => setMuted(m => !m), [])

  return { muted, toggle }
}
