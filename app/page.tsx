import SpinDetectorApp from '@/components/SpinDetectorApp'
import { getHomeData } from '@/lib/homeData'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Spin Detector — Political Media Bias Tracker',
  description:
    'Real-time AI analysis of political bias across 56 major news outlets. See how CNN, Fox News, BBC, NYT, and more frame the same stories — scored from Far Left to Far Right by Claude and Grok.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Spin Detector — Political Media Bias Tracker',
    description:
      'Real-time AI analysis of political bias across 56 major news outlets. Same story, multiple outlets, measurable bias.',
    url: 'https://spindetector.com',
    siteName: 'Spin Detector',
    type: 'website',
  },
}

// Regenerate the page (ISR) at most every 15 minutes. Data is queried directly
// from Supabase in getHomeData — no self-HTTP hop — and getHomeData never throws,
// so a transient DB blip falls back to latest.json/mock rather than erroring.
export const revalidate = 900

export default async function Home() {
  const { stories, outlets, status } = await getHomeData()

  return (
    <SpinDetectorApp
      initialStories={stories}
      initialOutlets={outlets}
      initialStatus={status}
    />
  )
}
