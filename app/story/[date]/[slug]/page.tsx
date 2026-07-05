import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getStoryCluster, clusterExtremes } from '@/lib/storyData'
import { fmtScore, scoreColor, biasLabel } from '@/lib/score'
import ShareOnX from '@/components/ShareOnX'

export const revalidate = 3600

const BASE = 'https://www.spindetector.com'

function shareText(topic: string, loName: string, loScore: number, hiName: string, hiScore: number, spread: number) {
  return `📊 ${topic} — ${loName} ${fmtScore(loScore)} ↔ ${hiName} ${fmtScore(hiScore)} (${spread.toFixed(1)}-pt spread) #MediaBias`
}

export async function generateMetadata({
  params,
}: {
  params: { date: string; slug: string }
}): Promise<Metadata> {
  const cluster = await getStoryCluster(params.date, params.slug)
  if (!cluster) return { title: 'Story not found — Spin Detector' }

  const { lo, hi, spread } = clusterExtremes(cluster)
  const desc = `${cluster.articles.length} outlets covered "${cluster.topicLabel}" — from ${lo.outletName} (${fmtScore(lo.biasScore)}) to ${hi.outletName} (${fmtScore(hi.biasScore)}), a ${spread.toFixed(1)}-point bias spread.`

  return {
    title: `${cluster.topicLabel} — How ${cluster.articles.length} Outlets Framed It | Spin Detector`,
    description: desc,
    alternates: { canonical: `/story/${params.date}/${params.slug}` },
    openGraph: {
      title: `${cluster.topicLabel} — bias comparison`,
      description: desc,
      url: `${BASE}/story/${params.date}/${params.slug}`,
      siteName: 'Spin Detector',
      type: 'article',
    },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function StoryPage({
  params,
}: {
  params: { date: string; slug: string }
}) {
  const cluster = await getStoryCluster(params.date, params.slug)
  if (!cluster) notFound()

  const sorted = [...cluster.articles].sort((a, b) => a.biasScore - b.biasScore)
  const { lo, hi, spread } = clusterExtremes(cluster)
  const url = `${BASE}/story/${params.date}/${params.slug}`
  const text = shareText(cluster.topicLabel, lo.outletName, lo.biasScore, hi.outletName, hi.biasScore, spread)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: cluster.topicLabel,
    datePublished: cluster.date,
    isPartOf: { '@type': 'WebSite', name: 'Spin Detector', url: BASE },
    publisher: { '@type': 'Organization', name: 'Spin Detector' },
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-2">
            <h1 className="text-xl font-black tracking-tight">
              <span style={{ color: '#3b82f6' }}>SPIN</span>
              <span className="text-slate-400 mx-1.5 font-light">·</span>
              <span style={{ color: '#ef4444' }}>DETECTOR</span>
            </h1>
          </Link>
          <ShareOnX url={url} text={text} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-xs text-slate-500 mb-2">{cluster.date}</div>
        <h2 className="text-2xl sm:text-3xl font-black mb-3 leading-tight">{cluster.topicLabel}</h2>
        <p className="text-slate-400 mb-6 leading-relaxed">
          {cluster.articles.length} outlets covered the same story. Here&apos;s how their headlines landed on the
          −5 (Far Left) to +5 (Far Right) spectrum — a{' '}
          <strong className="text-slate-200">{spread.toFixed(1)}-point</strong> gap between the most-left and
          most-right framing.
        </p>

        {/* Spectrum with a dot per outlet */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <div className="relative h-10">
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 rounded-full w-full"
              style={{ background: 'linear-gradient(90deg,#2563eb,#3b82f6,#8b5cf6,#ef4444,#991b1b)' }}
            />
            {sorted.map((a) => (
              <div
                key={a.id}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-slate-900"
                style={{ left: `${(a.biasScore / 10) * 100}%`, backgroundColor: scoreColor(a.biasScore) }}
                title={`${a.outletName}: ${fmtScore(a.biasScore)}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mt-2">
            <span>Far Left</span><span>Center</span><span>Far Right</span>
          </div>
        </div>

        {/* Ranked outlet list */}
        <ul className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden mb-8">
          {sorted.map((a) => (
            <li key={a.id} className="px-4 py-3 flex items-start gap-3 bg-slate-900">
              <span className="text-sm font-mono font-bold w-12 flex-shrink-0" style={{ color: scoreColor(a.biasScore) }}>
                {fmtScore(a.biasScore)}
              </span>
              <div className="min-w-0">
                <div className="text-xs text-slate-500">{a.outletName} · {biasLabel(a.biasScore)}</div>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-200 hover:text-white transition-colors leading-snug">
                  {a.headline}
                </a>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <ShareOnX url={url} text={text} label="Share this spin on X" />
          <Link href="/" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
            See today&apos;s Battleground →
          </Link>
        </div>

        <p className="text-xs text-slate-600 mt-8">
          Scores are AI estimates of headline language, not factual ratings. Each headline is scored 0 (neutral)
          outward to Far Left / Far Right by Claude and Grok.
        </p>
      </main>
    </div>
  )
}
