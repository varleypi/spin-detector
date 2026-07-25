/**
 * Server-only Supabase access for the X queue.
 *
 * Uses the SERVICE key: x_candidates has no public-read policy (see
 * supabase/x_schema.sql), so the anon client used by lib/db.ts cannot see it.
 * Never import this from a client component.
 */

import type { XCandidate } from './xQueue'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serviceClient: any = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getServiceClient(): any {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null
  if (!serviceClient) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js')
    serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  }
  return serviceClient
}

export async function getPendingCandidates(): Promise<XCandidate[]> {
  const supabase = getServiceClient()
  if (!supabase) throw new Error('Supabase service credentials not configured')
  const { data, error } = await supabase
    .from('x_candidates')
    .select('*')
    .eq('status', 'pending_review')
    .order('prefilter_score', { ascending: false })
  if (error) throw new Error(`x_candidates query failed: ${error.message}`)
  return (data ?? []) as XCandidate[]
}

export async function getCandidate(id: string): Promise<XCandidate | null> {
  const supabase = getServiceClient()
  if (!supabase) throw new Error('Supabase service credentials not configured')
  const { data, error } = await supabase.from('x_candidates').select('*').eq('id', id).single()
  if (error) return null
  return data as XCandidate
}

export async function setCandidateStatus(id: string, status: string, note?: string) {
  const supabase = getServiceClient()
  if (!supabase) throw new Error('Supabase service credentials not configured')
  const patch: Record<string, unknown> = { status }
  if (note !== undefined) patch.status_note = note
  const { error } = await supabase.from('x_candidates').update(patch).eq('id', id)
  if (error) throw new Error(`status update failed: ${error.message}`)
}

/** How many posts we've published today — enforces DAILY_POST_CAP. */
export async function countPostsToday(): Promise<number> {
  const supabase = getServiceClient()
  if (!supabase) return 0
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { count, error } = await supabase
    .from('x_posts')
    .select('id', { count: 'exact', head: true })
    .gte('posted_at', since.toISOString())
  if (error) return 0
  return count ?? 0
}

export async function recordPost(row: {
  candidate_id: string
  tweet_id: string
  format: string
  image_used: boolean
  text: string
  reply_tweet_id?: string | null
}) {
  const supabase = getServiceClient()
  if (!supabase) throw new Error('Supabase service credentials not configured')
  const { error } = await supabase.from('x_posts').insert(row)
  if (error) throw new Error(`x_posts insert failed: ${error.message}`)
}
