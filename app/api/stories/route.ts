import { NextRequest, NextResponse } from 'next/server'
import { isLiveMode, getStoriesForDate } from '@/lib/db'
import { MOCK_STORIES } from '@/lib/mockData'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('date')
  const date = raw && DATE_RE.test(raw) ? raw : null

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
