import type { MetadataRoute } from 'next'

// Served at /sitemap.xml (200). Gives crawlers a clean, canonical list of the
// site's real pages so they don't have to discover them by rendering the SPA.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://www.spindetector.com'
  const now = new Date()
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
