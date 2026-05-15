import { NextResponse } from 'next/server'
import { isLiveMode, getOutletScores } from '@/lib/db'
import { OUTLETS } from '@/lib/mockData'

export async function GET() {
  if (isLiveMode()) {
    try {
      const outlets = await getOutletScores()
      return NextResponse.json({ outlets, dataSource: 'live' })
    } catch (error) {
      console.error('DB error, falling back to mock:', error)
    }
  }
  return NextResponse.json({ outlets: OUTLETS, dataSource: 'demo' })
}
