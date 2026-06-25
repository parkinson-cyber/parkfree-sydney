import React from 'react'

export default function NearestPanel({ streets, onSelect, onClose }) {
  if (!streets || streets.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
      left: '12px',
      right: '12px',
      zIndex: 1000,
      background: '#141414',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#888', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Nearest free parking
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#555', fontSize: '14px', padding: '2px 4px',
          }}
        >✕</button>
      </div>
      {streets.map((item, i) => (
        <button
          key={i}
          onClick={() => onSelect(item.feature)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '11px 14px',
            background: 'transparent',
            border: 'none',
            borderBottom: i < streets.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontSize: '13px', fontWeight: '700',
              color: i === 0 ? '#00E676' : '#888',
              background: i === 0 ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${i === 0 ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: '6px',
              padding: '2px 7px',
              minWidth: '24px',
              textAlign: 'center',
            }}>
              {i + 1}
            </span>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#f0f0f0' }}>
                {item.feature.properties.streetName}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '1px' }}>
                {item.feature.properties.suburb}
              </div>
            </div>
          </div>
          <span style={{
            fontSize: '13px', fontWeight: '600',
            color: item.distanceM < 300 ? '#00E676' : '#888',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {item.distanceM < 1000
              ? `${Math.round(item.distanceM)}m`
              : `${(item.distanceM / 1000).toFixed(1)}km`}
          </span>
        </button>
      ))}
    </div>
  )
}
