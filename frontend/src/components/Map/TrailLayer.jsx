import { useEffect, useRef } from 'react'
import L from 'leaflet'

/**
 * TrailLayer renders a flight trail polyline on the map.
 */
export function TrailLayer({ map, trail }) {
  const polylineRef = useRef(null)

  useEffect(() => {
    if (!map || !trail || trail.length < 2) {
      polylineRef.current?.remove()
      polylineRef.current = null
      return
    }

    const latlngs = trail.map((p) => [p.latitude, p.longitude])

    if (polylineRef.current) {
      polylineRef.current.setLatLngs(latlngs)
    } else {
      polylineRef.current = L.polyline(latlngs, {
        color: '#8B0000',
        weight: 1,
        opacity: 0.6,
        dashArray: '4 4',
      }).addTo(map)
    }

    return () => {
      polylineRef.current?.remove()
      polylineRef.current = null
    }
  }, [map, trail])

  return null
}
