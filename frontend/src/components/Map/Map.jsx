import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import styles from './Map.module.css'
import { AircraftLayer } from './AircraftLayer'

// CartoDB tile URLs — minimalistic, no API key required
const TILE_URLS = {
  light: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
  dark:  'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
}
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'

export default function Map({ aircraft, selectedIcao24, onAircraftClick, onBoundsChange, theme = 'light' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const tileRef = useRef(null)
  const aircraftLayerRef = useRef(null)

  // Initialize Leaflet map once
  useEffect(() => {
    if (mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
    })
    mapRef.current = map

    // Minimal attribution in bottom-right
    L.control.attribution({ position: 'bottomright', prefix: false })
      .addTo(map)

    // Load tile layer
    const tileUrl = TILE_URLS[theme] ?? TILE_URLS.light
    tileRef.current = L.tileLayer(tileUrl, {
      attribution: TILE_ATTR,
      maxZoom: 18,
      subdomains: 'abcd',
    }).addTo(map)

    // Try to center on user's geolocation
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => map.setView([coords.latitude, coords.longitude], 8),
      () => {} // Silently fall back to world view
    )

    // Notify parent of initial bounds
    const reportBounds = () => {
      if (!onBoundsChange) return
      const b = map.getBounds()
      onBoundsChange({
        ne: { lat: b.getNorth(), lng: b.getEast() },
        sw: { lat: b.getSouth(), lng: b.getWest() },
      })
    }

    map.on('moveend', reportBounds)
    map.on('zoomend', reportBounds)
    reportBounds()

    // Create Canvas renderer for aircraft markers
    aircraftLayerRef.current = new AircraftLayer(map)

    return () => {
      aircraftLayerRef.current?.destroy()
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update tile layer when theme changes
  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return
    tileRef.current.setUrl(TILE_URLS[theme] ?? TILE_URLS.light)
  }, [theme])

  // Update aircraft layer whenever aircraft map changes
  useEffect(() => {
    if (!aircraftLayerRef.current) return
    aircraftLayerRef.current.update(aircraft, selectedIcao24, onAircraftClick)
  }, [aircraft, selectedIcao24, onAircraftClick])

  return <div ref={containerRef} className={styles.map} />
}
