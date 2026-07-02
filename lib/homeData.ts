import fs from 'fs'
import path from 'path'
import { isLiveMode, getStoriesForDate, getOutletScores, getPipelineStatus } from './db'
import { MOCK_STORIES, OUTLETS } from './mockData'
import type { StoryCluster, OutletScore, PipelineStatus } from './types'

/**
 * Server-side data loader for the homepage.
 *
 * Previously the homepage server component fetched its OWN API routes over HTTP
 * (`fetch(`${baseUrl}/api/stories/today`)` …). That added a network round-trip
 * on every render and made the page depend on NEXT_PUBLIC_BASE_URL being correct
 * and the API not cold-starting — an intermittent-failure risk during crawls.
 *
 * This queries Supabase directly and mirrors the exact three-tier fallback used
 * by the API routes, so behaviour is unchanged but there is no self-HTTP hop:
 *   1. Supabase (live)
 *   2. public/data/latest.json committed by the GitHub Actions pipeline
 *   3. demo mock data
 * Each loader catches its own errors, so getHomeData never throws.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readLatestJson(): any | null {
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'latest.json')
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadStories(today: string, json: any): Promise<StoryCluster[]> {
  if (isLiveMode()) {
    try {
      const stories = await getStoriesForDate(today)
      if (stories.length > 0) return stories
    } catch (e) {
      console.error('Home data — stories query failed:', msg(e))
    }
  }
  if (json?.stories?.length > 0) return json.stories
  return MOCK_STORIES
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadOutlets(json: any): Promise<OutletScore[]> {
  if (isLiveMode()) {
    try {
      const outlets = await getOutletScores()
      if (outlets.length > 0) return outlets
    } catch (e) {
      console.error('Home data — outlets query failed:', msg(e))
    }
  }
  if (json?.outlets?.length > 0) return json.outlets
  return OUTLETS
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadStatus(json: any): Promise<PipelineStatus> {
  if (isLiveMode()) {
    try {
      return await getPipelineStatus()
    } catch (e) {
      console.error('Home data — status query failed:', msg(e))
    }
  }
  if (json?.stories?.length > 0) {
    return {
      lastRun: json.generatedAt ?? null,
      articleCount: json.articleCount ?? 0,
      storyCount: json.storyCount ?? json.stories.length,
      status: 'success',
      dataSource: 'live',
    }
  }
  return {
    lastRun: null,
    articleCount: 0,
    storyCount: MOCK_STORIES.length,
    status: 'never',
    dataSource: 'demo',
  }
}

export async function getHomeData(): Promise<{
  stories: StoryCluster[]
  outlets: OutletScore[]
  status: PipelineStatus
}> {
  const today = new Date().toISOString().split('T')[0]
  const json = readLatestJson()

  const [stories, outlets, status] = await Promise.all([
    loadStories(today, json),
    loadOutlets(json),
    loadStatus(json),
  ])

  return { stories, outlets, status }
}
