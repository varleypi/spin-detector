import { NextRequest, NextResponse } from 'next/server'
import { isLiveMode, getStoriesForDate } from '@/lib/db'
import { MOCK_STORIES } from '@/lib/mockData'

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date')

  if (isLiveMode() && date) {
    try {
      const stories = await getStoriesForDate(date)
      return NextResponse.json({ stories, dataSource: 'live' })
    } catch (error) {
      console.error('DB error, falling back to mock:', error)
    }
  }

  return NextResponse.json({ stories: MOCK_STORIES, dataSource: 'demo' })
}
