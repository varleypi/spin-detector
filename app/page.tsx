import SpinDetectorApp from '@/components/SpinDetectorApp'
import { MOCK_STORIES, OUTLETS } from '@/lib/mockData'
import type { PipelineStatus } from '@/lib/types'

async function fetchData() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
      const [storiesRes, outletsRes, statusRes] = await Promise.all([
        fetch(`${baseUrl}/api/stories/today`, { next: { revalidate: 3600 } }),
        fetch(`${baseUrl}/api/outlets/scores`, { next: { revalidate: 3600 } }),
        fetch(`${baseUrl}/api/pipeline/status`, { next: { revalidate: 60 } }),
      ])
      const [storiesData, outletsData, statusData] = await Promise.all([
        storiesRes.json(),
        outletsRes.json(),
        statusRes.json(),
      ])
      return {
        stories: storiesData.stories,
        outlets: outletsData.outlets,
        status: statusData as PipelineStatus,
      }
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
    },
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
