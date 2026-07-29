import styles from './StaticPages.module.css'

export default function AboutPage({ onClose }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <button className={styles.heroClose} onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className={styles.hero}>
          <img className={styles.heroImg} src="/flight-sky.webp" width="1600" height="914" fetchpriority="high" alt="A plane crossing the sky, framed by spring flowers" />
          <div className={styles.heroOverlay} />
          <div className={styles.heroText}>
            <p className={styles.heroKicker}>ObjectTracer</p>
            <h1 className={styles.heroTitle}>Everything above you, on one globe</h1>
          </div>
        </div>
        <div className={styles.body}>
          <p>
            Look up on a clear night and you are seeing a tiny slice of it: a plane at cruising altitude, a satellite catching the sun, maybe the space station passing over. ObjectTracer is the whole picture, all at once. One 3D globe that scales smoothly from a single aircraft on final approach to the outer planets, showing what is actually moving up there right now.
          </p>

          <h3>Why we built it</h3>
          <p>
            The data has always been public. Aircraft broadcast their position twice a second. Satellites follow published orbits. Rocket launches are scheduled months ahead. What was missing was a single place that shows all of it together, in context, without a login wall or a subscription. So we made one, and kept it free.
          </p>

          <h3>What you can track</h3>
          <ul>
            <li><strong>Flights.</strong> Live aircraft positions, routes, altitude and speed from open ADS-B receivers worldwide.</li>
            <li><strong>The ISS and satellites.</strong> Live orbital positions, plus a 4K stream and crew manifest for the space station.</li>
            <li><strong>Ships.</strong> Maritime vessels reporting over AIS, on the same globe as the planes above them.</li>
            <li><strong>Rocket launches.</strong> Countdowns, pad locations and mission details, with a reminder before liftoff.</li>
            <li><strong>Near-Earth asteroids.</strong> Close approaches from NASA data, to scale.</li>
            <li><strong>Deep space.</strong> Keep zooming out: the Moon, the solar system, and hundreds of thousands of real galaxies.</li>
          </ul>

          <h3>How it works</h3>
          <p>
            The globe is real 3D rendered in your browser with Three.js and WebGL, not a map image. A Go backend aggregates the live feeds and streams only what your current view needs over a single WebSocket, so it stays fast on a phone. The whole thing runs on free infrastructure, which is part of how we keep it free for you.
          </p>

          <h3>Built in the open</h3>
          <p>
            We write about the engineering as we go, one hard problem at a time, on the <a href="/engineering">Engineering Blog</a>. How you render tens of thousands of aircraft at 60 frames per second, how you make a moving dot clickable, how you tell the whole sky to every visitor without melting a small server. If you are curious what is under the hood, start there.
          </p>

          <h3>No login, no ads, no tracking of you</h3>
          <p>
            You never have to sign in to use anything here. Signing in only adds saved flights and launches across your devices. We track objects in the sky, not people on the ground.
          </p>
        </div>
      </div>
    </div>
  )
}
