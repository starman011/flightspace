import { useEffect, useState } from 'react'
import styles from './StatusBar.module.css'

export default function StatusBar({ connectionStatus }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'connecting') {
      setVisible(true)
    } else {
      // Short delay before hiding so the user sees the reconnect confirmation
      const timer = setTimeout(() => setVisible(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [connectionStatus])

  if (!visible) return null

  const msg = connectionStatus === 'connecting'
    ? 'reconnecting...'
    : 'disconnected — data may be stale'

  return (
    <div className={styles.bar} role="status">
      <span className={styles.dot} />
      {msg}
    </div>
  )
}
