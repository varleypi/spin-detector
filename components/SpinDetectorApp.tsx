'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { StoryCluster, OutletScore, TrendPoint, PipelineStatus } from '@/lib/types'

type Tab = 'battleground' | 'biasboard' | 'trends'

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

function getOutletLineColor(outletId: string): string {
  const colors: Record<string, string> = {
    msnbc: '#3b82f6',
    guardian: '#005689',
    cnn: '#60a5fa',
    cbsnews: '#004F9F',
    washpost: '#7c3aed',
    nytimes: '#6366f1',
    npr: '#818cf8',
    aljazeera: '#a78bfa',
    bbc: '#d97706',
    economist: '#E3120B',
    cnbc: '#005594',
    politico: '#f59e0b',
    newsweek: '#CC0000',
    forbes: '#C8102E',
    wsj: '#004785',
    nypost: '#f97316',
    foxnews: '#ef4444',
    washexaminer: '#1a3a5c',
    dailycaller: '#dc2626',
    breitbart: '#991b1b',
    thefreepress: '#0d9488',
  }
  return colors[outletId] ?? '#94a3b8'
}

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
              <span className="font-mono tabular-nums" style={{ color }}>{outlet.currentScore.toFixed(1)}</span>
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
          {score.toFixed(1)}
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
        <span>← LEFT</span>
        <span className="font-semibold" style={{ color }}>{getBiasLabel(score)}</span>
        <span>RIGHT →</span>
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

function StoryCard({ cluster }: { cluster: StoryCluster }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...cluster.articles].sort((a, b) => a.biasScore - b.biasScore)
  const minScore = sorted[0]?.biasScore ?? 5
  const maxScore = sorted[sorted.length - 1]?.biasScore ?? 5
  const spread = maxScore - minScore

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-colors">
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
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition-colors text-xs mt-0.5"
        >
          {expanded ? 'Collapse ↑' : 'Expand ↓'}
        </button>
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
            <div className="flex items-start gap-3">
              <OutletBadge outlet={article.outletName} score={article.biasScore} />
              <div className="flex-1 min-w-0">
                <a
                  href={article.url}
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
                        <span className="text-slate-600 mt-px">›</span>
                        <span>{signal}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <BiasBar score={article.biasScore} compact />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Battleground View ────────────────────────────────────────────────────────

function BattlegroundView({ stories }: { stories: StoryCluster[] }) {
  if (stories.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <div className="text-4xl mb-3">📡</div>
        <p>No stories yet. Run the pipeline to fetch today&apos;s headlines.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {stories.map((cluster) => (
        <StoryCard key={cluster.id} cluster={cluster} />
      ))}
    </div>
  )
}

// ─── Bias Board ───────────────────────────────────────────────────────────────

function BiasBoardView({ outlets }: { outlets: OutletScore[] }) {
  const sorted = [...outlets].sort((a, b) => a.currentScore - b.currentScore)

  return (
    <div className="space-y-6">
      {/* Spectrum visual */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
          Political Spectrum Placement
        </h3>
        <div className="relative">
          <div
            className="h-3 rounded-full w-full"
            style={{ background: 'linear-gradient(to right, #1d4ed8, #6366f1, #8b5cf6, #a855f7, #f59e0b, #ef4444, #991b1b)' }}
          />
          {/* Labels */}
          <div className="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
            <span>Far Left (0)</span>
            <span>Left (2-3)</span>
            <span>Center (5)</span>
            <span>Right (7-8)</span>
            <span>Far Right (10)</span>
          </div>
          {/* Outlet dots */}
          <div className="relative mt-3 h-8">
            {sorted.map((outlet, i) => {
              const pct = (outlet.currentScore / 10) * 100
              const row = i % 2
              return (
                <div
                  key={outlet.outletId}
                  className="absolute flex flex-col items-center group"
                  style={{ left: `${pct}%`, transform: 'translateX(-50%)', top: row === 0 ? 0 : 16 }}
                >
                  <div
                    className="text-[9px] font-bold px-1 py-0.5 rounded whitespace-nowrap"
                    style={{
                      color: getBiasColor(outlet.currentScore),
                      backgroundColor: `${getBiasColor(outlet.currentScore)}20`,
                      border: `1px solid ${getBiasColor(outlet.currentScore)}40`,
                    }}
                  >
                    {outlet.abbreviation}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sorted table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Outlet Rankings — 30-Day Rolling Average
          </h3>
        </div>
        <div className="divide-y divide-slate-800/60">
          {sorted.map((outlet, rank) => (
            <div key={outlet.outletId} className="px-4 py-3 flex items-center gap-4">
              <span className="text-slate-600 text-sm font-mono w-5 text-right flex-shrink-0">
                {rank + 1}
              </span>
              <div className="w-24 flex-shrink-0">
                <div className="font-semibold text-sm text-slate-200">{outlet.outletName}</div>
                <div className="text-[11px] text-slate-500">{outlet.articleCount} articles (30d)</div>
              </div>
              <div className="flex-1">
                <BiasBar score={outlet.currentScore} />
              </div>
              <div className="flex-shrink-0 text-right">
                <div
                  className="text-lg font-bold font-mono tabular-nums"
                  style={{ color: getBiasColor(outlet.currentScore) }}
                >
                  {outlet.currentScore.toFixed(1)}
                </div>
                <div className="text-[11px]" style={{ color: getBiasColor(outlet.currentScore) }}>
                  {getBiasLabel(outlet.currentScore)}
                </div>
              </div>
              <div className="flex-shrink-0 text-xs text-slate-600 w-20 text-right">
                exp. {outlet.expectedRange[0]}–{outlet.expectedRange[1]}
              </div>
            </div>
          ))}
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
    new Set(['msnbc', 'cnn', 'bbc', 'foxnews', 'breitbart'])
  )
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

  // Merge all trend data into chart format
  const allDates = Object.values(trendData)[0]?.map((p) => p.date) ?? []
  const chartData = allDates.map((date) => {
    const point: Record<string, number | string> = { date: date.slice(5) }
    for (const [outletId, points] of Object.entries(trendData)) {
      const match = points.find((p) => p.date === date)
      if (match) point[outletId] = match.score
    }
    return point
  })

  const selectedList = outlets.filter((o) => selectedOutlets.has(o.outletId))

  return (
    <div className="space-y-4">
      {/* Outlet selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
          Select Outlets to Compare
        </div>
        <div className="flex flex-wrap gap-2">
          {outlets.map((outlet) => {
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
                domain={[0, 10]}
                ticks={[0, 2, 4, 5, 6, 8, 10]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <ReferenceLine y={5} stroke="#475569" strokeDasharray="4 4" label={{ value: 'CENTER', fill: '#475569', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                itemStyle={{ fontSize: 12 }}
                formatter={(value: number, name: string) => {
                  const outlet = outlets.find((o) => o.outletId === name)
                  return [value.toFixed(1), outlet?.outletName ?? name]
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
                {outlet.currentScore.toFixed(1)}
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

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'battleground', label: 'Battleground', icon: '⚔️' },
    { id: 'biasboard', label: 'Bias Board', icon: '📊' },
    { id: 'trends', label: '30-Day Trends', icon: '📈' },
  ]

  const leftCount = outlets.filter((o) => o.currentScore < 4.5).length
  const rightCount = outlets.filter((o) => o.currentScore > 5.5).length

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
            <span>Left</span>
            <span>Lean Left</span>
            <span>Center</span>
            <span>Lean Right</span>
            <span>Right</span>
            <span>Far Right →</span>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
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
        {activeTab === 'battleground' && <BattlegroundView stories={stories} />}
        {activeTab === 'biasboard' && <BiasBoardView outlets={outlets} />}
        {activeTab === 'trends' && <TrendsView outlets={outlets} />}
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
