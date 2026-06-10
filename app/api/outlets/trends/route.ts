import { NextResponse } from 'next/server'
import { isLiveMode, getOutletTrend } from '@/lib/db'
import { OUTLETS_CONFIG } from '@/lib/outlets'
import { OUTLET_TRENDS } from '@/lib/mockData'

export async function GET() {
  if (isLiveMode()) {
    try {
      const trends = await Promise.all(
        OUTLETS_CONFIG.map(async (outlet) => ({
          outletId: outlet.id,
          trend: await getOutletTrend(outlet.id),
        }))
      )
      return NextResponse.json({ trends, dataSource: 'live' })
    } catch (error) {
      console.error('DB error fetching trends:', error)
    }
  }

  const trends = OUTLETS_CONFIG.map(o => ({
    outletId: o.id,
    trend: OUTLET_TRENDS[o.id] ?? [],
  }))
  return NextResponse.json({ trends, dataSource: 'demo' })
}
