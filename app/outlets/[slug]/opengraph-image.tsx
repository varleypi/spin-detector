import { ImageResponse } from 'next/og'
import { getWebOutlet } from '@/lib/outlets'
import { leanLabel, scoreColor, fmtScore } from '@/lib/score'

export const runtime = 'nodejs'
// Generate on demand per outlet (crawlers fetch once and cache). Avoids a
// build-time prerender that breaks on Windows paths containing spaces.
export const dynamic = 'force-dynamic'
export const alt = 'Media bias rating — Spin Detector'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image({ params }: { params: { slug: string } }) {
  const outlet = getWebOutlet(params.slug)
  const name = outlet?.name ?? 'News Outlet'
  const mid = outlet ? (outlet.expectedRange[0] + outlet.expectedRange[1]) / 2 : 5
  const pct = (mid / 10) * 100
  const color = scoreColor(mid)

  const BAR_W = 660

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0 80px',
          background: '#020617',
          color: '#f1f5f9',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Left column: the question + spectrum */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flexGrow: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 30, fontWeight: 900, letterSpacing: -1 }}>
            <span style={{ color: '#3b82f6' }}>SPIN</span>
            <span style={{ color: '#64748b', margin: '0 8px' }}>·</span>
            <span style={{ color: '#ef4444' }}>DETECTOR</span>
          </div>

          <div style={{ display: 'flex', fontSize: 34, color: '#94a3b8', marginTop: 44 }}>Is</div>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 900, letterSpacing: -2, lineHeight: 1.05 }}>{name}</div>
          <div style={{ display: 'flex', fontSize: 34, color: '#94a3b8', marginTop: 8 }}>biased?</div>

          <div style={{ display: 'flex', fontSize: 38, fontWeight: 800, color, marginTop: 36 }}>{leanLabel(mid)}</div>

          {/* Spectrum with marker */}
          <div style={{ position: 'relative', display: 'flex', width: BAR_W, height: 22, borderRadius: 11, marginTop: 18, background: 'linear-gradient(90deg,#2563eb,#3b82f6,#8b5cf6,#ef4444,#991b1b)' }}>
            <div style={{ position: 'absolute', top: -7, left: `${pct}%`, marginLeft: -18, width: 36, height: 36, borderRadius: 18, background: '#ffffff', border: '4px solid #020617' }} />
          </div>
          <div style={{ display: 'flex', width: BAR_W, justifyContent: 'space-between', marginTop: 12, fontSize: 20, color: '#64748b' }}>
            <span>Far Left</span>
            <span>Center</span>
            <span>Far Right</span>
          </div>

          <div style={{ display: 'flex', fontSize: 22, color: '#475569', marginTop: 40 }}>Scored daily by Claude &amp; Grok · spindetector.com</div>
        </div>

        {/* Right column: the score, large */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 300,
            marginLeft: 40,
            paddingLeft: 40,
            borderLeft: '2px solid #1e293b',
          }}
        >
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, letterSpacing: 3, color: '#64748b' }}>BIAS SCORE</div>
          <div style={{ display: 'flex', fontSize: 170, fontWeight: 900, letterSpacing: -4, lineHeight: 1, color, marginTop: 10 }}>{fmtScore(mid)}</div>
          <div style={{ display: 'flex', fontSize: 24, color: '#64748b', marginTop: 14 }}>−5 to +5 scale</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
