import type { StoryCluster, OutletScore, TrendPoint, PipelineStatus } from './types'

let supabaseClient: ReturnType<typeof createClient> | null = null

function createClient(url: string, key: string) {
  // Dynamic import to avoid build errors when supabase not installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js')
  return createClient(url, key)
}

function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return supabaseClient
}

export function isLiveMode(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
}

export async function getStoriesForDate(date: string): Promise<StoryCluster[]> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('No database configured')

  const { data: clusters, error: clusterError } = await supabase
    .from('story_clusters')
    .select('*')
    .eq('date', date)

  if (clusterError) throw clusterError

  const { data: articles, error: articleError } = await supabase
    .from('articles')
    .select('*')
    .eq('date', date)

  if (articleError) throw articleError

  return clusters.map((cluster: Record<string, unknown>) => ({
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
        biasSignals: a.bias_signals as string[],
        pubDate: a.pub_date as string,
        clusterId: a.cluster_id as string,
      }))
      .sort((a, b) => a.biasScore - b.biasScore),
  }))
}

export async function getOutletScores(): Promise<OutletScore[]> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('No database configured')

  const { data, error } = await supabase
    .from('outlet_daily_scores')
    .select('*')
    .eq('date', new Date().toISOString().split('T')[0])

  if (error) throw error

  return data.map((row: Record<string, unknown>) => ({
    outletId: row.outlet_id as string,
    outletName: row.outlet_name as string,
    abbreviation: row.abbreviation as string,
    currentScore: row.avg_score as number,
    articleCount: row.article_count as number,
    expectedRange: row.expected_range as [number, number],
  }))
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

  if (error) throw error

  return data.map((row: Record<string, unknown>) => ({
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
    .single()

  if (error) throw error

  return {
    lastRun: data?.created_at ?? null,
    articleCount: data?.article_count ?? 0,
    storyCount: data?.story_count ?? 0,
    status: data?.status ?? 'never',
    dataSource: 'live',
  }
}
