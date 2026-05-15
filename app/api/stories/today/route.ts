import { NextResponse } from 'next/server'
import { isLiveMode, getStoriesForDate } from '@/lib/db'
import { MOCK_STORIES } from '@/lib/mockData'

export async function GET() {
  if (isLiveMode()) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const stories = await getStoriesForDate(today)
      return NextResponse.json({ stories, dataSource: 'live' })
    } catch (error) {
      console.error('DB error, falling back to mock:', error)
    }
  }
  return NextResponse.json({ stories: MOCK_STORIES, dataSource: 'demo' })
}
