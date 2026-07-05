import type { StoryCluster, OutletScore, TrendPoint, PipelineStatus } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabaseClient: any = null

function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js')
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  }
  return supabaseClient
}

export function isLiveMode(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export async function getStoriesForDate(date: string): Promise<StoryCluster[]> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('No database configured')

  const [{ data: clusters, error: ce }, { data: articles, error: ae }] = await Promise.all([
    supabase.from('story_clusters').select('*').eq('date', date).order('cluster_id'),
    supabase.from('articles').select('*').eq('date', date),
  ])

  if (ce) throw new Error(`story_clusters query failed: ${ce.message}`)
  if (ae) throw new Error(`articles query failed: ${ae.message}`)

  return (clusters ?? []).map((cluster: Record<string, unknown>) => ({
    id: cluster.cluster_id as string,
    topicLabel: cluster.topic_label as string,
    date: cluster.date as string,
    articles: (articles as Record<string, unknown>[])
      .filter((a) => a.cluster_id === cluster.cluster_id)
      .map((a) => ({
        id: a.id as string,
        outletId: a.outlet_id as string,
        outletName: a.outlet_name as string,
        headline: a.headline as string,
        url: a.url as string,
        biasScore: a.bias_score as number,
        biasSignals: (a.bias_signals as string[]) ?? [],
        biasScoreGrok: a.bias_score_grok != null ? (a.bias_score_grok as number) : undefined,
        biasSignalsGrok: a.bias_signals_grok != null ? (a.bias_signals_grok as string[]) : undefined,
        pubDate: a.pub_date as string,
        clusterId: a.cluster_id as string,
      }))
      .sort((a, b) => a.biasScore - b.biasScore),
  }))
}

/**
 * Lightweight list of recent story clusters (id + date only) for the sitemap.
 * No article payload — just enough to build /story/<date>/<id> URLs.
 */
export async function getRecentStoryRefs(days = 10): Promise<{ id: string; date: string }[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('story_clusters')
    .select('cluster_id, date')
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (error) throw new Error(`recent story refs query failed: ${error.message}`)

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.cluster_id as string,
    date: r.date as string,
  }))
}

export async function getOutletScores(): Promise<OutletScore[]> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('No database configured')

  // Fetch all daily scores from the last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data, error } = await supabase
    .from('outlet_daily_scores')
    .select('*')
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])

  if (error) throw new Error(`outlet_daily_scores query failed: ${error.message}`)

  // Group rows by outlet and compute 30-day averages in JS
  const groups: Record<string, Record<string, unknown>[]> = {}
  for (const row of (data ?? [])) {
    const id = row.outlet_id as string
    if (!groups[id]) groups[id] = []
    groups[id].push(row)
  }

  if (Object.keys(groups).length === 0) throw new Error('No outlet score data found')

  return Object.entries(groups)
    .map(([outletId, rows]) => {
      const avgScore = rows.reduce((sum, r) => sum + (r.avg_score as number), 0) / rows.length
      const totalArticles = rows.reduce((sum, r) => sum + (r.article_count as number), 0)
      const sample = rows[0]

      // Grok average — only from rows that have a Grok score
      const grokRows = rows.filter((r) => r.avg_score_grok != null)
      const avgGrokScore = grokRows.length > 0
        ? grokRows.reduce((sum, r) => sum + (r.avg_score_grok as number), 0) / grokRows.length
        : undefined

      return {
        outletId,
        outletName: sample.outlet_name as string,
        abbreviation: sample.abbreviation as string,
        currentScore: Math.round(avgScore * 100) / 100,
        currentScoreGrok: avgGrokScore !== undefined ? Math.round(avgGrokScore * 100) / 100 : undefined,
        articleCount: totalArticles,
        expectedRange: sample.expected_range as [number, number],
      }
    })
    .sort((a, b) => a.currentScore - b.currentScore)
}

export async function getOutletTrend(outletId: string): Promise<TrendPoint[]> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('No database configured')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data, error } = await supabase
    .from('outlet_daily_scores')
    .select('date, avg_score')
    .eq('outlet_id', outletId)
    .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (error) throw new Error(`trend query failed: ${error.message}`)

  return (data ?? []).map((row: Record<string, unknown>) => ({
    date: row.date as string,
    score: row.avg_score as number,
  }))
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('No database configured')

  const { data, error } = await supabase
    .from('pipeline_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`pipeline_runs query failed: ${error.message}`)

  return {
    lastRun: (data?.created_at as string) ?? null,
    articleCount: (data?.article_count as number) ?? 0,
    storyCount: (data?.story_count as number) ?? 0,
    status: (data?.status as 'success' | 'error' | 'never') ?? 'never',
    dataSource: 'live',
  }
}
