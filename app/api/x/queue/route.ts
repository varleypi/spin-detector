import { NextResponse } from 'next/server'
import { getTapQueue, countPostsToday } from '@/lib/xDb'
import { isAuthorized } from '@/lib/xQueue'

export const dynamic = 'force-dynamic'

const INTENT_BASE = 'https://x.com/intent/post'

/**
 * X web-intent link: opens X's composer with the reply pre-filled, for a human
 * to post. Duplicated from pipeline/x/tap.js rather than imported because that
 * file is CommonJS pipeline code and this is the edge-rendered app; the two
 * builds don't share a module graph. Keep them in step — the `in_reply_to`
 * parameter is the load-bearing part.
 */
function intentUrl(text: string, inReplyToTweetId?: string): string {
  const params = new URLSearchParams()
  params.set('text', text)
  if (inReplyToTweetId) params.set('in_reply_to', inReplyToTweetId)
  return `${INTENT_BASE}?${params.toString()}`
}

/**
 * GET /api/x/queue — replies composed and waiting for a tap. Admin-only.
 *
 * Returns them ready to render: the composer link, the parent link, and how old
 * the parent is, so the page needs no X-specific logic of its own.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const [candidates, postedToday] = await Promise.all([getTapQueue(), countPostsToday()])
    const dailyCap = Number(process.env.DAILY_POST_CAP) || 8

    return NextResponse.json({
      candidates: candidates.map((c) => {
        const text = c.composed_text || ''
        return {
          id: c.id,
          tweetId: c.tweet_id,
          authorHandle: c.author_handle,
          authorName: c.author_name,
          authorFollowers: c.author_followers,
          parentText: c.text,
          parentUrl: c.tweet_url,
          composed: text,
          format: c.reply_format,
          clusterId: c.cluster_id,
          biasScore: c.bias_score,
          ageMinutes: c.age_minutes,
          createdAt: c.created_at,
          intentUrl: intentUrl(text, c.tweet_id),
        }
      }),
      postedToday,
      dailyCap,
      capReached: postedToday >= dailyCap,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
