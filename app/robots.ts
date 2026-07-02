import type { MetadataRoute } from 'next'

// Served at /robots.txt (200). Explicitly welcomes all crawlers, including
// Google's AdSense bot (Mediapartners-Google) and site verifier
// (AdsBot-Google), and points them at the sitemap. Without this file the
// route 404s, which can make AdSense verification treat the site as
// unavailable.
export default function robots(): MetadataRoute.Robots {
  const base = 'https://www.spindetector.com'
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: '/api/' },
      { userAgent: 'Mediapartners-Google', allow: '/' },
      { userAgent: 'AdsBot-Google', allow: '/' },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
