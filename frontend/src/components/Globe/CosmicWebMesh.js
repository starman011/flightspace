/**
 * Cosmic Web Mesh — Voronoi-like filament structure connecting galaxies/quasars
 * in 3D space. KNN graph with glowing blue-white edges.
 */

import {
  Object3D, BufferGeometry, Float32BufferAttribute,
  ShaderMaterial, AdditiveBlending, LineSegments,
} from 'three'
import KDBush from 'kdbush'

const K_NEIGHBORS  = 3
const MAX_EDGE_LEN = 35
const EDGE_OPACITY = 0.28
const SUBSAMPLE    = 10

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

export function createCosmicWebMesh() {
  const group = new Object3D()
  group.visible = false
  let mesh = null
  let buildTimer = null

  function build(positions, totalCount) {
    if (buildTimer) clearTimeout(buildTimer)
    buildTimer = setTimeout(() => _doBuild(positions, totalCount), 150)
  }

  function _doBuild(positions, totalCount) {
    if (mesh) { group.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null }

    const nodeCount = Math.floor(totalCount / SUBSAMPLE)
    if (nodeCount < 10) return

    const px = new Float32Array(nodeCount)
    const py = new Float32Array(nodeCount)
    const pz = new Float32Array(nodeCount)
    for (let i = 0; i < nodeCount; i++) {
      const si = i * SUBSAMPLE
      px[i] = positions[si * 3]
      py[i] = positions[si * 3 + 1]
      pz[i] = positions[si * 3 + 2]
    }

    const index = new KDBush(nodeCount)
    for (let i = 0; i < nodeCount; i++) index.add(px[i], pz[i])
    index.finish()

    const edgeSet = new Set()
    const edges = []

    for (let i = 0; i < nodeCount; i++) {
      const ax = px[i], ay = py[i], az = pz[i]
      const neighbors = index.within(ax, az, MAX_EDGE_LEN)
      let best = []
      for (let n = 0; n < neighbors.length; n++) {
        const ni = neighbors[n]
        if (ni === i) continue
        const dx = px[ni] - ax, dy = py[ni] - ay, dz = pz[ni] - az
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 > MAX_EDGE_LEN * MAX_EDGE_LEN) continue
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
        const key = `${Math.min(i, ni)}_${Math.max(i, ni)}`
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([i, ni, d]) }
      }
    }

    if (edges.length === 0) return

    const ec = edges.length
    const linePos = new Float32Array(ec * 6)
    const lineCol = new Float32Array(ec * 6)

    let minD = Infinity, maxD = 0
    for (let e = 0; e < ec; e++) { const d = edges[e][2]; if (d < minD) minD = d; if (d > maxD) maxD = d }
    const dRange = maxD - minD || 1

    for (let e = 0; e < ec; e++) {
      const [i, j, d] = edges[e]
      const off = e * 6
      linePos[off] = px[i]; linePos[off+1] = py[i]; linePos[off+2] = pz[i]
      linePos[off+3] = px[j]; linePos[off+4] = py[j]; linePos[off+5] = pz[j]
      const t = (d - minD) / dRange
      const r = 0.75 - t * 0.70, g = 0.85 - t * 0.75, b = 1.0 - t * 0.55
      lineCol[off] = r; lineCol[off+1] = g; lineCol[off+2] = b
      lineCol[off+3] = r; lineCol[off+4] = g; lineCol[off+5] = b
    }

    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(linePos, 3))
    geom.setAttribute('aColor', new Float32BufferAttribute(lineCol, 3))

    mesh = new LineSegments(geom, new ShaderMaterial({
      uniforms: { uOpacity: { value: EDGE_OPACITY } },
      vertexShader, fragmentShader,
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    }))
    mesh.renderOrder = 9
    group.add(mesh)
    console.log(`CosmicWeb: ${ec.toLocaleString()} edges from ${nodeCount.toLocaleString()} nodes`)
  }

  function show() { group.visible = true }
  function hide() { group.visible = false }
  function dispose() {
    if (buildTimer) clearTimeout(buildTimer)
    if (mesh) { mesh.geometry.dispose(); mesh.material.dispose() }
  }

  return { group, build, show, hide, dispose }
}
