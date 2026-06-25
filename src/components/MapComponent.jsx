import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix leaflet default icon paths in vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const SYDNEY_CBD = [-33.8688, 151.2093]
const ZOOM = 15

const MapComponent = forwardRef(function MapComponent({ features, onStreetClick }, ref) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const geoLayerRef = useRef(null)
  const userMarkerRef = useRef(null)
  const nearestLayerRef = useRef(null)

  useImperativeHandle(ref, () => ({
    flyTo: (latlng, zoom = 17) => {
      mapRef.current?.flyTo(latlng, zoom, { duration: 1.2 })
    },
    showUserLocation: (lat, lng) => {
      const map = mapRef.current
      if (!map) return
      if (userMarkerRef.current) userMarkerRef.current.remove()

      // Pulsing user dot
      const icon = L.divIcon({
        html: `
          <div style="
            width:18px;height:18px;border-radius:50%;
            background:#4fc3f7;
            border:3px solid #fff;
            box-shadow:0 0 0 6px rgba(79,195,247,0.25);
            position:relative;
          ">
            <div style="
              position:absolute;inset:-8px;border-radius:50%;
              background:rgba(79,195,247,0.15);
              animation:pulse 1.8s ease-out infinite;
            "></div>
          </div>`,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      })
      userMarkerRef.current = L.marker([lat, lng], { icon }).addTo(map)
      map.flyTo([lat, lng], 15, { duration: 1.4 })
    },
    highlightNearest: (nearestFeatures) => {
      const map = mapRef.current
      if (!map) return
      if (nearestLayerRef.current) nearestLayerRef.current.remove()

      nearestLayerRef.current = L.geoJSON(
        { type: 'FeatureCollection', features: nearestFeatures },
        {
          style: {
            color: '#69ff47',
            weight: 8,
            opacity: 1,
          }
        }
      ).addTo(map)
    },
    clearNearest: () => {
      nearestLayerRef.current?.remove()
      nearestLayerRef.current = null
    }
  }))

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    // Add pulse animation
    const style = document.createElement('style')
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); opacity: 1; }
        100% { transform: scale(2.5); opacity: 0; }
      }
    `
    document.head.appendChild(style)

    const map = L.map(containerRef.current, {
      center: SYDNEY_CBD,
      zoom: ZOOM,
      zoomControl: false,
      attributionControl: true,
    })

    mapRef.current = map

    // Dark tile layer — CartoDB Dark Matter
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }
    ).addTo(map)

    // Zoom control — bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Render GeoJSON features whenever they change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !features) return

    if (geoLayerRef.current) {
      geoLayerRef.current.remove()
    }

    geoLayerRef.current = L.geoJSON(
      { type: 'FeatureCollection', features },
      {
        style: (feature) => {
          const verified = feature.properties.status === 'verified'
          return {
            color: verified ? '#00E676' : '#FFB300',
            weight: 5,
            opacity: 0.85,
            dashArray: verified ? null : '8, 6',
            lineCap: 'round',
            lineJoin: 'round',
          }
        },
        onEachFeature: (feature, layer) => {
          layer.on('click', (e) => {
            L.DomEvent.stopPropagation(e)
            onStreetClick?.(feature)
          })

          // Hover glow
          layer.on('mouseover', () => {
            const verified = feature.properties.status === 'verified'
            layer.setStyle({
              weight: 8,
              opacity: 1,
              color: verified ? '#69ff47' : '#ffd740',
            })
          })
          layer.on('mouseout', () => {
            geoLayerRef.current?.resetStyle(layer)
          })
        }
      }
    ).addTo(map)
  }, [features, onStreetClick])

  // Click on map background = dismiss sheet
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.on('click', () => onStreetClick?.(null))
  }, [onStreetClick])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 0,
      }}
    />
  )
})

export default MapComponent
