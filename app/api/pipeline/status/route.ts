import { NextResponse } from 'next/server'
import { isLiveMode, getPipelineStatus } from '@/lib/db'

export async function GET() {
  const liveMode = isLiveMode()

  if (liveMode) {
    try {
      const status = await getPipelineStatus()
      return NextResponse.json(status)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('DB error:', message)
      return NextResponse.json({
        lastRun: null,
        articleCount: 0,
        storyCount: 0,
        status: 'error',
        dataSource: 'live',
        error: message,
      })
    }
  }

  return NextResponse.json({
    lastRun: null,
    articleCount: 0,
    storyCount: 0,
    status: 'never',
    dataSource: 'demo',
    debug: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  })
}
