import React, { useEffect, useRef } from 'react'

function ConfidenceDot({ confidence }) {
  const colors = { high: '#00E676', medium: '#FFB300', low: '#FF5252' }
  const labels = { high: 'Verified', medium: 'Likely accurate', low: 'Needs check' }
  const color = colors[confidence] || colors.low
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#888' }}>
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%',
        background: color,
        boxShadow: `0 0 5px ${color}80`,
        flexShrink: 0,
      }} />
      {labels[confidence] || 'Unknown'}
    </span>
  )
}

function CouncilBadge({ council }) {
  const isNorth = council?.includes('North')
  return (
    <span style={{
      fontSize: '11px',
      fontWeight: '600',
      color: isNorth ? '#82b1ff' : '#00E676',
      background: isNorth ? 'rgba(130,177,255,0.1)' : 'rgba(0,230,118,0.1)',
      border: `1px solid ${isNorth ? 'rgba(130,177,255,0.2)' : 'rgba(0,230,118,0.2)'}`,
      borderRadius: '6px',
      padding: '3px 8px',
      letterSpacing: '0.02em',
    }}>
      {council || 'Unknown Council'}
    </span>
  )
}

export default function BottomSheet({ street, onClose }) {
  const sheetRef = useRef(null)
  const open = !!street

  // Close on outside tap (handled in App by clicking map)
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target)) {
        // only close if clicking outside the sheet element itself
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open, onClose])

  const p = street?.properties || {}

  const handleDirections = () => {
    if (!street) return
    const coords = street.geometry.coordinates
    const mid = coords[Math.floor(coords.length / 2)]
    const lat = mid[1], lng = mid[0]
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
    const url = isIOS
      ? `maps://maps.apple.com/?daddr=${lat},${lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    window.open(url, '_blank')
  }

  const formatDate = (d) => {
    if (!d) return 'Unknown'
    const date = new Date(d)
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'transparent',
          zIndex: open ? 1900 : -1,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#141414',
          borderRadius: '20px 20px 0 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          zIndex: 2000,
          transform: open ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '55vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Handle bar — always visible at top */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px', flexShrink: 0 }}>
          <div style={{
            width: '36px', height: '4px',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: '2px',
          }} />
        </div>

        {street && (
          <>
            {/* Scrollable content */}
            <div style={{
              overflowY: 'auto',
              flex: 1,
              padding: '0 20px',
              WebkitOverflowScrolling: 'touch',
            }}>
              {/* Title row */}
              <div style={{ marginBottom: '12px' }}>
                <h2 style={{
                  fontSize: '22px', fontWeight: '800',
                  color: '#f0f0f0', letterSpacing: '-0.5px',
                  marginBottom: '4px',
                }}>
                  {p.streetName}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', color: '#888' }}>{p.suburb}</span>
                  <span style={{ color: '#333' }}>·</span>
                  <CouncilBadge council={p.council} />
                </div>
              </div>

              {/* Notes */}
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '12px',
              }}>
                <p style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.5' }}>
                  {p.notes || 'No additional notes.'}
                </p>
              </div>

              {/* Meta row */}
              <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '4px',
              }}>
                <ConfidenceDot confidence={p.confidence} />
                <span style={{ fontSize: '12px', color: '#555' }}>
                  {p.status === 'verified' ? 'Verified' : 'Added'} {formatDate(p.lastVerified)}
                </span>
              </div>
            </div>

            {/* Actions — always visible at bottom */}
            <div style={{
              padding: '12px 20px',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              flexShrink: 0,
              display: 'flex',
              gap: '10px',
            }}>
              <button
                onClick={handleDirections}
                style={{
                  flex: 1,
                  background: '#00E676',
                  color: '#000',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '-0.1px',
                }}
              >
                ↗ Get Directions
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: '#888',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ✕
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
