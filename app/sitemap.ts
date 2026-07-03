import type { MetadataRoute } from 'next'
import { WEB_OUTLETS } from '@/lib/outlets'

// Served at /sitemap.xml (200). Gives crawlers a clean, canonical list of the
// site's real pages so they don't have to discover them by rendering the SPA.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.spindetector.com'
  const now = new Date()

  const outletPages: MetadataRoute.Sitemap = WEB_OUTLETS.map((o) => ({
    url: `${base}/outlets/${o.slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }))

  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/outlets`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    ...outletPages,
  ]
}
