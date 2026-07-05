import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
// Generate on demand (crawlers fetch OG images once and cache them). Avoids a
// build-time prerender that breaks on Windows paths containing spaces.
export const dynamic = 'force-dynamic'
export const alt = 'Spin Detector — Political Media Bias Tracker'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020617',
          color: '#f1f5f9',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 76, fontWeight: 900, letterSpacing: -2 }}>
          <span style={{ color: '#3b82f6' }}>SPIN</span>
          <span style={{ color: '#64748b', margin: '0 16px' }}>·</span>
          <span style={{ color: '#ef4444' }}>DETECTOR</span>
        </div>
        <div style={{ fontSize: 30, color: '#94a3b8', marginTop: 24 }}>
          Political media bias, measured daily by AI
        </div>
        {/* Spectrum bar */}
        <div style={{ display: 'flex', width: 820, height: 24, borderRadius: 12, marginTop: 48, background: 'linear-gradient(90deg,#2563eb,#3b82f6,#8b5cf6,#ef4444,#991b1b)' }} />
        <div style={{ display: 'flex', width: 820, justifyContent: 'space-between', marginTop: 12, fontSize: 20, color: '#64748b' }}>
          <span>Far Left</span>
          <span>Center</span>
          <span>Far Right</span>
        </div>
        <div style={{ fontSize: 22, color: '#475569', marginTop: 44 }}>
          56 outlets · scored by Claude &amp; Grok · spindetector.com
        </div>
      </div>
    ),
    { ...size }
  )
}
