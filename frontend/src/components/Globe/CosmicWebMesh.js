/**
 * Cosmic Web Mesh — Voronoi-like filament structure connecting galaxies/quasars.
 *
 * Builds a KNN graph (k nearest neighbors per galaxy) to create mesh edges
 * resembling the cosmic large-scale structure. Edges are rendered as glowing
 * line segments with a deep blue → white gradient based on local density.
 *
 * Uses kdbush for O(n log n) spatial indexing on 100K+ galaxy positions.
 */

import {
  Object3D, BufferGeometry, Float32BufferAttribute,
  ShaderMaterial, AdditiveBlending, LineSegments,
} from 'three'
import KDBush from 'kdbush'

// ── Config ────────────────────────────────────────────────────────────────────
const K_NEIGHBORS    = 4     // edges per galaxy (nearest neighbors)
const MAX_EDGE_LEN   = 60    // world units — skip edges longer than this (prevents long cross-sky lines)
const EDGE_OPACITY   = 0.35  // base opacity of filament edges
const SUBSAMPLE      = 3     // only use every Nth galaxy to keep mesh performant

// ── Shaders ───────────────────────────────────────────────────────────────────
// Vertex: pass per-vertex color + compute fog-like fade by distance
const vertexShader = `
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vFog;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Fog: fade edges that are far from camera
    vFog = smoothstep(400.0, 80.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

// Fragment: glow effect with distance fog
const fragmentShader = `
  varying vec3 vColor;
  varying float vFog;
  uniform float uOpacity;
  void main() {
    float alpha = uOpacity * vFog;
    if (alpha < 0.005) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCosmicWebMesh() {
  const group = new Object3D()
  group.visible = false

  let mesh = null

  // Build the filament mesh from galaxy position arrays
  // positions: Float32Array (n*3), n = number of galaxies
  function build(positions, totalCount) {
    if (mesh) {
      group.remove(mesh)
      mesh.geometry.dispose()
      mesh.material.dispose()
      mesh = null
    }

    // Subsample for performance — every Nth point
    const sampleCount = Math.floor(totalCount / SUBSAMPLE)
    if (sampleCount < 10) return

    const sx = new Float32Array(sampleCount)
    const sy = new Float32Array(sampleCount)
    const sz = new Float32Array(sampleCount)

    for (let i = 0; i < sampleCount; i++) {
      const si = i * SUBSAMPLE
      sx[i] = positions[si * 3]
      sy[i] = positions[si * 3 + 1]
      sz[i] = positions[si * 3 + 2]
    }

    // Build 2D spatial index on (x, z) plane — good enough for neighbor queries
    // since galaxies are distributed on a sphere surface projected into 3D.
    // For true 3D KNN we'd need octree, but kdbush 2D + y-distance check works well.
    const index = new KDBush(sampleCount)
    for (let i = 0; i < sampleCount; i++) {
      index.add(sx[i], sz[i])
    }
    index.finish()

    // Find KNN edges — deduplicate by storing edge as sorted pair
    const edgeSet = new Set()
    const edges = []  // pairs of [i, j]

    for (let i = 0; i < sampleCount; i++) {
      // Query neighbors in expanding radius until we have K
      const px = sx[i], py = sy[i], pz = sz[i]
      const searchR = MAX_EDGE_LEN
      const neighbors = index.within(px, pz, searchR)

      // Sort by actual 3D distance
      const dists = []
      for (const ni of neighbors) {
        if (ni === i) continue
        const dx = sx[ni] - px
        const dy = sy[ni] - py
        const dz = sz[ni] - pz
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < MAX_EDGE_LEN) dists.push({ idx: ni, d })
      }
      dists.sort((a, b) => a.d - b.d)

      // Take K nearest
      const k = Math.min(K_NEIGHBORS, dists.length)
      for (let j = 0; j < k; j++) {
        const ni = dists[j].idx
        const lo = Math.min(i, ni)
        const hi = Math.max(i, ni)
        const key = lo * sampleCount + hi
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          edges.push([i, ni, dists[j].d])
        }
      }
    }

    if (edges.length === 0) return

    // Build line segment geometry — 2 vertices per edge
    const edgeCount = edges.length
    const linePos = new Float32Array(edgeCount * 6)   // 2 verts * 3 components
    const lineCol = new Float32Array(edgeCount * 6)

    // Color mapping: short edges (dense regions) → white/bright cyan
    //                long edges (sparse filaments) → deep blue/dark
    // Find distance range for normalization
    let minD = Infinity, maxD = 0
    for (const [, , d] of edges) {
      if (d < minD) minD = d
      if (d > maxD) maxD = d
    }
    const dRange = maxD - minD || 1

    for (let e = 0; e < edgeCount; e++) {
      const [i, j, d] = edges[e]
      const off = e * 6

      // Positions
      linePos[off]     = sx[i]
      linePos[off + 1] = sy[i]
      linePos[off + 2] = sz[i]
      linePos[off + 3] = sx[j]
      linePos[off + 4] = sy[j]
      linePos[off + 5] = sz[j]

      // Color: short edge = bright white-cyan, long edge = deep blue
      const t = (d - minD) / dRange  // 0 = short (dense), 1 = long (sparse)

      // Deep blue → cyan → white gradient
      // Short (t≈0): rgb(0.85, 0.95, 1.0)  — bright white-cyan
      // Long  (t≈1): rgb(0.02, 0.08, 0.35) — deep dark blue
      const r1 = 0.85 - t * 0.83
      const g1 = 0.95 - t * 0.87
      const b1 = 1.0  - t * 0.65

      // Both endpoints same color
      lineCol[off]     = r1
      lineCol[off + 1] = g1
      lineCol[off + 2] = b1
      lineCol[off + 3] = r1
      lineCol[off + 4] = g1
      lineCol[off + 5] = b1
    }

    const geom = new BufferGeometry()
    geom.setAttribute('position', new Float32BufferAttribute(linePos, 3))
    geom.setAttribute('aColor',   new Float32BufferAttribute(lineCol, 3))

    const mat = new ShaderMaterial({
      uniforms: {
        uOpacity: { value: EDGE_OPACITY },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })

    mesh = new LineSegments(geom, mat)
    mesh.renderOrder = 9  // behind galaxy points (renderOrder 10)
    group.add(mesh)

    console.log(`CosmicWeb: ${edgeCount.toLocaleString()} filament edges from ${sampleCount.toLocaleString()} nodes`)
  }

  function show() { group.visible = true }
  function hide() { group.visible = false }

  function dispose() {
    if (mesh) {
      mesh.geometry.dispose()
      mesh.material.dispose()
    }
  }

  return { group, build, show, hide, dispose }
}
