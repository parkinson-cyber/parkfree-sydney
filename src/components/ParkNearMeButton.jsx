import React, { useState } from 'react'

export default function ParkNearMeButton({ onLocate }) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      await onLocate()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        position: 'fixed',
        bottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        right: '16px',
        zIndex: 1000,
        background: loading ? '#1e1e1e' : '#00E676',
        color: loading ? '#00E676' : '#000',
        border: loading ? '1px solid rgba(0,230,118,0.3)' : 'none',
        borderRadius: '50px',
        padding: '14px 20px',
        fontSize: '14px',
        fontWeight: '700',
        cursor: loading ? 'default' : 'pointer',
        fontFamily: 'inherit',
        letterSpacing: '-0.1px',
        boxShadow: loading ? 'none' : '0 4px 20px rgba(0,230,118,0.3)',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? (
        <>
          <Spinner />
          Locating…
        </>
      ) : (
        <>
          <span style={{ fontSize: '16px' }}>◎</span>
          Park Near Me
        </>
      )}
    </button>
  )
}

function Spinner() {
  return (
    <span style={{
      width: '14px', height: '14px',
      border: '2px solid rgba(0,230,118,0.3)',
      borderTopColor: '#00E676',
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}

// Inject keyframes once
const style = document.createElement('style')
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
document.head.appendChild(style)
