/**
 * Cosmic Web Mesh — Voronoi-like filament structure connecting galaxies/quasars.
 *
 * Builds a KNN graph (k nearest neighbors) to create mesh edges resembling
 * the cosmic large-scale structure. Deferred to avoid blocking main thread.
 */

import {
  Object3D, BufferGeometry, Float32BufferAttribute,
  ShaderMaterial, AdditiveBlending, LineSegments,
} from 'three'
import KDBush from 'kdbush'

// ── Config ────────────────────────────────────────────────────────────────────
const K_NEIGHBORS  = 3      // edges per node
const MAX_EDGE_LEN = 35     // world units — tight to prevent long cross-sky lines
const EDGE_OPACITY = 0.30
const SUBSAMPLE    = 8      // every Nth galaxy — keeps node count ~12K

// ── Shaders ───────────────────────────────────────────────────────────────────
const vertexShader = `
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vFog;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFog = smoothstep(450.0, 60.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = `
  varying vec3 vColor;
  varying float vFog;
  uniform float uOpacity;
  void main() {
    float alpha = uOpacity * vFog;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCosmicWebMesh() {
  const group = new Object3D()
  group.visible = false

  let mesh = null
  let buildTimer = null

  // positions: Float32Array (n*3)
  function build(positions, totalCount) {
    // Defer to next frame so galaxy points render first
    if (buildTimer) clearTimeout(buildTimer)
    buildTimer = setTimeout(() => _doBuild(positions, totalCount), 100)
  }

  function _doBuild(positions, totalCount) {
    if (mesh) {
      group.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh = null
    }

    const nodeCount = Math.floor(totalCount / SUBSAMPLE)
    if (nodeCount < 10) return

    // Extract subsampled positions
    const px = new Float32Array(nodeCount)
    const py = new Float32Array(nodeCount)
    const pz = new Float32Array(nodeCount)

    for (let i = 0; i < nodeCount; i++) {
      const si = i * SUBSAMPLE
      px[i] = positions[si * 3]
      py[i] = positions[si * 3 + 1]
      pz[i] = positions[si * 3 + 2]
    }

    // 2D spatial index on (x, z) plane
    const index = new KDBush(nodeCount)
    for (let i = 0; i < nodeCount; i++) index.add(px[i], pz[i])
    index.finish()

    // KNN edges with deduplication
    const edgeSet = new Set()
    const edges = []

    for (let i = 0; i < nodeCount; i++) {
      const ax = px[i], ay = py[i], az = pz[i]
      const neighbors = index.within(ax, az, MAX_EDGE_LEN)

      // Quick 3D distance sort — only keep closest few to avoid sorting huge arrays
      let best = []
      for (let n = 0; n < neighbors.length; n++) {
        const ni = neighbors[n]
        if (ni === i) continue
        const dx = px[ni] - ax
        const dy = py[ni] - ay
        const dz = pz[ni] - az
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > MAX_EDGE_LEN * MAX_EDGE_LEN) continue

        // Insert into small sorted array (max K_NEIGHBORS)
        const d = Math.sqrt(d2)
        if (best.length < K_NEIGHBORS) {
          best.push({ idx: ni, d })
          best.sort((a, b) => a.d - b.d)
        } else if (d < best[best.length - 1].d) {
          best[best.length - 1] = { idx: ni, d }
          best.sort((a, b) => a.d - b.d)
        }
      }

      for (const { idx: ni, d } of best) {
        const lo = Math.min(i, ni)
        const hi = Math.max(i, ni)
        const key = `${lo}_${hi}`
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          edges.push([i, ni, d])
        }
      }
    }

    if (edges.length === 0) return

    const edgeCount = edges.length
    const linePos = new Float32Array(edgeCount * 6)
    const lineCol = new Float32Array(edgeCount * 6)

    // Distance range for color mapping
    let minD = Infinity, maxD = 0
    for (let e = 0; e < edgeCount; e++) {
      const d = edges[e][2]
      if (d < minD) minD = d
      if (d > maxD) maxD = d
    }
    const dRange = maxD - minD || 1

    for (let e = 0; e < edgeCount; e++) {
      const [i, j, d] = edges[e]
      const off = e * 6

      linePos[off]     = px[i]; linePos[off + 1] = py[i]; linePos[off + 2] = pz[i]
      linePos[off + 3] = px[j]; linePos[off + 4] = py[j]; linePos[off + 5] = pz[j]

      // Short edge = bright white-blue, long edge = deep blue
      const t = (d - minD) / dRange
      const r = 0.75 - t * 0.70
      const g = 0.85 - t * 0.75
      const b = 1.0  - t * 0.55

      lineCol[off] = r; lineCol[off + 1] = g; lineCol[off + 2] = b
      lineCol[off + 3] = r; lineCol[off + 4] = g; lineCol[off + 5] = b
    }

    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(linePos, 3))
    geom.setAttribute('aColor',   new Float32BufferAttribute(lineCol, 3))

    const mat = new ShaderMaterial({
      uniforms: { uOpacity: { value: EDGE_OPACITY } },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    mesh = new LineSegments(geom, mat)
    mesh.renderOrder = 9
    group.add(mesh)

    console.log(`CosmicWeb: ${edgeCount.toLocaleString()} edges from ${nodeCount.toLocaleString()} nodes`)
  }

  function show() { group.visible = true }
  function hide() { group.visible = false }

  function dispose() {
    if (buildTimer) clearTimeout(buildTimer)
    if (mesh) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }

  return { group, build, show, hide, dispose }
}
