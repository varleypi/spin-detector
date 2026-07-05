import type { MetadataRoute } from 'next'
import { WEB_OUTLETS } from '@/lib/outlets'
import { isLiveMode, getRecentStoryRefs } from '@/lib/db'

// Regenerate the sitemap hourly so newly-published stories get indexed.
export const revalidate = 3600

// Served at /sitemap.xml (200). Gives crawlers a clean, canonical list of the
// site's real pages so they don't have to discover them by rendering the SPA.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://www.spindetector.com'
  const now = new Date()

  const outletPages: MetadataRoute.Sitemap = WEB_OUTLETS.map((o) => ({
    url: `${base}/outlets/${o.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  // Recent story pages — best-effort; never let a DB hiccup break the sitemap.
  let storyPages: MetadataRoute.Sitemap = []
  if (isLiveMode()) {
    try {
      const refs = await getRecentStoryRefs(10)
      const seen = new Set<string>()
      storyPages = refs.flatMap((r) => {
        const url = `${base}/story/${r.date}/${r.id}`
        if (seen.has(url)) return []
        seen.add(url)
        return [{ url, lastModified: new Date(r.date), changeFrequency: 'monthly' as const, priority: 0.5 }]
      })
    } catch (e) {
      console.error('Sitemap — recent stories failed:', e instanceof Error ? e.message : String(e))
    }
  }

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/outlets`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    ...outletPages,
    ...storyPages,
  ]
}
