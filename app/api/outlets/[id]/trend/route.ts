import { NextRequest, NextResponse } from 'next/server'
import { isLiveMode, getOutletTrend } from '@/lib/db'
import { OUTLET_TRENDS } from '@/lib/mockData'

const OUTLET_ID_RE = /^[a-z0-9]{1,40}$/

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const outletId = params.id

  if (!OUTLET_ID_RE.test(outletId)) {
    return NextResponse.json({ error: 'Invalid outlet id' }, { status: 400 })
  }

  if (isLiveMode()) {
    try {
      const trend = await getOutletTrend(outletId)
      return NextResponse.json({ outletId, trend, dataSource: 'live' })
    } catch (error) {
      console.error('DB error, falling back to mock:', error)
    }
  }

  const trend = OUTLET_TRENDS[outletId] ?? []
  return NextResponse.json({ outletId, trend, dataSource: 'demo' })
}
