import { NextRequest, NextResponse } from 'next/server'
import { isLiveMode, getOutletTrend } from '@/lib/db'
import { OUTLET_TRENDS } from '@/lib/mockData'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const outletId = params.id

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
