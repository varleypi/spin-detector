import type { Metadata } from 'next'
import Link from 'next/link'
import { WEB_OUTLETS } from '@/lib/outlets'
import { leanLabel, scoreColor } from '@/lib/score'

export const metadata: Metadata = {
  title: 'Media Bias Ratings for 55 News Outlets — Spin Detector',
  description:
    'Browse AI-measured political bias ratings for 56 major news outlets — CNN, Fox News, BBC, NYT, and more — scored daily from −5 (Far Left) to +5 (Far Right) by Claude and Grok.',
  alternates: { canonical: '/outlets' },
}

export default function OutletsIndex() {
  const outlets = [...WEB_OUTLETS].sort((a, b) => {
    const ma = (a.expectedRange[0] + a.expectedRange[1]) / 2
    const mb = (b.expectedRange[0] + b.expectedRange[1]) / 2
    return ma - mb
  })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-2">
            <h1 className="text-xl font-black tracking-tight">
              <span style={{ color: '#3b82f6' }}>SPIN</span>
              <span className="text-slate-400 mx-1.5 font-light">·</span>
              <span style={{ color: '#ef4444' }}>DETECTOR</span>
            </h1>
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        <h2 className="text-3xl font-black mb-2">Media bias ratings for 56 news outlets</h2>
        <p className="text-slate-400 text-lg mb-8 leading-relaxed">
          AI-measured political bias for every outlet Spin Detector tracks, from Far Left to Far Right.
          Tap any outlet for its current score, 30-day trend, and Claude-vs-Grok comparison.
        </p>

        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {outlets.map((o) => {
            const mid = (o.expectedRange[0] + o.expectedRange[1]) / 2
            return (
              <li key={o.slug}>
                <Link
                  href={`/outlets/${o.slug}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 transition-colors"
                >
                  <span className="font-semibold text-slate-100">{o.name}</span>
                  <span className="text-xs font-medium whitespace-nowrap" style={{ color: scoreColor(mid) }}>
                    {leanLabel(mid)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>

        <p className="text-xs text-slate-600 mt-8">
          Bias ranges shown are expected values from media research; each outlet page shows the live
          daily-measured score. Scores reflect language and framing, not factual accuracy.
        </p>
      </main>
    </div>
  )
}
