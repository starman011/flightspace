/**
 * AircraftLayer — Canvas-based aircraft marker renderer for Leaflet.
 * Uses a single <canvas> overlay to draw all aircraft glyphs at 60fps.
 */

const STALE_FADE_START = 60_000  // ms — begin fading at 60s
const STALE_REMOVE     = 120_000 // ms — hide at 120s (backend already removes by then)
const DOT_COLOR        = '#1A1A1A'
const DOT_HOVER        = '#8B0000'
const DOT_GROUND       = '#666666'
const HELI_COLOR       = '#4A3728'

export class AircraftLayer {
  constructor(map) {
    this.map = map
    this.aircraft = new Map()
    this.selectedId = null
    this.onClick = null
    this.prevPositions = new Map() // for interpolation: { lat, lon, ts }
    this.animFrame = null
    this.lastRender = 0

    // Create canvas overlay
    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:400'
    map.getContainer().appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')

    // Click detection layer (transparent div on top)
    this.hitCanvas = document.createElement('canvas')
    this.hitCanvas.style.cssText = 'position:absolute;top:0;left:0;z-index:401;cursor:crosshair'
    this.hitCanvas.style.opacity = '0'
    map.getContainer().appendChild(this.hitCanvas)
    this.hitCanvas.addEventListener('click', this._handleClick.bind(this))

    // Resize on map events
    this._onResize = this._resize.bind(this)
    map.on('resize', this._onResize)
    map.on('movestart', () => this._scheduleRender())
    map.on('move', () => this._scheduleRender())
    map.on('moveend', () => this._scheduleRender())
    map.on('zoomend', () => this._scheduleRender())

    this._resize()
    this._scheduleRender()
  }

  update(aircraftMap, selectedId, onClick) {
    this.aircraft = aircraftMap
    this.selectedId = selectedId
    this.onClick = onClick
    this._scheduleRender()
  }

  destroy() {
    cancelAnimationFrame(this.animFrame)
    this.map.off('resize', this._onResize)
    this.canvas.remove()
    this.hitCanvas.remove()
  }

  _resize() {
    const container = this.map.getContainer()
    const w = container.clientWidth
    const h = container.clientHeight
    const dpr = window.devicePixelRatio || 1
    for (const c of [this.canvas, this.hitCanvas]) {
      c.width = w * dpr
      c.height = h * dpr
      c.style.width = w + 'px'
      c.style.height = h + 'px'
    }
    this.ctx.scale(dpr, dpr)
    this._scheduleRender()
  }

  _scheduleRender() {
    if (this.animFrame) return
    this.animFrame = requestAnimationFrame(() => {
      this.animFrame = null
      this._render()
    })
  }

  _render() {
    const ctx = this.ctx
    const map = this.map
    const now = Date.now()
    const zoom = map.getZoom()
    const dotSize = this._dotSize(zoom)

    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    ctx.clearRect(0, 0, w, h)

    // Build hit list for click detection
    this._hitList = []

    for (const [id, a] of this.aircraft) {
      const age = now - (a.receivedAt || now)
      if (age > STALE_REMOVE) continue

      const alpha = age < STALE_FADE_START
        ? 1.0
        : 1.0 - ((age - STALE_FADE_START) / (STALE_REMOVE - STALE_FADE_START)) * 0.7

      const pt = map.latLngToContainerPoint([a.lat, a.lon])
      const x = pt.x
      const y = pt.y

      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue

      const isSelected = id === this.selectedId
      const isHeli = a.cat === 'helicopter'
      const isGround = a.grnd

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(x, y)

      if (isGround) {
        this._drawGroundDot(ctx, dotSize, isSelected)
      } else if (isHeli) {
        this._drawHelicopter(ctx, dotSize, a.hdg, isSelected)
      } else {
        this._drawPlane(ctx, dotSize, a.hdg, isSelected)
      }

      ctx.restore()

      // Store hit region
      this._hitList.push({ id, x, y, r: dotSize + 4 })
    }
  }

  _drawPlane(ctx, size, hdg, selected) {
    const color = selected ? DOT_HOVER : DOT_COLOR

    if (hdg != null) {
      ctx.rotate((hdg * Math.PI) / 180)
    }

    // Dotted trail behind the aircraft (extends backward from heading)
    const trailLen = size * 6
    ctx.save()
    ctx.setLineDash([size * 0.8, size * 0.6])
    ctx.beginPath()
    ctx.moveTo(0, size)
    ctx.lineTo(0, size + trailLen)
    ctx.strokeStyle = color
    ctx.lineWidth = size * 0.5
    ctx.globalAlpha *= 0.5
    ctx.stroke()
    ctx.restore()

    // Filled dot body
    ctx.beginPath()
    ctx.arc(0, 0, size, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    // Direction indicator — small forward notch
    const notchLen = size * 1.5
    ctx.beginPath()
    ctx.moveTo(0, -size)
    ctx.lineTo(0, -size - notchLen)
    ctx.strokeStyle = color
    ctx.lineWidth = size * 0.4
    ctx.stroke()
  }

  _drawHelicopter(ctx, size, hdg, selected) {
    const color = selected ? DOT_HOVER : HELI_COLOR
    const arm = size * 1.8

    if (hdg != null) {
      ctx.rotate((hdg * Math.PI) / 180)
    }

    // Dotted trail
    ctx.save()
    ctx.setLineDash([size * 0.8, size * 0.6])
    ctx.beginPath()
    ctx.moveTo(0, size)
    ctx.lineTo(0, size + arm * 3)
    ctx.strokeStyle = color
    ctx.lineWidth = size * 0.5
    ctx.globalAlpha *= 0.5
    ctx.stroke()
    ctx.restore()

    ctx.strokeStyle = color
    ctx.lineWidth = size * 0.4

    // Cross shape
    ctx.beginPath()
    ctx.moveTo(-arm, 0); ctx.lineTo(arm, 0)
    ctx.moveTo(0, -arm); ctx.lineTo(0, arm)
    ctx.stroke()

    // Center dot
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.7, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  _drawGroundDot(ctx, size, selected) {
    const color = selected ? DOT_HOVER : DOT_GROUND
    ctx.beginPath()
    ctx.arc(0, 0, size, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = size * 0.35
    ctx.stroke()
    // Inner dot
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  _dotSize(zoom) {
    // Large sizes for visual verification
    if (zoom <= 4) return 10
    if (zoom <= 7) return 14
    if (zoom <= 10) return 18
    return 22
  }

  _handleClick(e) {
    if (!this._hitList || !this.onClick) return
    const rect = this.hitCanvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    let closest = null
    let closestDist = Infinity

    for (const hit of this._hitList) {
      const dx = mx - hit.x
      const dy = my - hit.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= hit.r && dist < closestDist) {
        closest = hit
        closestDist = dist
      }
    }

    if (closest) {
      this.onClick(closest.id)
    }
  }
}
