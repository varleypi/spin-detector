import { NextResponse } from 'next/server'
import { getPendingCandidates, countPostsToday } from '@/lib/xDb'
import { isAuthorized, composePost } from '@/lib/xQueue'

export const dynamic = 'force-dynamic'

/** GET /api/x/queue — candidates awaiting human approval. Admin-only. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const [candidates, postedToday] = await Promise.all([
      getPendingCandidates(),
      countPostsToday(),
    ])
    const dailyCap = Number(process.env.DAILY_POST_CAP) || 4

    return NextResponse.json({
      candidates: candidates.map((c) => ({ ...c, composed: composePost(c) })),
      postedToday,
      dailyCap,
      capReached: postedToday >= dailyCap,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
