import { NextResponse } from 'next/server'
import { isLiveMode, getPipelineStatus } from '@/lib/db'

export async function GET() {
  if (isLiveMode()) {
    try {
      const status = await getPipelineStatus()
      return NextResponse.json(status)
    } catch (error) {
      console.error('DB error:', error)
    }
  }

  return NextResponse.json({
    lastRun: null,
    articleCount: 0,
    storyCount: 0,
    status: 'never',
    dataSource: 'demo',
  })
}
