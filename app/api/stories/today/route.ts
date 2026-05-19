import { NextResponse } from 'next/server'
import { isLiveMode, getStoriesForDate } from '@/lib/db'
import { MOCK_STORIES } from '@/lib/mockData'
import fs from 'fs'
import path from 'path'

function readLatestJson() {
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'latest.json')
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

export async function GET() {
  const today = new Date().toISOString().split('T')[0]

  // 1. Try Supabase
  if (isLiveMode()) {
    try {
      const stories = await getStoriesForDate(today)
      if (stories.length > 0) {
        return NextResponse.json({ stories, dataSource: 'live' })
      }
    } catch (error) {
      console.error('DB error:', error)
    }
  }

  // 2. Fall back to latest.json committed by GitHub Actions
  const json = readLatestJson()
  if (json?.stories?.length > 0) {
    return NextResponse.json({ stories: json.stories, dataSource: 'live' })
  }

  // 3. Last resort: demo mock data
  return NextResponse.json({ stories: MOCK_STORIES, dataSource: 'demo' })
}
