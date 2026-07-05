'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { StoryCluster, OutletScore, TrendPoint, PipelineStatus } from '@/lib/types'
import { OUTLET_META, MAX_DAILY_READERS } from '@/lib/outletMeta'
import ShareOnX from '@/components/ShareOnX'

type Tab = 'about' | 'battleground' | 'biasboard' | 'trends' | 'modelwars'

// ─── Utilities ───────────────────────────────────────────────────────────────

function getBiasColor(score: number): string {
  if (score <= 2) return '#2563eb'
  if (score <= 3.5) return '#3b82f6'
  if (score <= 4.5) return '#6366f1'
  if (score <= 5.5) return '#8b5cf6'
  if (score <= 6.5) return '#f59e0b'
  if (score <= 8) return '#ef4444'
  return '#991b1b'
}

function getBiasLabel(score: number): string {
  if (score <= 1.5) return 'Far Left'
  if (score <= 3) return 'Left'
  if (score <= 4.2) return 'Lean Left'
  if (score <= 5.8) return 'Center'
  if (score <= 7) return 'Lean Right'
  if (score <= 8.5) return 'Right'
  return 'Far Right'
}

// Compact X-icon share link, used inline in dense rows (e.g. Bias Board).
function ShareIcon({ url, text }: { url: string; text: string }) {
  const href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Share on X"
      title="Share on X"
      className="text-slate-600 hover:text-slate-200 transition-colors flex-shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </a>
  )
}

// Article URLs come from external RSS feeds — only allow http/https through
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url
  } catch {
    // fall through
  }
  return '#'
}

// Display score as -5 to +5 (DB stores 0-10)
function fmt(score: number): string {
  const d = Math.round((score - 5) * 10) / 10
  return (d >= 0 ? '+' : '') + d.toFixed(1)
}

function fmtRaw(score: number): number {
  return Math.round((score - 5) * 10) / 10
}

function getOutletLineColor(outletId: string): string {
  const colors: Record<string, string> = {
    // Blues / Indigos
    msnbc:          '#3b82f6',  // blue-500
    nytimes:        '#6366f1',  // indigo-500
    thehill:        '#1d4ed8',  // blue-700
    // Cyans / Teals
    washpost:       '#22d3ee',  // cyan-400
    usatoday:       '#0ea5e9',  // sky-400
    thefreepress:   '#2dd4bf',  // teal-400
    economist:      '#0f766e',  // teal-700
    // Greens / Limes
    guardian:       '#16a34a',  // green-600
    npr:            '#84cc16',  // lime-400
    forbes:         '#4ade80',  // green-400
    // Yellows / Ambers
    bbc:            '#d97706',  // amber-600
    politico:       '#eab308',  // yellow-500
    axios:          '#f59e0b',  // amber-500
    // Oranges
    cnn:            '#f97316',  // orange-500
    nypost:         '#ea580c',  // orange-600
    // Pinks / Fuchsias / Magentas
    aljazeera:      '#ec4899',  // pink-500
    cnbc:           '#c026d3',  // fuchsia-600
    newsweek:       '#f43f5e',  // rose-500
    // Purples / Violets
    cbsnews:        '#7c3aed',  // violet-600
    washexaminer:   '#9333ea',  // purple-600
    thefederalist:  '#4c1d95',  // violet-900
    // Sister site — bright emerald to stand out at center
    neutralnews:    '#10b981',  // emerald-500
    // Reds (spread across bright → dark)
    nationalreview: '#dc2626',  // red-600
    foxnews:        '#ef4444',  // red-500 (brightest)
    dailycaller:    '#be123c',  // rose-700
    breitbart:      '#7f1d1d',  // red-900 (darkest)
    // Dark navy for WSJ
    wsj:            '#0369a1',  // sky-700
    // New regional / metro papers
    latimes:           '#7e22ce',  // purple-700
    bostonglobe:       '#be185d',  // pink-700
    chicagotribune:    '#b45309',  // amber-700
    startribune:       '#0d9488',  // teal-600
    charlotteobserver: '#65a30d',  // lime-600
    timesofisrael:     '#0891b2',  // cyan-600
    // UK outlets
    dailymail:         '#e11d48',  // rose-600
    metro:             '#4338ca',  // indigo-700
    telegraph:         '#92400e',  // amber-800 (brown)
    financialtimes:    '#c2410c',  // orange-700
    bloomberg:         '#1e3a8a',  // blue-900
    yahoofinance:      '#6b21a8',  // purple-800
    // Wire services / broadcast / regional
    reuters:           '#10b981',  // emerald-500
    marketwatch:       '#fbbf24',  // amber-400
    businessinsider:   '#06b6d4',  // cyan-500
    houstonchronicle:  '#78716c',  // stone-500
    miamiherald:       '#14b8a6',  // teal-500
    abc:               '#2563eb',  // blue-600
    nbc:               '#d946ef',  // fuchsia-500
    // New batch
    ap:                '#64748b',  // slate-500 (neutral grey fits a wire service)
    independent:       '#059669',  // emerald-600
    vox:               '#a855f7',  // purple-500
    cbc:               '#1e40af',  // blue-800
    huffpost:          '#15803d',  // green-700
    reason:            '#854d0e',  // amber-900 (earthy gold = libertarian)
    theatlantic:       '#075985',  // sky-800
    skynews:           '#7dd3fc',  // sky-300
    timeslondon:       '#78350f',  // amber-900 (warm brown)
    tampabaytimes:     '#0e7490',  // cyan-700
  }
  return colors[outletId] ?? '#94a3b8'
}

// Outlet groupings for the Trends selector — keeps 55 buttons manageable
const OUTLET_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: 'Lean Left',
    ids: ['msnbc', 'cnn', 'nytimes', 'washpost', 'npr', 'guardian', 'huffpost', 'vox', 'theatlantic', 'abc', 'nbc', 'cbsnews'],
  },
  {
    label: 'Center',
    ids: ['ap', 'reuters', 'politico', 'thehill', 'axios', 'newsweek', 'usatoday', 'economist', 'thefreepress', 'reason', 'neutralnews'],
  },
  {
    label: 'Lean Right',
    ids: ['foxnews', 'nypost', 'dailycaller', 'breitbart', 'washexaminer', 'nationalreview', 'thefederalist'],
  },
  {
    label: 'Financial & Business',
    ids: ['wsj', 'cnbc', 'forbes', 'bloomberg', 'yahoofinance', 'marketwatch', 'businessinsider', 'financialtimes'],
  },
  {
    label: 'US Regional',
    ids: ['latimes', 'bostonglobe', 'chicagotribune', 'startribune', 'charlotteobserver', 'houstonchronicle', 'miamiherald', 'tampabaytimes'],
  },
  {
    label: 'International',
    ids: ['bbc', 'aljazeera', 'dailymail', 'metro', 'telegraph', 'skynews', 'timeslondon', 'independent', 'cbc', 'timesofisrael'],
  },
]

// ─── Outlet Ticker ────────────────────────────────────────────────────────────

function OutletTicker({ outlets }: { outlets: OutletScore[] }) {
  const sorted = [...outlets].sort((a, b) => a.currentScore - b.currentScore)
  // Duplicate list so the scroll loops seamlessly
  const items = [...sorted, ...sorted]

  return (
    <div className="bg-slate-900 border-b border-slate-800 overflow-hidden">
      <div
        className="flex gap-6 py-1.5 px-4 whitespace-nowrap"
        style={{
          animation: 'ticker-scroll 40s linear infinite',
          width: 'max-content',
        }}
      >
        {items.map((outlet, i) => {
          const color = getBiasColor(outlet.currentScore)
          return (
            <span key={`${outlet.outletId}-${i}`} className="inline-flex items-center gap-1.5 text-xs">
              <span className="font-bold" style={{ color }}>{outlet.abbreviation}</span>
              <span className="font-mono tabular-nums" style={{ color }}>{fmt(outlet.currentScore)}</span>
              <span className="text-slate-700 ml-2">·</span>
            </span>
          )
        })}
      </div>
      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}

// ─── Bias Bar ─────────────────────────────────────────────────────────────────

function BiasBar({ score, compact = false }: { score: number; compact?: boolean }) {
  const pct = (score / 10) * 100
  const color = getBiasColor(score)

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="relative w-24 h-1.5 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-xs font-mono font-bold tabular-nums" style={{ color }}>
          {fmt(score)}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="relative w-full h-2 rounded-full overflow-hidden"
        style={{ background: 'linear-gradient(to right, #2563eb, #8b5cf6, #ef4444)' }}>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-lg transition-all duration-500"
          style={{ left: `calc(${pct}% - 6px)`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>← −5</span>
        <span className="font-semibold" style={{ color }}>{getBiasLabel(score)}</span>
        <span>+5 →</span>
      </div>
    </div>
  )
}

// ─── Outlet Badge ─────────────────────────────────────────────────────────────

function OutletBadge({ outlet, score }: { outlet: string; score: number }) {
  const color = getBiasColor(score)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide border"
      style={{ color, borderColor: `${color}40`, backgroundColor: `${color}15` }}
    >
      {outlet}
    </span>
  )
}

// ─── Story Card ───────────────────────────────────────────────────────────────

function StoryCard({ cluster, featured = false }: { cluster: StoryCluster; featured?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...cluster.articles].sort((a, b) => a.biasScore - b.biasScore)
  const minScore = sorted[0]?.biasScore ?? 5
  const maxScore = sorted[sorted.length - 1]?.biasScore ?? 5
  const spread = maxScore - minScore

  return (
    <div
      className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${
        featured
          ? 'border-amber-500/60 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/10'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Spin of the Day ribbon */}
      {featured && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-amber-500/30 bg-gradient-to-r from-amber-500/20 to-transparent">
          <span className="text-amber-400 text-xs font-black uppercase tracking-wide">🌀 Spin of the Day</span>
          <span className="hidden sm:inline text-[11px] text-amber-500/70">Widest bias gap across outlets today</span>
        </div>
      )}
      {/* Card Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-100 text-sm leading-snug">{cluster.topicLabel}</h3>
          <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
            <span>{sorted.length} outlets</span>
            <span>•</span>
            <span
              className="font-semibold"
              style={{ color: spread >= 5 ? '#ef4444' : spread >= 3 ? '#f59e0b' : '#22c55e' }}
            >
              {spread.toFixed(1)} point spread
            </span>
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-3 mt-0.5">
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
              `📊 ${cluster.topicLabel} — ${sorted[0]?.outletName} ${fmt(minScore)} ↔ ${sorted[sorted.length - 1]?.outletName} ${fmt(maxScore)} (${spread.toFixed(1)}-pt spread) #MediaBias`
            )}&url=${encodeURIComponent(`https://www.spindetector.com/story/${cluster.date}/${cluster.id}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share this story on X"
            className="text-slate-500 hover:text-slate-200 transition-colors"
            title="Share on X"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-500 hover:text-slate-300 transition-colors text-xs"
          >
            {expanded ? 'Collapse ↑' : 'Expand ↓'}
          </button>
        </div>
      </div>

      {/* Spectrum overview */}
      <div className="px-4 py-2">
        <div className="relative h-8">
          <div
            className="absolute top-1/2 -translate-y-1/2 h-0.5 rounded-full opacity-30"
            style={{
              left: '0', right: '0',
              background: 'linear-gradient(to right, #2563eb, #8b5cf6, #ef4444)',
            }}
          />
          {sorted.map((article) => (
            <div
              key={article.id}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group"
              style={{ left: `${(article.biasScore / 10) * 100}%` }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full border border-slate-900 cursor-default transition-transform group-hover:scale-150"
                style={{ backgroundColor: getBiasColor(article.biasScore) }}
                title={`${article.outletName}: ${article.biasScore}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Article list */}
      <div className="divide-y divide-slate-800/60">
        {sorted.map((article) => (
          <div key={article.id} className="px-4 py-3">
            <div className="flex flex-wrap items-start gap-3">
              <OutletBadge outlet={article.outletName} score={article.biasScore} />
              <div className="flex-1 min-w-0">
                <a
                  href={safeUrl(article.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-200 hover:text-white transition-colors leading-snug block"
                >
                  {article.headline}
                </a>
                {expanded && article.biasSignals.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {article.biasSignals.map((signal, i) => (
                      <li key={i} className="text-[11px] text-slate-500 flex items-start gap-1.5">
                        <span className="text-indigo-500 mt-px font-bold text-[9px] uppercase tracking-wider mt-0.5">C›</span>
                        <span>{signal}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {expanded && article.biasSignalsGrok && article.biasSignalsGrok.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {article.biasSignalsGrok.map((signal, i) => (
                      <li key={i} className="text-[11px] text-slate-500 flex items-start gap-1.5">
                        <span className="text-amber-500 mt-px font-bold text-[9px] uppercase tracking-wider mt-0.5">G›</span>
                        <span>{signal}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* Mobile: full-width row under the headline · Desktop: right-hand column */}
              <div className="flex w-full sm:w-auto flex-row sm:flex-col items-center sm:items-end gap-4 sm:gap-1 flex-shrink-0 pl-0 sm:pl-2">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider w-7 text-right">C</span>
                  <BiasBar score={article.biasScore} compact />
                </div>
                {article.biasScoreGrok !== undefined && (
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wider w-7 text-right">G</span>
                    <BiasBar score={article.biasScoreGrok} compact />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Battleground View ────────────────────────────────────────────────────────

// Bias spread across a cluster's articles (max − min score). Larger = outlets
// framed the same story more differently.
function clusterSpread(cluster: StoryCluster): number {
  if (cluster.articles.length < 2) return 0
  let lo = cluster.articles[0].biasScore
  let hi = cluster.articles[0].biasScore
  for (const a of cluster.articles) {
    if (a.biasScore < lo) lo = a.biasScore
    if (a.biasScore > hi) hi = a.biasScore
  }
  return hi - lo
}

function BattlegroundView({ stories }: { stories: StoryCluster[] }) {
  if (stories.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <div className="text-4xl mb-3">📡</div>
        <p>No stories yet. Run the pipeline to fetch today&apos;s headlines.</p>
      </div>
    )
  }

  // Widest discrepancy first; ties broken by the larger cluster (more outlets).
  const sorted = [...stories].sort(
    (a, b) => clusterSpread(b) - clusterSpread(a) || b.articles.length - a.articles.length
  )

  // Only crown a "Spin of the Day" if the top story is a real multi-outlet
  // divergence, not a lone article.
  const topIsFeatured = clusterSpread(sorted[0]) > 0 && sorted[0].articles.length >= 2

  return (
    <div className="space-y-4">
      {sorted.map((cluster, i) => (
        <StoryCard key={cluster.id} cluster={cluster} featured={i === 0 && topIsFeatured} />
      ))}
    </div>
  )
}

// ─── Bias Board ───────────────────────────────────────────────────────────────

function BiasBoardView({ outlets, hasGrokData }: { outlets: OutletScore[]; hasGrokData: boolean }) {
  const [sortModel, setSortModel] = useState<'claude' | 'grok' | 'reach'>('claude')

  const sorted = [...outlets].sort((a, b) => {
    if (sortModel === 'grok') {
      const aScore = a.currentScoreGrok ?? a.currentScore
      const bScore = b.currentScoreGrok ?? b.currentScore
      return aScore - bScore
    }
    if (sortModel === 'reach') {
      const aReach = OUTLET_META[a.outletId]?.dailyReaders ?? 0
      const bReach = OUTLET_META[b.outletId]?.dailyReaders ?? 0
      return bReach - aReach  // highest reach first
    }
    return a.currentScore - b.currentScore
  })

  const boardShareText = `📊 How ${outlets.length} major news outlets rank on political bias — Far Left to Far Right, scored daily by Claude & Grok. #MediaBias`

  return (
    <div className="space-y-6">
      {/* Share bar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Where each outlet lands on the −5 to +5 bias spectrum, averaged over 30 days.
        </p>
        <ShareOnX url="https://www.spindetector.com" text={boardShareText} label="Share the board" />
      </div>

      {/* Spectrum visual */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
          Political Spectrum Placement
        </h3>
        {/* Scrollable on mobile so 55 outlet chips don't pile on top of each other */}
        <div className="overflow-x-auto">
          <div className="relative min-w-[720px]">
            <div
              className="h-3 rounded-full w-full"
              style={{ background: 'linear-gradient(to right, #1d4ed8, #6366f1, #8b5cf6, #a855f7, #f59e0b, #ef4444, #991b1b)' }}
            />
            {/* Labels */}
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
              <span>Far Left (−5)</span>
              <span>Left (−3/−2)</span>
              <span>Center (0)</span>
              <span>Right (+2/+3)</span>
              <span>Far Right (+5)</span>
            </div>
            {/* Outlet chips — staggered over 4 rows to reduce collisions */}
            <div className="relative mt-3 h-[72px]">
              {sorted.map((outlet, i) => {
                const pct = (outlet.currentScore / 10) * 100
                const row = i % 4
                return (
                  <div
                    key={outlet.outletId}
                    className="absolute flex flex-col items-center group"
                    style={{ left: `${pct}%`, transform: 'translateX(-50%)', top: row * 18 }}
                  >
                    <div
                      className="text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap"
                      style={{
                        color: getBiasColor(outlet.currentScore),
                        backgroundColor: `${getBiasColor(outlet.currentScore)}20`,
                        border: `1px solid ${getBiasColor(outlet.currentScore)}40`,
                      }}
                      title={`${outlet.outletName} · ${fmt(outlet.currentScore)} · ${OUTLET_META[outlet.outletId]?.readerLabel ?? '?'} daily ${OUTLET_META[outlet.outletId]?.readerType === 'tv' ? 'viewers' : 'readers'}`}
                    >
                      {outlet.abbreviation}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <p className="sm:hidden text-[10px] text-slate-600 mt-2">← Swipe to explore the full spectrum →</p>
      </div>

      {/* Sorted table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">

        {/* ── Sort toggle ── */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-950/30 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Order by</span>
          <button
            onClick={() => setSortModel('claude')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${sortModel === 'claude' ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-600/50' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Claude
          </button>
          {hasGrokData && (
            <button
              onClick={() => setSortModel('grok')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${sortModel === 'grok' ? 'bg-amber-600/30 text-amber-300 border border-amber-600/50' : 'text-slate-500 hover:text-slate-300'}`}
            >
              Grok
            </button>
          )}
          <button
            onClick={() => setSortModel('reach')}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${sortModel === 'reach' ? 'bg-sky-600/30 text-sky-300 border border-sky-600/50' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Daily Reach
          </button>
        </div>

        {/* ── Desktop header (hidden on mobile) ── */}
        <div className="hidden sm:flex px-4 py-2 border-b border-slate-800 items-center gap-4 bg-slate-950/50">
          <span className="w-5 flex-shrink-0" />
          <span className="w-36 flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Outlet — 30d avg</span>
          <span className="w-36 flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Daily Reach</span>
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Bias Score</span>
          <span className="w-20 flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-indigo-500 text-right">Claude</span>
          {hasGrokData && <span className="w-20 flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-amber-500 text-right">Grok</span>}
          <span className="w-20 flex-shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500 text-right">Exp. Range</span>
        </div>

        {/* ── Mobile header (hidden on desktop) ── */}
        <div className="flex sm:hidden px-4 py-2 border-b border-slate-800 items-center gap-3 bg-slate-950/50">
          <span className="w-5 flex-shrink-0" />
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Outlet — 30d avg</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Reach</span>
          <span className="w-14 text-[10px] font-semibold uppercase tracking-widest text-indigo-500 text-right">Claude</span>
          {hasGrokData && <span className="w-14 text-[10px] font-semibold uppercase tracking-widest text-amber-500 text-right">Grok</span>}
        </div>

        <div className="divide-y divide-slate-800/60">
          {sorted.map((outlet, rank) => {
            const meta = OUTLET_META[outlet.outletId]
            const reachPct = meta ? (meta.dailyReaders / MAX_DAILY_READERS) * 100 : 0
            const reachColor = meta?.readerType === 'tv' ? '#f59e0b' : '#38bdf8'
            const activeScore = sortModel === 'grok' && outlet.currentScoreGrok !== undefined
              ? outlet.currentScoreGrok
              : outlet.currentScore
            const outletUrl = `https://www.spindetector.com/outlets/${outlet.outletId}`
            const outletShareText = `Is ${outlet.outletName} biased? It scores ${fmt(outlet.currentScore)} (${getBiasLabel(outlet.currentScore)}) on Spin Detector's AI media-bias tracker. #MediaBias`
            return (
              <div key={outlet.outletId} className="hover:bg-slate-800/30 transition-colors">

                {/* ── Desktop row (hidden on mobile) ── */}
                <div className="hidden sm:flex px-4 py-3 items-center gap-4">
                  <span className="text-slate-600 text-sm font-mono w-5 text-right flex-shrink-0">{rank + 1}</span>
                  <div className="w-36 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <a href={outletUrl} className="font-semibold text-sm text-slate-200 hover:text-white transition-colors">{outlet.outletName}</a>
                      <ShareIcon url={outletUrl} text={outletShareText} />
                    </div>
                    <div className="text-[11px] text-slate-500">{outlet.articleCount} articles scored</div>
                  </div>
                  <div className="w-36 flex-shrink-0">
                    {meta ? (
                      <div title={meta.readerNote}>
                        <div className="flex items-baseline gap-1.5 mb-1">
                          <span className="text-sm font-bold font-mono text-slate-100">{meta.readerLabel}</span>
                          <span className="text-[10px] text-slate-500">daily</span>
                          <span className="text-[9px] font-bold px-1 py-px rounded uppercase tracking-wide"
                            style={{ color: reachColor, backgroundColor: `${reachColor}18`, border: `1px solid ${reachColor}30` }}>
                            {meta.readerType === 'tv' ? 'TV' : 'Web'}
                          </span>
                        </div>
                        <div className="relative h-2 rounded-full bg-slate-800">
                          <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                            style={{ width: `${reachPct}%`, backgroundColor: reachColor }} />
                        </div>
                      </div>
                    ) : <span className="text-[11px] text-slate-600">—</span>}
                  </div>
                  <div className="flex-1"><BiasBar score={activeScore} /></div>
                  <div className="w-20 flex-shrink-0 text-right">
                    <div className="text-lg font-bold font-mono tabular-nums" style={{ color: getBiasColor(outlet.currentScore) }}>
                      {fmt(outlet.currentScore)}
                    </div>
                    <div className="text-[10px] text-indigo-400">Claude</div>
                  </div>
                  {hasGrokData && (
                    <div className="w-20 flex-shrink-0 text-right">
                      {outlet.currentScoreGrok !== undefined ? (
                        <>
                          <div className="text-lg font-bold font-mono tabular-nums" style={{ color: getBiasColor(outlet.currentScoreGrok) }}>
                            {fmt(outlet.currentScoreGrok)}
                          </div>
                          <div className="text-[10px] text-amber-500">Grok</div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-700">—</div>
                      )}
                    </div>
                  )}
                  <div className="w-20 flex-shrink-0 text-[11px] text-slate-600 text-right">
                    {fmtRaw(outlet.expectedRange[0])} to {fmtRaw(outlet.expectedRange[1])}
                  </div>
                </div>

                {/* ── Mobile row (hidden on desktop) ── */}
                <div className="flex sm:hidden px-3 py-3 items-start gap-3">
                  {/* Rank */}
                  <span className="text-slate-600 text-xs font-mono w-5 text-right flex-shrink-0 mt-0.5">{rank + 1}</span>
                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    {/* Name + scores on one line */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <a href={outletUrl} className="font-semibold text-sm text-slate-200 hover:text-white transition-colors">{outlet.outletName}</a>
                          <ShareIcon url={outletUrl} text={outletShareText} />
                        </div>
                        <div className="text-[11px] mt-0.5 font-semibold" style={{ color: getBiasColor(activeScore) }}>
                          {getBiasLabel(activeScore)}
                        </div>
                      </div>
                      <div className="flex gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-lg font-bold font-mono tabular-nums" style={{ color: getBiasColor(outlet.currentScore) }}>
                            {fmt(outlet.currentScore)}
                          </div>
                          <div className="text-[9px] text-indigo-400 uppercase tracking-wider">Claude</div>
                        </div>
                        {hasGrokData && outlet.currentScoreGrok !== undefined && (
                          <div className="text-right">
                            <div className="text-lg font-bold font-mono tabular-nums" style={{ color: getBiasColor(outlet.currentScoreGrok) }}>
                              {fmt(outlet.currentScoreGrok)}
                            </div>
                            <div className="text-[9px] text-amber-500 uppercase tracking-wider">Grok</div>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Bias bar full width */}
                    <BiasBar score={activeScore} />
                    {/* Reach bar below */}
                    {meta && (
                      <div className="mt-2 flex items-center gap-2" title={meta.readerNote}>
                        <div className="relative h-1.5 rounded-full bg-slate-800 flex-1">
                          <div className="absolute left-0 top-0 h-full rounded-full"
                            style={{ width: `${reachPct}%`, backgroundColor: reachColor }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap flex-shrink-0">
                          {meta.readerLabel}
                          <span className="text-slate-600 ml-1">{meta.readerType === 'tv' ? 'tv' : 'web'}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Trends View ──────────────────────────────────────────────────────────────

interface TrendData {
  [outletId: string]: TrendPoint[]
}

function TrendsView({ outlets }: { outlets: OutletScore[] }) {
  const [selectedOutlets, setSelectedOutlets] = useState<Set<string>>(
    new Set(['cbsnews', 'usatoday', 'nypost', 'yahoofinance', 'latimes', 'bbc'])
  )
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [trendData, setTrendData] = useState<TrendData>({})
  const [loading, setLoading] = useState(false)

  const fetchTrends = useCallback(async () => {
    setLoading(true)
    const results: TrendData = {}
    await Promise.all(
      outlets.map(async (outlet) => {
        try {
          const res = await fetch(`/api/outlets/${outlet.outletId}/trend`)
          const data = await res.json()
          results[outlet.outletId] = data.trend
        } catch {
          results[outlet.outletId] = []
        }
      })
    )
    setTrendData(results)
    setLoading(false)
  }, [outlets])

  useEffect(() => {
    if (outlets.length > 0) fetchTrends()
  }, [outlets, fetchTrends])

  const toggleOutlet = (id: string) => {
    setSelectedOutlets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const setGroupSelection = (ids: string[], selected: boolean) => {
    setSelectedOutlets((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (selected) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  // Build display groups from outlets actually present; catch-all for any
  // outlet not yet assigned to a group so nothing silently disappears
  const outletById = new Map(outlets.map((o) => [o.outletId, o]))
  const grouped = OUTLET_GROUPS
    .map((g) => ({ label: g.label, members: g.ids.map((id) => outletById.get(id)).filter((o): o is OutletScore => !!o) }))
    .filter((g) => g.members.length > 0)
  const assignedIds = new Set(OUTLET_GROUPS.flatMap((g) => g.ids))
  const ungrouped = outlets.filter((o) => !assignedIds.has(o.outletId))
  if (ungrouped.length > 0) grouped.push({ label: 'Other', members: ungrouped })

  // Merge all trend data into chart format
  const allDates = Object.values(trendData)[0]?.map((p) => p.date) ?? []
  const chartData = allDates.map((date) => {
    const point: Record<string, number | string> = { date: date.slice(5) }
    for (const [outletId, points] of Object.entries(trendData)) {
      const match = points.find((p) => p.date === date)
      if (match) point[outletId] = fmtRaw(match.score)
    }
    return point
  })

  const selectedList = outlets.filter((o) => selectedOutlets.has(o.outletId))
  const trendsShareText = `📈 30-day political bias trends for major news outlets — tracked daily by AI (Claude & Grok) on Spin Detector. #MediaBias`

  return (
    <div className="space-y-4">
      {/* Share bar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">How each outlet&apos;s bias has shifted over the last 30 days.</p>
        <ShareOnX url="https://www.spindetector.com" text={trendsShareText} label="Share Trends" />
      </div>

      {/* Outlet selector — grouped, collapsible */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Select Outlets to Compare
          </div>
          <div className="text-[11px] text-slate-500">
            {selectedOutlets.size} selected
            {selectedOutlets.size > 0 && (
              <button
                onClick={() => setSelectedOutlets(new Set())}
                className="ml-2 text-slate-600 hover:text-slate-300 underline transition-colors"
              >
                clear
              </button>
            )}
          </div>
        </div>
        <div className="divide-y divide-slate-800/60 border-t border-slate-800">
          {grouped.map((group) => {
            const expanded = expandedGroups.has(group.label)
            const selectedInGroup = group.members.filter((o) => selectedOutlets.has(o.outletId)).length
            return (
              <div key={group.label}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/30 transition-colors text-left"
                >
                  <span className="flex items-center gap-2">
                    <span className={`text-slate-500 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
                    <span className="text-sm font-semibold text-slate-300">{group.label}</span>
                    <span className="text-[11px] text-slate-600">({group.members.length})</span>
                  </span>
                  {selectedInGroup > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
                      {selectedInGroup} selected
                    </span>
                  )}
                </button>
                {expanded && (
                  <div className="px-4 pb-3">
                    <div className="flex gap-3 mb-2 text-[11px]">
                      <button
                        onClick={() => setGroupSelection(group.members.map((o) => o.outletId), true)}
                        className="text-slate-500 hover:text-slate-300 underline transition-colors"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => setGroupSelection(group.members.map((o) => o.outletId), false)}
                        className="text-slate-500 hover:text-slate-300 underline transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.members.map((outlet) => {
                        const active = selectedOutlets.has(outlet.outletId)
                        const color = getOutletLineColor(outlet.outletId)
                        return (
                          <button
                            key={outlet.outletId}
                            onClick={() => toggleOutlet(outlet.outletId)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                            style={
                              active
                                ? { backgroundColor: `${color}25`, borderColor: color, color }
                                : { backgroundColor: 'transparent', borderColor: '#334155', color: '#64748b' }
                            }
                          >
                            {outlet.outletName}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        {loading ? (
          <div className="h-80 flex items-center justify-center text-slate-500">
            Loading trend data...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-slate-500">
            No trend data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                domain={[-5, 5]}
                ticks={[-5, -3, -1, 0, 1, 3, 5]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" label={{ value: 'CENTER', fill: '#475569', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                itemStyle={{ fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  const outlet = outlets.find((o) => o.outletId === name)
                  return [(value >= 0 ? '+' : '') + value.toFixed(1), outlet?.outletName ?? name]
                }}
              />
              <Legend
                formatter={(value: string) => {
                  const outlet = outlets.find((o) => o.outletId === value)
                  return outlet?.outletName ?? value
                }}
                wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
              />
              {selectedList.map((outlet) => (
                <Line
                  key={outlet.outletId}
                  type="monotone"
                  dataKey={outlet.outletId}
                  stroke={getOutletLineColor(outlet.outletId)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Score summary */}
      {selectedList.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {selectedList.map((outlet) => (
            <div
              key={outlet.outletId}
              className="bg-slate-900 border border-slate-800 rounded-xl p-3"
            >
              <div className="text-xs text-slate-500 mb-1">{outlet.outletName}</div>
              <div
                className="text-2xl font-bold font-mono"
                style={{ color: getOutletLineColor(outlet.outletId) }}
              >
                {fmt(outlet.currentScore)}
              </div>
              <div className="text-xs mt-1" style={{ color: getBiasColor(outlet.currentScore) }}>
                {getBiasLabel(outlet.currentScore)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── About View ──────────────────────────────────────────────────────────────

function AboutView() {
  const scoreTiers = [
    { range: '−5 to −3', label: 'Far Left',  color: '#2563eb', desc: 'Heavy progressive framing, emotionally charged language' },
    { range: '−3 to −1', label: 'Left',       color: '#3b82f6', desc: 'Progressive framing, sympathetic to left causes' },
    { range: '−1 to +1', label: 'Center',     color: '#8b5cf6', desc: 'Neutral verbs, balanced sourcing, minimal ideological signals' },
    { range: '+1 to +3', label: 'Right',      color: '#ef4444', desc: 'Conservative framing, sympathetic to right causes' },
    { range: '+3 to +5', label: 'Far Right',  color: '#991b1b', desc: 'Heavy conservative framing, charged language' },
  ]

  return (
    <div className="space-y-8 text-slate-300 leading-relaxed max-w-3xl mx-auto">

      <section>
        <h3 className="text-lg font-bold text-slate-100 mb-3">What Is Spin Detector?</h3>
        <p className="mb-3">
          Spin Detector is an automated media bias tracker that analyzes how 56 major news outlets
          cover the same political stories. Every day, the pipeline fetches hundreds of headlines,
          clusters them by topic, and uses AI to score each headline&apos;s political language on a
          −5 to +5 scale — from Far Left to Far Right, with 0 representing a neutral center.
        </p>
        <p>
          The goal is simple: give readers a concrete, data-driven way to see how language shapes
          political narratives across the media spectrum.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-bold text-slate-100 mb-3">How the Bias Score Works</h3>
        <p className="mb-4">
          Each headline is scored from −5 to +5 based on linguistic signals detected by AI analysis.
          Zero represents neutral, centrist language — negative scores lean left, positive scores lean right:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {scoreTiers.map((tier) => (
            <div key={tier.range} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-mono font-bold" style={{ color: tier.color }}>{tier.range}</span>
                <span className="text-sm font-semibold" style={{ color: tier.color }}>{tier.label}</span>
              </div>
              <p className="text-xs text-slate-500">{tier.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-lg font-bold text-slate-100 mb-3">What Signals We Detect</h3>
        <ul className="list-disc list-inside space-y-2 text-slate-400">
          <li><strong className="text-slate-300">Word choice</strong> — &quot;undocumented&quot; vs &quot;illegal alien&quot;; &quot;gun safety&quot; vs &quot;gun grab&quot;</li>
          <li><strong className="text-slate-300">Verb loading</strong> — &quot;enforcement&quot; (neutral) vs &quot;raids&quot; (left-charged) vs &quot;crackdown&quot; (right)</li>
          <li><strong className="text-slate-300">Victim framing</strong> — who is portrayed as harmed vs threatening</li>
          <li><strong className="text-slate-300">Source trust</strong> — implicit alignment with certain institutions or advocacy groups</li>
          <li><strong className="text-slate-300">Emphasis</strong> — what information leads a headline vs what is omitted</li>
          <li><strong className="text-slate-300">Qualifiers</strong> — &quot;controversial&quot; applied selectively to certain policies</li>
        </ul>
      </section>

      <section>
        <h3 className="text-lg font-bold text-slate-100 mb-3">Claude vs Grok — Model Comparison</h3>
        <p className="mb-3">
          Bias scoring is performed independently by two AI models: Claude (Anthropic) and Grok (xAI).
          Both models receive identical prompts and score headlines without seeing each other&apos;s results.
          The <strong className="text-slate-200">Model Wars</strong> tab shows where they agree and
          where they diverge — a useful check on whether the bias signal is robust or model-dependent.
        </p>
        <p>
          Where Claude and Grok reach similar scores independently, confidence in the rating is higher.
          Wide divergence suggests the framing is ambiguous or that the two models weight different signals.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-bold text-slate-100 mb-3">The Outlets We Track</h3>
        <p className="mb-3">
          We currently track 56 major English-language news outlets across the political spectrum,
          from HuffPost and Vox on the left to Breitbart and The Federalist on the right, with the
          Associated Press and Reuters providing a neutral wire-service baseline in the center.
          Broadcast networks (ABC, NBC, CBS) and commentary outlets (The Atlantic, Reason) round
          out the US picture. Financial coverage spans Bloomberg, Yahoo Finance, MarketWatch, Forbes,
          CNBC, Business Insider, the Financial Times, and the Wall Street Journal.
          US regional papers cover major metros — LA Times, Chicago Tribune, Boston Globe, Houston
          Chronicle, Miami Herald, Tampa Bay Times, Star Tribune, and Charlotte Observer.
          International outlets include BBC, Al Jazeera, The Guardian, The Independent, Sky News,
          Daily Mail, Metro, The Telegraph, The Times (London), Financial Times, CBC News, and
          Times of Israel.
        </p>
      </section>

      <section>
        <h3 className="text-lg font-bold text-slate-100 mb-3">Important Limitations</h3>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <p className="text-amber-300 text-sm leading-relaxed mb-2">
            Bias scores are generated by AI language model analysis and represent computational
            estimates of linguistic patterns only.
          </p>
          <ul className="text-amber-400/80 text-sm space-y-1 list-disc list-inside">
            <li>Scores do not constitute editorial opinion or factual ratings</li>
            <li>Headline-level analysis may not reflect a full article&apos;s content</li>
            <li>Individual scores may reflect topic-specific framing, not a publication&apos;s overall stance</li>
            <li>AI models can have their own biases that affect scoring</li>
            <li>This tool is designed for educational purposes only</li>
          </ul>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-bold text-slate-100 mb-3">Contact</h3>
        <p>
          Questions, feedback, or press inquiries:{' '}
          <a href="mailto:piers@spindetector.com" className="text-blue-400 hover:text-blue-300 underline">
            piers@spindetector.com
          </a>
        </p>
      </section>

    </div>
  )
}

// ─── Model Wars View ─────────────────────────────────────────────────────────

function ModelWarsView({ outlets }: { outlets: OutletScore[] }) {
  type SortKey = 'outlet' | 'claude' | 'grok' | 'diff'
  const [sortBy, setSortBy] = useState<SortKey>('diff')

  const outletsWith = outlets.filter((o) => o.currentScoreGrok !== undefined)

  if (outletsWith.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <div className="text-4xl mb-3">🤖</div>
        <p className="font-semibold text-slate-400 mb-1">No Grok data yet</p>
        <p className="text-sm">
          Add <code className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 text-xs">XAI_API_KEY</code> to your
          environment and run the pipeline to enable Claude vs Grok comparison.
        </p>
      </div>
    )
  }

  const rows = outletsWith.map((o) => ({
    ...o,
    diff: Math.round((o.currentScoreGrok! - o.currentScore) * 10) / 10,
    absDiff: Math.abs(Math.round((o.currentScoreGrok! - o.currentScore) * 10) / 10),
  }))

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === 'outlet') return a.outletName.localeCompare(b.outletName)
    if (sortBy === 'claude') return a.currentScore - b.currentScore
    if (sortBy === 'grok') return a.currentScoreGrok! - b.currentScoreGrok!
    return b.absDiff - a.absDiff // default: most divergent first
  })

  const strongCount = rows.filter((r) => r.absDiff < 0.5).length
  const moderateCount = rows.filter((r) => r.absDiff >= 0.5 && r.absDiff < 1.5).length
  const divergentCount = rows.filter((r) => r.absDiff >= 1.5).length
  const avgDiff = rows.reduce((s, r) => s + r.absDiff, 0) / rows.length

  function SortBtn({ id, label }: { id: SortKey; label: string }) {
    return (
      <button
        onClick={() => setSortBy(id)}
        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
          sortBy === id ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        {label}
      </button>
    )
  }

  const modelWarsShareText = `🤖 Model Wars: do Claude and Grok agree on media bias? They diverge by ${avgDiff.toFixed(2)} pts on average across ${rows.length} outlets — ${divergentCount} disagree sharply. #MediaBias`

  return (
    <div className="space-y-4">
      {/* Share bar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">Claude vs Grok — two AI models scoring the same outlets, independently.</p>
        <ShareOnX url="https://www.spindetector.com" text={modelWarsShareText} label="Share Model Wars" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Avg Divergence</div>
          <div className="text-2xl font-bold font-mono text-slate-100">{avgDiff.toFixed(2)}</div>
          <div className="text-[11px] text-slate-600">pts on 0–10 scale</div>
        </div>
        <div className="bg-slate-900 border border-green-900/40 rounded-xl p-4">
          <div className="text-xs text-green-500 mb-1">● Strong Agreement</div>
          <div className="text-2xl font-bold font-mono text-green-400">{strongCount}</div>
          <div className="text-[11px] text-slate-600">outlets · Δ &lt; 0.5</div>
        </div>
        <div className="bg-slate-900 border border-amber-900/40 rounded-xl p-4">
          <div className="text-xs text-amber-500 mb-1">◐ Moderate Gap</div>
          <div className="text-2xl font-bold font-mono text-amber-400">{moderateCount}</div>
          <div className="text-[11px] text-slate-600">outlets · Δ 0.5–1.5</div>
        </div>
        <div className="bg-slate-900 border border-red-900/40 rounded-xl p-4">
          <div className="text-xs text-red-500 mb-1">◯ Wide Divergence</div>
          <div className="text-2xl font-bold font-mono text-red-400">{divergentCount}</div>
          <div className="text-[11px] text-slate-600">outlets · Δ ≥ 1.5</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Sort controls */}
        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-1 bg-slate-950/50 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mr-2">Sort by</span>
          <SortBtn id="diff" label="Most Divergent" />
          <SortBtn id="claude" label="Claude Score" />
          <SortBtn id="grok" label="Grok Score" />
          <SortBtn id="outlet" label="Outlet A–Z" />
        </div>

        {/* Header */}
        <div className="hidden sm:grid grid-cols-[1.5rem_1fr_5rem_5rem_5rem_5rem] px-4 py-2 border-b border-slate-800 bg-slate-950/30 gap-4 items-center">
          <span />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Outlet</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500 text-center">Claude</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500 text-center">Grok</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 text-center">Δ Diff</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 text-center">Agreement</span>
        </div>

        <div className="divide-y divide-slate-800/60">
          {sorted.map((outlet, i) => {
            const agreeColor = outlet.absDiff < 0.5 ? '#22c55e' : outlet.absDiff < 1.5 ? '#f59e0b' : '#ef4444'
            const agreeLabel = outlet.absDiff < 0.5 ? 'Strong' : outlet.absDiff < 1.5 ? 'Moderate' : 'Wide'
            const diffSign = outlet.diff >= 0 ? '+' : ''
            const diffLabel = outlet.diff > 0 ? 'Grok leans right' : outlet.diff < 0 ? 'Grok leans left' : 'Identical'

            return (
              <div key={outlet.outletId} className="hover:bg-slate-800/30 transition-colors">
                {/* Desktop */}
                <div className="hidden sm:grid grid-cols-[1.5rem_1fr_5rem_5rem_5rem_5rem] px-4 py-3 gap-4 items-center">
                  <span className="text-slate-600 text-sm font-mono text-right">{i + 1}</span>
                  <div>
                    <div className="font-semibold text-sm text-slate-200">{outlet.outletName}</div>
                    <div className="text-[11px] text-slate-500">{outlet.articleCount} articles</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold font-mono" style={{ color: getBiasColor(outlet.currentScore) }}>
                      {fmt(outlet.currentScore)}
                    </div>
                    <div className="text-[10px] text-indigo-400">{getBiasLabel(outlet.currentScore)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold font-mono" style={{ color: getBiasColor(outlet.currentScoreGrok!) }}>
                      {fmt(outlet.currentScoreGrok!)}
                    </div>
                    <div className="text-[10px] text-amber-500">{getBiasLabel(outlet.currentScoreGrok!)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold font-mono tabular-nums" style={{ color: agreeColor }}>
                      {diffSign}{outlet.diff.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-slate-600">{outlet.diff !== 0 ? diffLabel : ''}</div>
                  </div>
                  <div className="text-center">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: agreeColor, backgroundColor: `${agreeColor}20`, border: `1px solid ${agreeColor}40` }}
                    >
                      {agreeLabel}
                    </span>
                  </div>
                </div>

                {/* Mobile */}
                <div className="sm:hidden px-3 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-slate-600 text-xs font-mono mr-2">{i + 1}</span>
                      <span className="font-semibold text-sm text-slate-200">{outlet.outletName}</span>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: agreeColor, backgroundColor: `${agreeColor}20` }}
                    >
                      Δ {diffSign}{outlet.diff.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <div className="text-[10px] text-indigo-400 mb-0.5">Claude</div>
                      <div className="font-bold font-mono text-sm" style={{ color: getBiasColor(outlet.currentScore) }}>
                        {fmt(outlet.currentScore)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-amber-500 mb-0.5">Grok</div>
                      <div className="font-bold font-mono text-sm" style={{ color: getBiasColor(outlet.currentScoreGrok!) }}>
                        {fmt(outlet.currentScoreGrok!)}
                      </div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-[10px] text-slate-600 mb-0.5">Agreement</div>
                      <div className="text-sm font-semibold" style={{ color: agreeColor }}>{agreeLabel}</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Explanation */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-400">About this comparison: </span>
        Claude and Grok independently score the same headlines for political language bias using an identical
        rubric (−5 = Far Left, +5 = Far Right). Clustering is done by Claude; Grok then re-scores each article
        without seeing Claude&apos;s scores. Δ shows how much Grok diverges from Claude — positive means Grok
        rated the outlet more right-leaning.
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────

interface Props {
  initialStories: StoryCluster[]
  initialOutlets: OutletScore[]
  initialStatus: PipelineStatus
}

export default function SpinDetectorApp({ initialStories, initialOutlets, initialStatus }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('battleground')
  const [stories, setStories] = useState<StoryCluster[]>(initialStories)
  const [outlets, setOutlets] = useState<OutletScore[]>(initialOutlets)
  const [status, setStatus] = useState<PipelineStatus>(initialStatus)
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const [storiesRes, outletsRes, statusRes] = await Promise.all([
        fetch('/api/stories/today'),
        fetch('/api/outlets/scores'),
        fetch('/api/pipeline/status'),
      ])
      const [storiesData, outletsData, statusData] = await Promise.all([
        storiesRes.json(),
        outletsRes.json(),
        statusRes.json(),
      ])
      if (storiesData.stories?.length) setStories(storiesData.stories)
      if (outletsData.outlets?.length) setOutlets(outletsData.outlets)
      setStatus(statusData)
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const hasGrokData = outlets.some((o) => o.currentScoreGrok !== undefined)

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'about', label: 'About', icon: 'ℹ️' },
    { id: 'battleground', label: 'Battleground', icon: '⚔️' },
    { id: 'biasboard', label: 'Bias Board', icon: '📊' },
    { id: 'trends', label: '30-Day Trends', icon: '📈' },
    { id: 'modelwars', label: 'Model Wars', icon: '⚖️' },
  ]

  const leftCount = outlets.filter((o) => o.currentScore < 4.5).length   // < −0.5 in display scale
  const rightCount = outlets.filter((o) => o.currentScore > 5.5).length  // > +0.5 in display scale

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-black tracking-tight">
                <span style={{ color: '#3b82f6' }}>SPIN</span>
                <span className="text-slate-400 mx-1.5 font-light">·</span>
                <span style={{ color: '#ef4444' }}>DETECTOR</span>
              </h1>
              {status.dataSource === 'demo' ? (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-widest">
                  Demo
                </span>
              ) : (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/30 uppercase tracking-widest flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              )}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors disabled:opacity-40"
                title="Fetch today's latest headlines"
              >
                {refreshing ? 'Refreshing…' : '↻ Refresh'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Same story. Multiple outlets. Measurable bias.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
            <div className="text-center">
              <div className="text-lg font-bold text-slate-200">{outlets.length}</div>
              <div>outlets</div>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div className="text-center">
              <div className="text-lg font-bold text-slate-200">{stories.length}</div>
              <div>stories today</div>
            </div>
            <div className="w-px h-8 bg-slate-800" />
            <div className="text-center">
              <div className="text-lg font-bold text-blue-400">{leftCount}</div>
              <div>lean left</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">{rightCount}</div>
              <div>lean right</div>
            </div>
          </div>
        </div>
      </header>

      {/* Outlet ticker */}
      <OutletTicker outlets={outlets} />

      {/* Spectrum bar */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="relative">
          <div
            className="h-1.5 rounded-full w-full"
            style={{ background: 'linear-gradient(to right, #1d4ed8, #3b82f6, #8b5cf6, #f59e0b, #ef4444, #991b1b)' }}
          />
          <div className="flex justify-between text-[10px] text-slate-600 mt-1">
            <span>← Far Left</span>
            <span className="hidden sm:inline">Left</span>
            <span className="hidden sm:inline">Lean Left</span>
            <span>Center</span>
            <span className="hidden sm:inline">Lean Right</span>
            <span className="hidden sm:inline">Right</span>
            <span>Far Right →</span>
          </div>
        </div>
      </div>

      {/* Tab navigation — horizontally scrollable on narrow screens */}
      <div className="max-w-5xl mx-auto px-4 overflow-x-auto scrollbar-none">
        <div className="flex gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800 w-fit whitespace-nowrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === 'about' && <AboutView />}
        {activeTab === 'battleground' && <BattlegroundView stories={stories} />}
        {activeTab === 'biasboard' && <BiasBoardView outlets={outlets} hasGrokData={hasGrokData} />}
        {activeTab === 'trends' && <TrendsView outlets={outlets} />}
        {activeTab === 'modelwars' && <ModelWarsView outlets={outlets} />}
      </main>

      {/* Disclaimer footer */}
      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
              Important Disclaimer
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Bias scores are generated by AI language model analysis of article headlines and content framing.
              Scores represent computational estimates of linguistic patterns and do not constitute editorial
              opinion or factual ratings. This tool is designed for educational purposes to help readers recognize
              how language shapes political narratives. Individual article scores may reflect topic-specific framing
              rather than a publication&apos;s overall editorial stance.
            </p>
          </div>
          <div className="mt-4 text-center text-xs text-slate-700 space-x-3">
            <span>Spin Detector</span>
            <span>·</span>
            <a href="/about" className="hover:text-slate-500 transition-colors">About</a>
            <span>·</span>
            <a href="/privacy" className="hover:text-slate-500 transition-colors">Privacy Policy</a>
            <span>·</span>
            <span>Because an informed reader is a free reader</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
