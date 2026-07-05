import { ImageResponse } from 'next/og'
import { getStoryCluster, clusterExtremes } from '@/lib/storyData'
import { fmtScore, scoreColor } from '@/lib/score'

export const runtime = 'nodejs'
// On-demand (crawlers cache it) — also avoids build-time prerender of unbounded
// story params and the Windows-path OG bug.
export const dynamic = 'force-dynamic'
export const alt = 'Story bias comparison — Spin Detector'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BAR_W = 1020

function truncate(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…'
}

export default async function Image({ params }: { params: { date: string; slug: string } }) {
  const cluster = await getStoryCluster(params.date, params.slug)

  // Fallback card if the story can't be loaded — never error the OG route.
  if (!cluster || cluster.articles.length === 0) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', color: '#f1f5f9', fontSize: 48, fontFamily: 'sans-serif' }}>
          Spin Detector — media bias, measured daily
        </div>
      ),
      { ...size }
    )
  }

  const { lo, hi, spread } = clusterExtremes(cluster)
  const loName = (lo.outletName || lo.outletId || '').toUpperCase()
  const hiName = (hi.outletName || hi.outletId || '').toUpperCase()

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 90px',
          background: '#020617',
          color: '#f1f5f9',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, fontWeight: 900 }}>
          <span style={{ color: '#fbbf24' }}>🌀 SPIN OF THE DAY</span>
        </div>

        <div style={{ display: 'flex', fontSize: 62, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1.08, marginTop: 22 }}>
          {truncate(cluster.topicLabel, 72)}
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: '#94a3b8', marginTop: 18 }}>
          {cluster.articles.length} outlets · {spread.toFixed(1)}-point bias spread
        </div>

        {/* Spectrum with a dot per outlet */}
        <div style={{ position: 'relative', display: 'flex', width: BAR_W, height: 26, marginTop: 44 }}>
          <div style={{ position: 'absolute', top: 10, left: 0, width: BAR_W, height: 6, borderRadius: 3, background: 'linear-gradient(90deg,#2563eb,#3b82f6,#8b5cf6,#ef4444,#991b1b)' }} />
          {cluster.articles.map((a, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: 0,
                left: (a.biasScore / 10) * BAR_W - 13,
                width: 26,
                height: 26,
                borderRadius: 13,
                background: scoreColor(a.biasScore),
                border: '3px solid #020617',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', width: BAR_W, justifyContent: 'space-between', marginTop: 10, fontSize: 20, color: '#64748b' }}>
          <span>Far Left</span>
          <span>Center</span>
          <span>Far Right</span>
        </div>

        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, marginTop: 40 }}>
          <span style={{ color: scoreColor(lo.biasScore) }}>{loName} {fmtScore(lo.biasScore)}</span>
          <span style={{ color: '#64748b', margin: '0 16px' }}>↔</span>
          <span style={{ color: scoreColor(hi.biasScore) }}>{hiName} {fmtScore(hi.biasScore)}</span>
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: '#475569', marginTop: 34 }}>spindetector.com · scored by Claude &amp; Grok</div>
      </div>
    ),
    { ...size }
  )
}
