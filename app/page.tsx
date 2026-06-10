import SpinDetectorApp from '@/components/SpinDetectorApp'
import { MOCK_STORIES, OUTLETS } from '@/lib/mockData'
import { isLiveMode, getStoriesForDate, getOutletScores, getPipelineStatus } from '@/lib/db'
import type { PipelineStatus } from '@/lib/types'

async function fetchData() {
  if (isLiveMode()) {
    try {
      const today = new Date().toISOString().split('T')[0]
      const [stories, outlets, status] = await Promise.all([
        getStoriesForDate(today),
        getOutletScores(),
        getPipelineStatus(),
      ])
      return { stories, outlets, status }
    } catch {
      // Fall through to mock data
    }
  }

  return {
    stories: MOCK_STORIES,
    outlets: OUTLETS,
    status: {
      lastRun: null,
      articleCount: 0,
      storyCount: MOCK_STORIES.length,
      status: 'never' as const,
      dataSource: 'demo' as const,
    } satisfies PipelineStatus,
  }
}

export default async function Home() {
  const { stories, outlets, status } = await fetchData()

  return (
    <SpinDetectorApp
      initialStories={stories}
      initialOutlets={outlets}
      initialStatus={status}
    />
  )
}
