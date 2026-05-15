export const RSS_FEEDS: Record<string, string> = {
  cnn: 'http://rssnews.cnn.com/rss/edition.rss',
  msnbc: 'http://feeds.msnbc.msn.com/msnbc/topstories',
  nytimes: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
  washpost: 'https://feeds.washingtonpost.com/rss/politics',
  npr: 'https://feeds.npr.org/1014/rss.xml',
  politico: 'https://www.politico.com/rss/politics08.xml',
  bbc: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
  aljazeera: 'https://www.aljazeera.com/xml/rss/all.xml',
  foxnews: 'https://feeds.foxnews.com/foxnews/politics',
  nypost: 'https://nypost.com/feed/',
  dailycaller: 'https://dailycaller.com/feed/',
  breitbart: 'https://feeds.feedburner.com/breitbart',
}

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
    Object.entries(RSS_FEEDS).map(async ([outletId, feedUrl]) => {
      const feed = await parser.parseURL(feedUrl)
      return feed.items.slice(0, 15).map((item: { title?: string; link?: string; pubDate?: string }) => ({
        outletId,
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
      console.warn(`Failed to fetch feed for ${Object.keys(RSS_FEEDS)[i]}:`, result.reason)
    }
  })

  return articles
}
