import { cache } from 'react'
import fs from 'fs'
import path from 'path'
import { isLiveMode, getStoriesForDate } from './db'
import type { StoryCluster } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SLUG_RE = /^[a-z0-9-]{1,80}$/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readLatestJson(): any | null {
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'latest.json')
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Fetch a single story cluster by its date + slug (clusterId). Shared links use
 * the date so they stay pinned to that exact story forever, even if a later day
 * reuses the same clusterId. Never throws; returns null for bad input or a
 * missing story so the page can 404 cleanly. Wrapped in React cache so the page
 * and its OG image share one DB round-trip.
 */
export const getStoryCluster = cache(async function getStoryCluster(
  date: string,
  slug: string
): Promise<StoryCluster | null> {
  if (!DATE_RE.test(date) || !SLUG_RE.test(slug)) return null

  if (isLiveMode()) {
    try {
      const stories = await getStoriesForDate(date)
      const match = stories.find((s) => s.id === slug)
      if (match) return match
    } catch (e) {
      console.error('Story page — query failed:', e instanceof Error ? e.message : String(e))
    }
  }

  const json = readLatestJson()
  if (json?.stories) {
    const match = (json.stories as StoryCluster[]).find(
      (s) => s.id === slug && (!s.date || s.date === date)
    )
    if (match) return match
  }

  return null
})

/** min/max scored articles and the spread for a cluster. */
export function clusterExtremes(cluster: StoryCluster) {
  const arts = cluster.articles
  let lo = arts[0]
  let hi = arts[0]
  for (const a of arts) {
    if (a.biasScore < lo.biasScore) lo = a
    if (a.biasScore > hi.biasScore) hi = a
  }
  return { lo, hi, spread: hi.biasScore - lo.biasScore }
}
