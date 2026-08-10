import { NextResponse } from 'next/server'
import { getCandidate, setCandidateStatus, recordPost, countPostsToday } from '@/lib/xDb'
import { isAuthorized, MAX_TWEET } from '@/lib/xQueue'

export const dynamic = 'force-dynamic'

/**
 * POST /api/x/post — record that a composed reply was published by hand.
 *
 * This route used to publish through the X API. It no longer can: the API
 * refuses to reply to anyone who has not mentioned us, on every self-serve tier
 * (see pipeline/x/tap.js for the exact error and the evidence). Replies are now
 * posted by a human tapping the pre-filled composer, so this route's job is
 * bookkeeping — mark the candidate posted and write the x_posts row that the
 * daily/per-parent caps and the digest are computed from.
 *
 * Body: { id: string, tweetId?: string }
 *   tweetId — optional. Paste the URL or id of the reply you posted and metrics
 *             can be tied to it later; without it the row is still recorded so
 *             the caps stay honest.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { id?: string; tweetId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const candidate = await getCandidate(body.id)
  if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 })
  if (candidate.status !== 'ready_to_tap') {
    return NextResponse.json(
      { error: `candidate is '${candidate.status}', not ready_to_tap` },
      { status: 409 },
    )
  }

  const text = (candidate.composed_text || '').trim()
  if (!text) return NextResponse.json({ error: 'candidate has no composed text' }, { status: 400 })
  if (text.length > MAX_TWEET) {
    return NextResponse.json(
      { error: `composed text is ${text.length} chars (max ${MAX_TWEET})` },
      { status: 400 },
    )
  }

  // Accept a pasted URL or a bare id — whatever is quickest to grab on a phone.
  const tweetId = extractTweetId(body.tweetId)

  try {
    await recordPost({
      candidate_id: candidate.id,
      // x_posts.tweet_id is NOT NULL and unique; without a real id, key the row
      // on the candidate so the record still exists and the caps still count.
      tweet_id: tweetId || `manual-${candidate.id}`,
      format: candidate.reply_format || 'manual',
      image_used: false,
      text,
      reply_to_tweet_id: candidate.tweet_id ?? null,
      reply_to_handle: candidate.author_handle,
      reply_to_url: candidate.tweet_url,
      cluster_id: candidate.cluster_id ?? null,
      cost_usd: 0,
    })
    await setCandidateStatus(
      candidate.id,
      'posted',
      tweetId ? undefined : 'posted by hand (no id recorded)',
    )

    const postedToday = await countPostsToday()
    return NextResponse.json({ ok: true, tweetId: tweetId || null, postedToday })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: `could not record post: ${message}` }, { status: 500 })
  }
}

/** Pull the status id out of a pasted X URL, or pass through a bare numeric id. */
function extractTweetId(input?: string): string | null {
  const raw = String(input || '').trim()
  if (!raw) return null
  const m = raw.match(/status(?:es)?\/(\d+)/)
  if (m) return m[1]
  return /^\d+$/.test(raw) ? raw : null
}
