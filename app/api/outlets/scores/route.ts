import { NextResponse } from 'next/server'
import { isLiveMode, getOutletScores } from '@/lib/db'
import { OUTLETS } from '@/lib/mockData'
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
  // 1. Try Supabase
  if (isLiveMode()) {
    try {
      const outlets = await getOutletScores()
      if (outlets.length > 0) {
        return NextResponse.json({ outlets, dataSource: 'live' })
      }
    } catch (error) {
      console.error('DB error:', error)
    }
  }

  // 2. Fall back to latest.json committed by GitHub Actions
  const json = readLatestJson()
  if (json?.outlets?.length > 0) {
    return NextResponse.json({ outlets: json.outlets, dataSource: 'live' })
  }

  // 3. Last resort: demo mock data
  return NextResponse.json({ outlets: OUTLETS, dataSource: 'demo' })
}
