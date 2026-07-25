import { NextResponse } from 'next/server'
import { getCandidate, setCandidateStatus, recordPost, countPostsToday } from '@/lib/xDb'
import { isAuthorized, composePost, MAX_TWEET, SITE_URL } from '@/lib/xQueue'

export const dynamic = 'force-dynamic'

const X_ENV = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']

/**
 * POST /api/x/post — publish an approved candidate to X. Admin-only.
 *
 * Body: { id: string, text?: string, includeLink?: boolean }
 *   text        — optional human-edited override of the composed post
 *   includeLink — post the site link as a SELF-REPLY (never in the body; X
 *                 throttles reach on posts containing external links)
 *
 * This is the only place in the system that publishes publicly. Every guard
 * here is deliberate: auth, daily cap, status check, length check.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const missingEnv = X_ENV.filter((k) => !process.env[k])
  if (missingEnv.length > 0) {
    return NextResponse.json(
      { error: `X credentials not configured: missing ${missingEnv.join(', ')}` },
      { status: 500 },
    )
  }

  let body: { id?: string; text?: string; includeLink?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // ── Guard: daily cap ────────────────────────────────────────────────────────
  const dailyCap = Number(process.env.DAILY_POST_CAP) || 4
  const postedToday = await countPostsToday()
  if (postedToday >= dailyCap) {
    return NextResponse.json(
      { error: `daily post cap reached (${postedToday}/${dailyCap})` },
      { status: 429 },
    )
  }

  // ── Guard: candidate must still be awaiting review ──────────────────────────
  const candidate = await getCandidate(body.id)
  if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 })
  if (candidate.status !== 'pending_review') {
    return NextResponse.json(
      { error: `candidate is '${candidate.status}', not pending_review` },
      { status: 409 },
    )
  }

  // ── Guard: length ───────────────────────────────────────────────────────────
  const text = (body.text?.trim() || composePost(candidate)).trim()
  if (!text) return NextResponse.json({ error: 'post text is empty' }, { status: 400 })
  if (text.length > MAX_TWEET) {
    return NextResponse.json(
      { error: `post is ${text.length} chars (max ${MAX_TWEET})` },
      { status: 400 },
    )
  }

  // ── Publish ─────────────────────────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TwitterApi } = require('twitter-api-v2')
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_SECRET,
    })

    const res = await client.v2.tweet(text)
    const tweetId = res?.data?.id
    if (!tweetId) throw new Error('X returned no tweet id')

    // Link goes in a self-reply so the scored post itself stays link-free.
    let replyTweetId: string | null = null
    if (body.includeLink) {
      try {
        const reply = await client.v2.tweet(
          `Full multi-outlet breakdown 👇\n${SITE_URL}`,
          { reply: { in_reply_to_tweet_id: tweetId } },
        )
        replyTweetId = reply?.data?.id ?? null
      } catch (err) {
        // Main post is live — a failed reply must not fail the request.
        console.warn('link self-reply failed:', err instanceof Error ? err.message : err)
      }
    }

    await recordPost({
      candidate_id: candidate.id,
      tweet_id: tweetId,
      format: 'original',
      image_used: false,
      text,
      reply_tweet_id: replyTweetId,
    })
    await setCandidateStatus(candidate.id, 'posted')

    return NextResponse.json({
      ok: true,
      tweetId,
      replyTweetId,
      url: `https://x.com/i/status/${tweetId}`,
      postedToday: postedToday + 1,
      dailyCap,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    // Leave status as pending_review so it can be retried.
    return NextResponse.json({ error: `X post failed: ${message}` }, { status: 502 })
  }
}
