/**
 * SkyDetailLayer
 * ─────────────────────────────────────────────────────────────────────────────
 * Adaptive "deep zoom" for the night sky. When the user zooms into a region,
 * we fetch a real high-resolution image of exactly that field from the
 * hips2fits all-sky service (DSS2 colour) and map it onto the celestial sphere
 * in place — so zooming sharpens the actual sky instead of a popup card.
 *
 * Added as a child of the night-sky group, so it inherits the real-sky
 * alignment rotation automatically.
 */
import {
  Object3D, Mesh, PlaneGeometry, MeshBasicMaterial,
  TextureLoader, Vector3, Matrix4, DoubleSide, SRGBColorSpace,
} from 'three'

const SKY_R = 470   // just inside the night-sky dome (NightSkyScene SKY_R = 480)
const HIPS = 'https://alasky.cds.unistra.fr/hips-image-services/hips2fits'

function raDecToVec(raDeg, decDeg, r, out) {
  const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180
  return out.set(
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    -r * Math.cos(dec) * Math.sin(ra),
  )
}

export function createSkyDetailLayer() {
  const group = new Object3D()
  group.visible = false

  const loader = new TextureLoader()
  loader.setCrossOrigin('anonymous')

  let mesh = null
  let lastKey = ''
  let reqId = 0
  let loadingCb = null

  const _c = new Vector3(), _n = new Vector3(), _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _m = new Matrix4()

  // Fetch + place a high-res cutout of the field centred at (ra,dec) spanning fovDeg.
  function update(raDeg, decDeg, fovDeg) {
    const key = `${raDeg.toFixed(2)}_${decDeg.toFixed(2)}_${fovDeg.toFixed(2)}`
    if (key === lastKey) return
    lastKey = key
    const myReq = ++reqId
    if (loadingCb) loadingCb(true)

    const url = `${HIPS}?hips=CDS/P/DSS2/color&width=768&height=768&fov=${fovDeg.toFixed(3)}` +
                `&projection=TAN&coordsys=icrs&ra=${raDeg.toFixed(4)}&dec=${decDeg.toFixed(4)}&format=jpg`

    loader.load(url, (tex) => {
      if (myReq !== reqId) { tex.dispose(); return }   // a newer request superseded this
      tex.colorSpace = SRGBColorSpace
      if (loadingCb) loadingCb(false)

      // Orthonormal basis at the sky point: z faces the camera (origin),
      // y = celestial north, x = y × z (right). DoubleSide guards orientation.
      raDecToVec(raDeg, decDeg, 1, _c).normalize()
      raDecToVec(raDeg, decDeg + 0.5, 1, _n)
      _y.copy(_n).addScaledVector(_c, -_n.dot(_c)).normalize()   // north ⟂ center
      _z.copy(_c).multiplyScalar(-1)                              // face origin
      _x.crossVectors(_y, _z).normalize()
      _m.makeBasis(_x, _y, _z)

      const size = 2 * SKY_R * Math.tan((fovDeg * Math.PI / 180) / 2)
      if (!mesh) {
        mesh = new Mesh(
          new PlaneGeometry(1, 1),
          new MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: DoubleSide }),
        )
        mesh.renderOrder = 1   // above the dome, below labels (label renderOrder 3+)
        group.add(mesh)
      } else {
        mesh.material.map?.dispose()
        mesh.material.map = tex
        mesh.material.needsUpdate = true
      }
      mesh.scale.set(size, size, 1)
      mesh.quaternion.setFromRotationMatrix(_m)
      mesh.position.copy(_c).multiplyScalar(SKY_R)
      group.visible = true
    }, undefined, () => { if (loadingCb) loadingCb(false) /* keep dome on failure */ })
  }

  function clear() { group.visible = false; lastKey = ''; reqId++; if (loadingCb) loadingCb(false) }
  function onLoading(cb) { loadingCb = cb }
  function dispose() {
    if (mesh) { mesh.geometry.dispose(); mesh.material.map?.dispose(); mesh.material.dispose() }
  }

  return { group, update, clear, onLoading, dispose }
}
