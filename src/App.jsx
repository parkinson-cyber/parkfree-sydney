import React, { useState, useRef, useCallback } from 'react'
import Header from './components/Header'
import MapComponent from './components/MapComponent'
import BottomSheet from './components/BottomSheet'
import SearchBar from './components/SearchBar'
import ParkNearMeButton from './components/ParkNearMeButton'
import NearestPanel from './components/NearestPanel'

const PARKING_FEATURES = [
  // ── PYRMONT ──────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2055,-33.8745],[151.2055,-33.8730],[151.2055,-33.8715]] },
    properties: { streetName: 'Pyrmont Bridge Road', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Western kerb unrestricted. No clearway. No time limit. Check southern end near Harris St intersection.', lastVerified: '2026-06-01', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1985,-33.8720],[151.1998,-33.8720],[151.2010,-33.8720]] },
    properties: { streetName: 'Allen Street', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Both kerbs unrestricted between Pyrmont St and Miller St. Residential pocket. No meters.', lastVerified: '2026-06-01', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2005,-33.8700],[151.2005,-33.8688],[151.2005,-33.8675]] },
    properties: { streetName: 'Saunders Street', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Eastern kerb unrestricted. Western kerb has permit zone Mon–Fri 8am–6pm. Both kerbs free evenings and weekends.', lastVerified: '2026-06-01', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1968,-33.8695],[151.1975,-33.8695],[151.1983,-33.8695]] },
    properties: { streetName: 'Bulwara Road', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Northern end only. Eastern kerb unrestricted on the block between Union St and Fig St. No meters here.', lastVerified: '2026-05-28', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1978,-33.8708],[151.1978,-33.8698],[151.1978,-33.8688]] },
    properties: { streetName: 'Harris Street', suburb: 'Pyrmont', council: 'City of Sydney', notes: 'Residential section north of Union St. Both kerbs free after 6pm weekdays and all weekend. Meters operate 8:30am–6pm Mon–Sat.', lastVerified: '2026-05-28', status: 'verified', confidence: 'high' }
  },

  // ── WOOLLOOMOOLOO ─────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2125,-33.8635],[151.2130,-33.8640],[151.2135,-33.8645]] },
    properties: { streetName: 'Forbes Street', suburb: 'Woolloomooloo', council: 'City of Sydney', notes: 'North end near Plunkett St. Eastern kerb unrestricted. No meters. Narrow street — no clearway.', lastVerified: '2026-05-20', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2055,-33.8605],[151.2058,-33.8598],[151.2060,-33.8590]] },
    properties: { streetName: 'McElhone Street', suburb: 'Woolloomooloo', council: 'City of Sydney', notes: 'Steep residential street. Both kerbs unrestricted. Watch driveways. Free 24/7.', lastVerified: '2026-06-10', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2092,-33.8618],[151.2098,-33.8618],[151.2105,-33.8618]] },
    properties: { streetName: 'Bourke Street', suburb: 'Woolloomooloo', council: 'City of Sydney', notes: 'Between Plunkett St and Cathedral St. Southern kerb unrestricted on weekends. Clearway Mon–Fri 7–9am and 4–7pm.', lastVerified: '2026-05-15', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2110,-33.8625],[151.2110,-33.8615],[151.2110,-33.8605]] },
    properties: { streetName: 'Plunkett Street', suburb: 'Woolloomooloo', council: 'City of Sydney', notes: 'Quiet residential block. Both kerbs free. No meters, no clearway. Great walk to the Domain.', lastVerified: '2026-06-05', status: 'verified', confidence: 'high' }
  },

  // ── MILSONS POINT / MCMAHONS POINT ───────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2065,-33.8400],[151.2068,-33.8410],[151.2070,-33.8420]] },
    properties: { streetName: 'Alfred Street South', suburb: 'Milsons Point', council: 'North Sydney Council', notes: 'Eastern kerb unrestricted between Broughton St and Blues Point Rd. No meters. Walk to Milsons Point station ~5 min.', lastVerified: '2026-05-15', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2072,-33.8378],[151.2080,-33.8375],[151.2090,-33.8372]] },
    properties: { streetName: 'Blues Point Road', suburb: 'McMahons Point', council: 'North Sydney Council', notes: 'Northern section near Blues Point Reserve. Eastern kerb unrestricted. Scenic harbour views. Free 24/7.', lastVerified: '2026-06-05', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2058,-33.8368],[151.2065,-33.8368],[151.2073,-33.8368]] },
    properties: { streetName: 'Bank Street', suburb: 'McMahons Point', council: 'North Sydney Council', notes: 'Quiet cross street. Both kerbs unrestricted. Residential. Walk to ferry wharf ~3 min.', lastVerified: '2026-06-05', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2080,-33.8358],[151.2085,-33.8352],[151.2090,-33.8345]] },
    properties: { streetName: 'Byrnes Avenue', suburb: 'McMahons Point', council: 'North Sydney Council', notes: 'Short cul-de-sac style block. Both sides free. Very low traffic. Free 24/7.', lastVerified: '2026-05-28', status: 'verified', confidence: 'high' }
  },

  // ── LAVENDER BAY / KIRRIBILLI ─────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2138,-33.8388],[151.2145,-33.8388],[151.2155,-33.8388]] },
    properties: { streetName: 'Holt Street', suburb: 'Lavender Bay', council: 'North Sydney Council', notes: 'Western stretch near Lavender St. Both kerbs unrestricted. Quiet residential. Free 24/7.', lastVerified: '2026-05-15', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2148,-33.8418],[151.2148,-33.8410],[151.2148,-33.8400]] },
    properties: { streetName: 'Carabatta Street', suburb: 'Kirribilli', council: 'North Sydney Council', notes: 'Short residential street. Both kerbs unrestricted. Tight turning at top. Free 24/7.', lastVerified: '2026-06-05', status: 'unverified', confidence: 'low' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2162,-33.8408],[151.2168,-33.8405],[151.2175,-33.8402]] },
    properties: { streetName: 'Holbrook Avenue', suburb: 'Kirribilli', council: 'North Sydney Council', notes: 'Residential strip. Eastern kerb unrestricted. Western kerb 2P permit zone Mon–Fri. Both sides free evenings and weekends.', lastVerified: '2026-05-20', status: 'verified', confidence: 'medium' }
  },

  // ── ULTIMO ────────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1990,-33.8788],[151.1998,-33.8788],[151.2005,-33.8788]] },
    properties: { streetName: 'Mountain Street', suburb: 'Ultimo', council: 'City of Sydney', notes: 'Between Bulwara Rd and Quarry St. Both kerbs free after 6pm weekdays and weekends. Meters 8:30am–6pm Mon–Sat.', lastVerified: '2026-06-08', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1975,-33.8800],[151.1975,-33.8790],[151.1975,-33.8780]] },
    properties: { streetName: 'Quarry Street', suburb: 'Ultimo', council: 'City of Sydney', notes: 'Quiet block next to Harold Park. Eastern kerb unrestricted. Free 24/7 on this block. Good for UTS access.', lastVerified: '2026-06-08', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2008,-33.8772],[151.2015,-33.8772],[151.2022,-33.8772]] },
    properties: { streetName: 'Fig Street', suburb: 'Ultimo', council: 'City of Sydney', notes: 'Between Jones St and Pyrmont Bridge Rd. Southern kerb unrestricted. No clearway on this block. Free 24/7.', lastVerified: '2026-05-30', status: 'verified', confidence: 'high' }
  },

  // ── GLEBE ─────────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1858,-33.8798],[151.1865,-33.8798],[151.1873,-33.8798]] },
    properties: { streetName: 'Toxteth Road', suburb: 'Glebe', council: 'City of Sydney', notes: 'Western end near Hereford St. Both kerbs unrestricted on this block. Outside permit zone boundary. Free 24/7.', lastVerified: '2026-06-02', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1840,-33.8815],[151.1840,-33.8805],[151.1840,-33.8795]] },
    properties: { streetName: 'Hereford Street', suburb: 'Glebe', council: 'City of Sydney', notes: 'Northern stretch. Both kerbs free. Residential. No permit zone on this block. Easy walk to Glebe Point Rd.', lastVerified: '2026-06-02', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1878,-33.8818],[151.1885,-33.8822],[151.1892,-33.8825]] },
    properties: { streetName: 'St Johns Road', suburb: 'Glebe', council: 'City of Sydney', notes: 'Near Broadway end. Eastern kerb unrestricted evenings and weekends. Meters 9am–8pm Mon–Sat. Completely free Sundays.', lastVerified: '2026-05-25', status: 'verified', confidence: 'medium' }
  },

  // ── SURRY HILLS ───────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2145,-33.8848],[151.2145,-33.8838],[151.2145,-33.8828]] },
    properties: { streetName: 'Fitzroy Street', suburb: 'Surry Hills', council: 'City of Sydney', notes: 'Between Foveaux St and Cleveland St. Eastern kerb unrestricted. Outside permit zone on this block. Free 24/7.', lastVerified: '2026-06-10', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2165,-33.8862],[151.2172,-33.8862],[151.2180,-33.8862]] },
    properties: { streetName: 'Gibbons Street', suburb: 'Surry Hills', council: 'City of Sydney', notes: 'Quiet block. Both kerbs unrestricted. No meters, no permit zone. Rare free pocket in Surry Hills. Free 24/7.', lastVerified: '2026-06-10', status: 'verified', confidence: 'high' }
  },

  // ── NORTH SYDNEY CBD ──────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2068,-33.8395],[151.2075,-33.8390],[151.2082,-33.8385]] },
    properties: { streetName: 'Napier Street', suburb: 'North Sydney', council: 'North Sydney Council', notes: 'Residential end near Berry St. Eastern kerb unrestricted evenings and weekends. 2P Mon–Fri 8am–6pm.', lastVerified: '2026-05-22', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2095,-33.8362],[151.2102,-33.8362],[151.2110,-33.8362]] },
    properties: { streetName: 'Ridge Street', suburb: 'North Sydney', council: 'North Sydney Council', notes: 'Between Walker St and Blue St. Southern kerb unrestricted. Good for North Sydney station overflow. Free 24/7 on this block.', lastVerified: '2026-05-22', status: 'unverified', confidence: 'low' }
  },

  // ── NEWTOWN ───────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1798,-33.8985],[151.1805,-33.8985],[151.1812,-33.8985]] },
    properties: { streetName: 'Brown Street', suburb: 'Newtown', council: 'Inner West Council', notes: 'Between King St and Erskineville Rd. Both kerbs free. Outside 2P zone. Residential. Free 24/7.', lastVerified: '2026-06-03', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1812,-33.8968],[151.1812,-33.8958],[151.1812,-33.8948]] },
    properties: { streetName: 'Georgina Street', suburb: 'Newtown', council: 'Inner West Council', notes: 'Quiet residential block near Camperdown border. Both sides unrestricted. No permit zone here. Free 24/7.', lastVerified: '2026-06-03', status: 'verified', confidence: 'medium' }
  },

  // ── REDFERN ───────────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2038,-33.8938],[151.2045,-33.8938],[151.2052,-33.8938]] },
    properties: { streetName: 'Louis Street', suburb: 'Redfern', council: 'City of Sydney', notes: 'Off Pitt St near Redfern station. Both kerbs unrestricted. Walk to Redfern station ~4 min. Free 24/7.', lastVerified: '2026-05-18', status: 'verified', confidence: 'high' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.2015,-33.8958],[151.2015,-33.8948],[151.2015,-33.8938]] },
    properties: { streetName: 'Caroline Street', suburb: 'Redfern', council: 'City of Sydney', notes: 'Between Regent St and Lawson St. Eastern kerb unrestricted. Good for South Eveleigh access. Free 24/7.', lastVerified: '2026-05-18', status: 'verified', confidence: 'medium' }
  },

  // ── CHIPPENDALE ───────────────────────────────────────────
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1985,-33.8882],[151.1992,-33.8882],[151.1999,-33.8882]] },
    properties: { streetName: 'Codrington Street', suburb: 'Chippendale', council: 'City of Sydney', notes: 'Between Abercrombie St and O\'Connor St. Southern kerb unrestricted. Outside permit zone boundary. Free 24/7.', lastVerified: '2026-06-12', status: 'verified', confidence: 'medium' }
  },
  {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [[151.1960,-33.8868],[151.1967,-33.8865],[151.1974,-33.8862]] },
    properties: { streetName: 'Balfour Street', suburb: 'Chippendale', council: 'City of Sydney', notes: 'Quiet block near Victoria Park. Both kerbs unrestricted. Good for Sydney Uni access. Free 24/7.', lastVerified: '2026-06-12', status: 'verified', confidence: 'high' }
  }
]

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getMidpoint(feature) {
  const coords = feature.geometry.coordinates
  const mid = coords[Math.floor(coords.length / 2)]
  return { lat: mid[1], lng: mid[0] }
}

export default function App() {
  const [selectedStreet, setSelectedStreet] = useState(null)
  const [nearestStreets, setNearestStreets] = useState([])
  const mapRef = useRef(null)
  const features = PARKING_FEATURES

  const handleStreetClick = useCallback((feature) => {
    setSelectedStreet(feature || null)
  }, [])

  const handleSheetClose = useCallback(() => {
    setSelectedStreet(null)
  }, [])

  const handleSearchResult = useCallback((feature) => {
    setSelectedStreet(feature)
    const mid = getMidpoint(feature)
    mapRef.current?.flyTo([mid.lat, mid.lng], 17)
  }, [])

  const handleSearchClear = useCallback(() => {
    setSelectedStreet(null)
    mapRef.current?.clearNearest()
    setNearestStreets([])
  }, [])

  const handleParkNearMe = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        alert('Location is not supported on this browser.')
        reject(); return
      }
      const timeout = setTimeout(() => {
        reject(new Error('Location timeout'))
        alert('Location took too long. Please try again.')
      }, 10000)

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeout)
          const { latitude: userLat, longitude: userLng } = pos.coords
          const sydneyBounds = { north: -33.5, south: -34.2, east: 151.4, west: 150.9 }
          if (userLat < sydneyBounds.south || userLat > sydneyBounds.north ||
              userLng < sydneyBounds.west || userLng > sydneyBounds.east) {
            alert('ParkFree Sydney covers the Sydney metropolitan area only.')
            resolve(); return
          }
          const withDistances = features
            .filter(f => f.properties.status === 'verified')
            .map(f => {
              const mid = getMidpoint(f)
              return { feature: f, distanceM: haversine(userLat, userLng, mid.lat, mid.lng) }
            })
            .sort((a, b) => a.distanceM - b.distanceM)
            .slice(0, 3)
          mapRef.current?.showUserLocation(userLat, userLng)
          mapRef.current?.highlightNearest(withDistances.map(d => d.feature))
          setNearestStreets(withDistances)
          resolve()
        },
        (err) => {
          clearTimeout(timeout)
          if (err.code === err.PERMISSION_DENIED) {
            alert('Location access was denied. Enable location in your browser settings and try again.')
          } else {
            alert('Could not get your location. Please try again.')
          }
          reject(err)
        },
        { timeout: 9000, enableHighAccuracy: true }
      )
    })
  }, [features])

  const handleNearestSelect = useCallback((feature) => {
    setSelectedStreet(feature)
    const mid = getMidpoint(feature)
    mapRef.current?.flyTo([mid.lat, mid.lng], 17)
  }, [])

  const handleNearestClose = useCallback(() => {
    setNearestStreets([])
    mapRef.current?.clearNearest()
  }, [])

  const verifiedCount = features.filter(f => f.properties.status === 'verified').length

  return (
    <>
      <MapComponent ref={mapRef} features={features} onStreetClick={handleStreetClick} />
      <Header streetCount={verifiedCount} />
      <SearchBar features={features} onResult={handleSearchResult} onClear={handleSearchClear} />
      {nearestStreets.length === 0 && <ParkNearMeButton onLocate={handleParkNearMe} />}
      <NearestPanel streets={nearestStreets} onSelect={handleNearestSelect} onClose={handleNearestClose} />
      <BottomSheet street={selectedStreet} onClose={handleSheetClose} />
    </>
  )
}
