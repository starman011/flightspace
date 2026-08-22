import { useEffect, useRef, useCallback } from 'react'
import styles from './GalaxyConeView.module.css'
import {
  Scene, PerspectiveCamera, WebGLRenderer, Points, BufferGeometry,
  Float32BufferAttribute, ShaderMaterial, AdditiveBlending, Color,
  LineSegments, LineBasicMaterial, SphereGeometry, MeshBasicMaterial,
  Mesh, Sprite, SpriteMaterial, CanvasTexture,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { API_BASE } from '../../lib/apiBase.js'

const API = API_BASE

// ── Distance mapping (mirrors DESILayer) ─────────────────────────────────────
const SKY_R   = 480
const DESI_MAX = SKY_R * 0.80
const DESI_MIN = 12
const Z_CEIL   = 3.5

function zToRadius(z) {
  const t = Math.log1p(z * 6) / Math.log1p(Z_CEIL * 6)
  return DESI_MIN + (DESI_MAX - DESI_MIN) * t
}

function raDecToXYZ(raDeg, decDeg, radius) {
  const ra  = raDeg  * Math.PI / 180
  const dec = decDeg * Math.PI / 180
  return [
    radius * Math.cos(dec) * Math.cos(ra),
    radius * Math.sin(dec),
   -radius * Math.cos(dec) * Math.sin(ra),
  ]
}

// ── Cosmological distance ────────────────────────────────────────────────────
const C_KMS = 299792.458
const H0 = 67.4
const OM = 0.315
const OL = 0.685
const MPC_LY = 3261600

function comovingDistLY(z) {
  const n = 100, dz = z / n
  let sum = 0
  for (let i = 0; i < n; i++) {
    const zi = (i + 0.5) * dz
    sum += dz / Math.sqrt(OM * (1 + zi) ** 3 + OL)
  }
  return (C_KMS / H0) * sum * MPC_LY
}

// ── Color: distance gradient (cyan → blue → indigo → purple → magenta) ──────
function distColor(z) {
  const c = new Color()
  const t = Math.min(z / 2.5, 1.0)
  const hue = 0.52 + t * 0.35
  const sat = 0.80
  const lum = 0.55 - t * 0.10
  c.setHSL(hue, sat, lum)
  return c
}

// ── Label sprite ─────────────────────────────────────────────────────────────
function makeLabel(text, color) {
  const cv = document.createElement('canvas')
  cv.width = 256; cv.height = 64
  const ctx = cv.getContext('2d')
  ctx.font = 'bold 22px monospace'
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 32)
  const tex = new CanvasTexture(cv)
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const sp = new Sprite(mat)
  sp.scale.set(24, 6, 1)
  return sp
}

export default function GalaxyConeView({ expanded, onToggle }) {
  const containerRef = useRef(null)
  const stateRef     = useRef(null)

  // Setup Three.js scene once
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const scene    = new Scene()
    const camera   = new PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 1200)
    camera.position.set(0, 250, 450)

    const renderer = new WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setClearColor(0x030508, 1)
    el.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping  = true
    controls.dampingFactor  = 0.12
    controls.minDistance    = 20
    controls.maxDistance    = 800
    controls.autoRotate     = true
    controls.autoRotateSpeed = 0.4

    // ── Earth marker at origin ───────────────────────────────────────────
    const earthGeo = new SphereGeometry(2, 16, 16)
    const earthMat = new MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.8 })
    const earth = new Mesh(earthGeo, earthMat)
    scene.add(earth)

    const earthLabel = makeLabel('EARTH', '#66bbff')
    earthLabel.position.set(0, 8, 0)
    scene.add(earthLabel)

    // ── Distance shells ──────────────────────────────────────────────────
    const shells = [
      { z: 0.076, label: '1 Bly', color: '#44ccff' },
      { z: 0.42,  label: '5 Bly', color: '#7788ff' },
      { z: 1.0,   label: '10 Bly', color: '#aa66ff' },
    ]
    for (const sh of shells) {
      const r = zToRadius(sh.z)
      const segs = 96
      const pts = []
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2
        pts.push(Math.cos(a) * r, 0, Math.sin(a) * r)
      }
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
      const line = new LineSegments(geo, new LineBasicMaterial({
        color: new Color(sh.color), transparent: true, opacity: 0.25,
      }))
      scene.add(line)

      const lbl = makeLabel(sh.label, sh.color)
      lbl.position.set(r + 8, 4, 0)
      lbl.scale.set(16, 4, 1)
      scene.add(lbl)
    }

    // ── Load galaxies ────────────────────────────────────────────────────
    async function loadData() {
      let data
      try {
        const res = await fetch('/desi-galaxies.json')
        if (res.ok) data = await res.json()
      } catch { /* fallback to API */ }
      if (!data) {
        try {
          const res = await fetch(`${API}/api/v1/desi/galaxies`)
          if (res.ok) data = await res.json()
        } catch { return }
      }
      if (!data || data.length === 0) return

      const n = data.length
      const positions = new Float32Array(n * 3)
      const colors    = new Float32Array(n * 3)
      const sizes     = new Float32Array(n)

      for (let i = 0; i < n; i++) {
        const g = data[i]
        const radius = zToRadius(g.z)
        const [x, y, z] = raDecToXYZ(g.r, g.d, radius)
        positions[i * 3]     = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z

        const col = distColor(g.z)
        colors[i * 3]     = col.r
        colors[i * 3 + 1] = col.g
        colors[i * 3 + 2] = col.b

        sizes[i] = g.s === 'QSO' ? 3.5 : 2.0
      }

      const geom = new BufferGeometry()
      geom.setAttribute('position', new Float32BufferAttribute(positions, 3))
      geom.setAttribute('color',    new Float32BufferAttribute(colors, 3))
      geom.setAttribute('aSize',    new Float32BufferAttribute(sizes, 1))

      const mat = new ShaderMaterial({
        vertexShader: `
          attribute float aSize;
          varying vec3 vColor;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * (200.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float alpha = smoothstep(1.0, 0.3, d) * 0.85;
            gl_FragColor = vec4(vColor, alpha);
          }
        `,
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      })

      const cloud = new Points(geom, mat)
      scene.add(cloud)
    }
    loadData()

    // ── Animation loop ───────────────────────────────────────────────────
    let raf
    function tick() {
      raf = requestAnimationFrame(tick)
      controls.update()
      renderer.render(scene, camera)
    }
    tick()

    stateRef.current = { renderer, camera, controls, scene, el }

    return () => {
      cancelAnimationFrame(raf)
      controls.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose()
          obj.material.dispose()
        }
      })
    }
  }, [])

  // Resize on expand/collapse
  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    // Wait for CSS transition to complete
    const timer = setTimeout(() => {
      const { renderer, camera, el } = st
      const w = el.clientWidth, h = el.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }, expanded ? 500 : 100)
    return () => clearTimeout(timer)
  }, [expanded])

  const handleClick = useCallback((e) => {
    // Don't toggle when user is dragging (OrbitControls)
    if (e.target.tagName === 'CANVAS' && !expanded) {
      onToggle?.()
    }
  }, [expanded, onToggle])

  return (
    <div
      ref={containerRef}
      className={`${styles.wrapper} ${expanded ? styles.expanded : styles.mini}`}
      onClick={handleClick}
    >
      <span className={styles.badge}>{expanded ? '3D VOLUME' : '3D'}</span>
      {expanded && (
        <button className={styles.closeBtn} onClick={(e) => { e.stopPropagation(); onToggle?.() }}>
          ✕
        </button>
      )}
      <div className={styles.gradientBar} />
      <div className={styles.legend}>
        <span className={styles.legendNear}>Near</span>
        <span className={styles.legendFar}>Far</span>
      </div>
    </div>
  )
}
