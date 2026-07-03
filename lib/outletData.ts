import { cache } from 'react'
import { isLiveMode, getOutletScores, getOutletTrend } from './db'
import { getWebOutlet, type WebOutlet } from './outlets'
import type { TrendPoint } from './types'

export interface OutletPageData {
  outlet: WebOutlet
  /** Current Claude score (0–10), if live data exists. */
  score?: number
  /** Current Grok score (0–10), if available. */
  grokScore?: number
  articleCount: number
  trend: TrendPoint[]
  live: boolean
}

/**
 * Loads everything a per-outlet SEO page needs, querying Supabase directly with
 * graceful fallback. Never throws — returns null only for an unknown slug, so
 * the page can render meaningful content (expected range + methodology) even
 * before the pipeline has scored the outlet.
 */
// Wrapped in React cache so generateMetadata and the page component share one
// DB round-trip per outlet during a single render.
export const getOutletPageData = cache(async function getOutletPageData(
  slug: string
): Promise<OutletPageData | null> {
  const outlet = getWebOutlet(slug)
  if (!outlet) return null

  let score: number | undefined
  let grokScore: number | undefined
  let articleCount = 0
  let trend: TrendPoint[] = []
  let live = false

  if (isLiveMode()) {
    try {
      const scores = await getOutletScores()
      const match = scores.find((s) => s.outletId === slug)
      if (match) {
        score = match.currentScore
        grokScore = match.currentScoreGrok
        articleCount = match.articleCount
        live = true
      }
    } catch (e) {
      console.error(`Outlet page — scores failed for ${slug}:`, e instanceof Error ? e.message : String(e))
    }
    try {
      trend = await getOutletTrend(slug)
    } catch (e) {
      console.error(`Outlet page — trend failed for ${slug}:`, e instanceof Error ? e.message : String(e))
    }
  }

  return { outlet, score, grokScore, articleCount, trend, live }
})
