import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { WEB_OUTLETS } from '@/lib/outlets'
import { getOutletPageData } from '@/lib/outletData'
import { fmtScore, biasLabel, leanLabel, scoreColor, toDisplay } from '@/lib/score'

export const revalidate = 900

// Pre-render a static page for every tracked outlet.
export function generateStaticParams() {
  return WEB_OUTLETS.map((o) => ({ slug: o.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const data = await getOutletPageData(params.slug)
  if (!data) return { title: 'Outlet not found — Spin Detector' }

  const { outlet, score } = data
  const label = score != null ? biasLabel(score) : leanLabel(midpoint(outlet.expectedRange))
  const scoreStr = score != null ? fmtScore(score) : `${fmtScore(outlet.expectedRange[0])} to ${fmtScore(outlet.expectedRange[1])}`

  return {
    title: `Is ${outlet.name} Biased? Media Bias Rating — Spin Detector`,
    description: `${outlet.name}'s current political bias score is ${scoreStr} (${label}) on Spin Detector's −5 to +5 scale, from daily AI analysis of its headlines by Claude and Grok.`,
    alternates: { canonical: `/outlets/${outlet.slug}` },
    openGraph: {
      title: `Is ${outlet.name} Biased? — Spin Detector`,
      description: `${outlet.name} currently scores ${scoreStr} (${label}) in daily AI bias analysis.`,
      url: `https://www.spindetector.com/outlets/${outlet.slug}`,
      siteName: 'Spin Detector',
      type: 'article',
    },
  }
}

function midpoint(r: [number, number]): number {
  return (r[0] + r[1]) / 2
}

// Server-rendered SVG sparkline of the 30-day trend (0–10 scale), no client JS.
function Sparkline({ points }: { points: { score: number }[] }) {
  const W = 640
  const H = 140
  const n = points.length
  if (n < 2) return null
  const x = (i: number) => (i / (n - 1)) * W
  const y = (s: number) => H - (s / 10) * H
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ')
  const centerY = y(5)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="30-day bias trend">
      <line x1="0" y1={centerY} x2={W} y2={centerY} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />
      <path d={path} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.score)} r="2" fill={scoreColor(p.score)} />
      ))}
    </svg>
  )
}

// Position marker along the −5..+5 spectrum for a 0–10 score.
function SpectrumBar({ score }: { score: number }) {
  const pct = (score / 10) * 100
  return (
    <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'linear-gradient(90deg,#2563eb,#3b82f6,#8b5cf6,#ef4444,#991b1b)' }}>
      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-slate-900 shadow" style={{ left: `${pct}%` }} />
    </div>
  )
}

export default async function OutletPage({ params }: { params: { slug: string } }) {
  const data = await getOutletPageData(params.slug)
  if (!data) notFound()

  const { outlet, score, grokScore, articleCount, trend } = data
  const hasLive = score != null
  const displayScore = hasLive ? score! : midpoint(outlet.expectedRange)
  const label = biasLabel(displayScore)
  const color = scoreColor(displayScore)

  // JSON-LD structured data — helps Google render richer results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `Is ${outlet.name} Biased? Media Bias Rating`,
    about: outlet.name,
    isPartOf: { '@type': 'WebSite', name: 'Spin Detector', url: 'https://www.spindetector.com' },
    description: `AI-measured political bias score for ${outlet.name}.`,
    publisher: { '@type': 'Organization', name: 'Spin Detector' },
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-2">
            <h1 className="text-xl font-black tracking-tight">
              <span style={{ color: '#3b82f6' }}>SPIN</span>
              <span className="text-slate-400 mx-1.5 font-light">·</span>
              <span style={{ color: '#ef4444' }}>DETECTOR</span>
            </h1>
          </Link>
          <Link href="/outlets" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
            All outlets →
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <nav className="text-xs text-slate-500 mb-6">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          {' / '}
          <Link href="/outlets" className="hover:text-slate-300">Outlets</Link>
          {' / '}
          <span className="text-slate-400">{outlet.name}</span>
        </nav>

        <h2 className="text-3xl sm:text-4xl font-black mb-3">Is {outlet.name} biased?</h2>
        <p className="text-slate-400 text-lg mb-8 leading-relaxed">
          Spin Detector scores {outlet.name}&apos;s political language every day using AI analysis of its
          headlines. Here&apos;s where it currently sits on the −5 (Far Left) to +5 (Far Right) spectrum.
        </p>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
          <div className="flex items-end justify-between mb-4">
            <div>
              <div className="text-sm text-slate-500 mb-1">
                {hasLive ? 'Current bias score' : 'Expected bias range'}
              </div>
              <div className="text-5xl font-black" style={{ color }}>
                {hasLive ? fmtScore(score!) : `${fmtScore(outlet.expectedRange[0])} … ${fmtScore(outlet.expectedRange[1])}`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold" style={{ color }}>{label}</div>
              {hasLive && grokScore != null && (
                <div className="text-xs text-slate-500 mt-1">Grok: {fmtScore(grokScore)}</div>
              )}
            </div>
          </div>
          <SpectrumBar score={displayScore} />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1.5">
            <span>Far Left</span><span>Center</span><span>Far Right</span>
          </div>
          {hasLive && (
            <p className="text-xs text-slate-500 mt-4">
              Based on {articleCount} scored headline{articleCount === 1 ? '' : 's'} over the last 30 days.
              {grokScore != null && ` Claude scored ${fmtScore(score!)}; Grok independently scored ${fmtScore(grokScore)}.`}
            </p>
          )}
        </section>

        {trend.length >= 2 && (
          <section className="mb-8">
            <h3 className="text-lg font-bold text-slate-100 mb-3">30-day trend</h3>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <Sparkline points={trend} />
            </div>
          </section>
        )}

        <section className="space-y-4 text-slate-300 leading-relaxed">
          <h3 className="text-lg font-bold text-slate-100">How this score is measured</h3>
          <p>
            Every day, Spin Detector fetches {outlet.name}&apos;s latest headlines alongside those of 54 other
            major outlets, groups them by story, and uses AI to score each headline&apos;s political language
            from −5 to +5. Two independent models — Claude (Anthropic) and Grok (xAI) — score the same
            headlines without seeing each other&apos;s results, so you can see where they agree and where they
            diverge.
          </p>
          <p>
            A score near <strong className="text-slate-100">0</strong> means neutral, centrist language.
            Negative scores indicate progressive framing; positive scores indicate conservative framing.
            The score reflects <em>language and framing</em> in headlines — not an editorial or factual
            rating of the outlet.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
            See today&apos;s full bias board →
          </Link>
          <Link href="/outlets" className="px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 text-sm font-semibold transition-colors">
            Compare all 55 outlets
          </Link>
        </div>
      </main>
    </div>
  )
}
