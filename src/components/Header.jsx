import React from 'react'

const styles = {
  header: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '60px',
    background: 'rgba(10,10,10,0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    zIndex: 1000,
    gap: '10px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#00E676',
    boxShadow: '0 0 8px rgba(0,230,118,0.6)',
    flexShrink: 0,
  },
  name: {
    fontSize: '17px',
    fontWeight: '700',
    color: '#f0f0f0',
    letterSpacing: '-0.3px',
  },
  divider: {
    width: '1px',
    height: '16px',
    background: 'rgba(255,255,255,0.12)',
    margin: '0 2px',
  },
  tagline: {
    fontSize: '12px',
    color: '#555',
    fontWeight: '500',
    letterSpacing: '0.01em',
  },
  spacer: { flex: 1 },
  badge: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#00E676',
    background: 'rgba(0,230,118,0.1)',
    border: '1px solid rgba(0,230,118,0.2)',
    borderRadius: '6px',
    padding: '3px 8px',
    letterSpacing: '0.02em',
  }
}

export default function Header({ streetCount }) {
  return (
    <header style={styles.header}>
      <div style={styles.logo}>
        <div style={styles.dot} />
        <span style={styles.name}>ParkFree</span>
        <span style={{ ...styles.name, color: '#555' }}>Sydney</span>
      </div>
      <div style={styles.divider} />
      <span style={styles.tagline}>Free street parking</span>
      <div style={styles.spacer} />
      {streetCount > 0 && (
        <span style={styles.badge}>{streetCount} streets</span>
      )}
    </header>
  )
}
