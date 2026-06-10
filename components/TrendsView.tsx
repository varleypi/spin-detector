'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { OutletScore, TrendPoint } from '@/lib/types'

type TrendData = Record<string, TrendPoint[]>

function getOutletLineColor(outletId: string): string {
  const colors: Record<string, string> = {
    msnbc: '#3b82f6', cnn: '#60a5fa', npr: '#818cf8', nytimes: '#6366f1',
    washpost: '#7c3aed', aljazeera: '#a78bfa', bbc: '#d97706', politico: '#f59e0b',
    nypost: '#f97316', foxnews: '#ef4444', dailycaller: '#dc2626', breitbart: '#991b1b',
  }
  return colors[outletId] ?? '#94a3b8'
}

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

interface Props {
  outlets: OutletScore[]
}

export default function TrendsView({ outlets }: Props) {
  const [selectedOutlets, setSelectedOutlets] = useState<Set<string>>(
    new Set(['msnbc', 'cnn', 'bbc', 'foxnews', 'breitbart'])
  )
  const [trendData, setTrendData] = useState<TrendData>({})
  const [loading, setLoading] = useState(false)

  const fetchTrends = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/outlets/trends')
      const data = await res.json()
      const result: TrendData = {}
      for (const { outletId, trend } of data.trends) {
        result[outletId] = trend
      }
      setTrendData(result)
    } catch {
      // trends unavailable
    }
    setLoading(false)
  }, [])

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
              <ReferenceLine
                y={5}
                stroke="#475569"
                strokeDasharray="4 4"
                label={{ value: 'CENTER', fill: '#475569', fontSize: 10 }}
              />
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
