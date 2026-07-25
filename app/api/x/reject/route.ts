import { NextResponse } from 'next/server'
import { getCandidate, setCandidateStatus } from '@/lib/xDb'
import { isAuthorized } from '@/lib/xQueue'

export const dynamic = 'force-dynamic'

/**
 * POST /api/x/reject — dismiss a candidate without posting. Admin-only.
 * Body: { id: string, reason?: string }
 * Sets status='rejected'; the row is kept for audit, never deleted.
 */
export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { id?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const candidate = await getCandidate(body.id)
  if (!candidate) return NextResponse.json({ error: 'candidate not found' }, { status: 404 })

  try {
    await setCandidateStatus(candidate.id, 'rejected', body.reason || 'rejected by reviewer')
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
