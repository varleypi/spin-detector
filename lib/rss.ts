import { OUTLETS_CONFIG } from './outlets'

export interface RawArticle {
  outletId: string
  headline: string
  url: string
  pubDate: string
}

export async function fetchAllFeeds(): Promise<RawArticle[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Parser = require('rss-parser')
  const parser = new Parser({ timeout: 10000 })

  const results = await Promise.allSettled(
    OUTLETS_CONFIG.map(async (outlet) => {
      const feed = await parser.parseURL(outlet.rssFeed)
      return feed.items.slice(0, 15).map((item: { title?: string; link?: string; pubDate?: string }) => ({
        outletId: outlet.id,
        headline: item.title?.trim() ?? '',
        url: item.link ?? '',
        pubDate: item.pubDate ?? new Date().toISOString(),
      }))
    })
  )

  const articles: RawArticle[] = []
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      articles.push(...result.value)
    } else {
      console.warn(`Failed to fetch feed for ${OUTLETS_CONFIG[i].id}:`, result.reason)
    }
  })

  return articles
}
