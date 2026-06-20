const D = Math.PI / 180
const norm360 = (x) => ((x % 360) + 360) % 360
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5
}

// Greenwich Mean Sidereal Time, degrees [0,360)
export function gmstDeg(date) {
  const d = julianDate(date) - 2451545.0
  return norm360(280.46061837 + 360.98564736629 * d)
}

// Local Sidereal Time, degrees [0,360); lonDeg east-positive
export function lstDeg(date, lonDeg) {
  return norm360(gmstDeg(date) + lonDeg)
}

// Horizontal (alt deg, az deg from North clockwise) -> Equatorial (ra,dec deg)
export function altAzToRaDec(altDeg, azDeg, latDeg, lstDegVal) {
  const a = altDeg * D, A = azDeg * D, phi = latDeg * D
  const sinDec = Math.sin(a) * Math.sin(phi) + Math.cos(a) * Math.cos(phi) * Math.cos(A)
  const dec = Math.asin(clamp(sinDec, -1, 1))
  const y = -Math.cos(a) * Math.sin(A)
  const x = Math.sin(a) * Math.cos(phi) - Math.cos(a) * Math.sin(phi) * Math.cos(A)
  const Hdeg = Math.atan2(y, x) / D            // hour angle, degrees
  return { ra: norm360(lstDegVal - Hdeg), dec: dec / D }
}

// Equatorial (ra,dec deg) -> Horizontal (alt deg, az deg from North clockwise)
export function raDecToAltAz(raDeg, decDeg, latDeg, lstDegVal) {
  const H = (norm360(lstDegVal - raDeg)) * D    // hour angle
  const dec = decDeg * D, phi = latDeg * D
  const sinAlt = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(phi) * Math.cos(H)
  const alt = Math.asin(clamp(sinAlt, -1, 1))
  const y = -Math.sin(H) * Math.cos(dec)
  const x = Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(H)
  let az = Math.atan2(y, x) / D
  return { alt: alt / D, az: norm360(az) }
}

// Unit vector (East, North, Up) for an equatorial (ra,dec) at this site/time.
function raDecToENU(raDeg, decDeg, latDeg, lstDegVal) {
  const { alt, az } = raDecToAltAz(raDeg, decDeg, latDeg, lstDegVal)
  const a = alt * D, A = az * D
  return { e: Math.cos(a) * Math.sin(A), n: Math.cos(a) * Math.cos(A), u: Math.sin(a) }
}

// Returns the ENU directions of key equatorial reference points, enough for the
// renderer to construct a rotation aligning the equatorial group to the local
// horizontal (ENU) world the device orientation drives.
export function equatorialBasisInHorizontal(latDeg, lstDegVal) {
  return {
    poleDir:   raDecToENU(0, 90, latDeg, lstDegVal),                      // North Celestial Pole
    originDir: raDecToENU(lstDegVal, 0, latDeg, lstDegVal),               // RA=LST, Dec=0
    eastDir:   raDecToENU(((lstDegVal - 90) % 360 + 360) % 360, 0, latDeg, lstDegVal),
  }
}
