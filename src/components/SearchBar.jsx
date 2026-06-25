import React, { useState, useRef } from 'react'

export default function SearchBar({ features, onResult, onClear }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    if (val.trim().length < 2) {
      setResults([])
      if (val.trim().length === 0) onClear?.()
      return
    }
    const q = val.toLowerCase()
    const matched = features.filter(f => {
      const p = f.properties
      return (
        p.streetName?.toLowerCase().includes(q) ||
        p.suburb?.toLowerCase().includes(q) ||
        p.council?.toLowerCase().includes(q)
      )
    }).slice(0, 6)
    setResults(matched)
  }

  const handleSelect = (feature) => {
    setQuery(feature.properties.streetName + ', ' + feature.properties.suburb)
    setResults([])
    onResult?.(feature)
    inputRef.current?.blur()
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    onClear?.()
  }

  const showDropdown = focused && results.length > 0

  return (
    <div style={{
      position: 'fixed',
      top: '68px',
      left: '12px',
      right: '12px',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: showDropdown ? '14px 14px 0 0' : '14px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: '10px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        transition: 'border-radius 0.15s',
      }}>
        <span style={{ fontSize: '16px', color: '#555', flexShrink: 0 }}>⌕</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search suburb or street name…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '15px',
            color: '#f0f0f0',
            padding: '13px 0',
            fontFamily: 'inherit',
          }}
        />
        {query && (
          <button
            onClick={handleClear}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '50%',
              width: '22px',
              height: '22px',
              cursor: 'pointer',
              color: '#888',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >✕</button>
        )}
      </div>

      {showDropdown && (
        <div style={{
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '0 0 14px 14px',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {results.map((f, i) => (
            <button
              key={i}
              onMouseDown={() => handleSelect(f)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '11px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                background: f.properties.status === 'verified' ? '#00E676' : '#FFB300',
                boxShadow: f.properties.status === 'verified'
                  ? '0 0 5px rgba(0,230,118,0.5)'
                  : '0 0 5px rgba(255,179,0,0.5)',
              }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#f0f0f0' }}>
                  {f.properties.streetName}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginTop: '1px' }}>
                  {f.properties.suburb} · {f.properties.council}
                </div>
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <div style={{ padding: '14px', fontSize: '13px', color: '#555', textAlign: 'center' }}>
              No streets found
            </div>
          )}
        </div>
      )}
    </div>
  )
}
