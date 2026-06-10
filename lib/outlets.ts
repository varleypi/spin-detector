export interface OutletConfig {
  id: string
  name: string
  abbreviation: string
  expectedRange: [number, number]
  rssFeed: string
  lineColor: string
}

export const OUTLETS_CONFIG: OutletConfig[] = [
  {
    id: 'msnbc', name: 'MSNBC', abbreviation: 'MSNBC',
    expectedRange: [1.5, 3.5],
    rssFeed: 'http://feeds.msnbc.msn.com/msnbc/topstories',
    lineColor: '#3b82f6',
  },
  {
    id: 'cnn', name: 'CNN', abbreviation: 'CNN',
    expectedRange: [2.5, 4.0],
    rssFeed: 'http://rssnews.cnn.com/rss/edition.rss',
    lineColor: '#60a5fa',
  },
  {
    id: 'npr', name: 'NPR', abbreviation: 'NPR',
    expectedRange: [3.5, 4.5],
    rssFeed: 'https://feeds.npr.org/1014/rss.xml',
    lineColor: '#818cf8',
  },
  {
    id: 'nytimes', name: 'NY Times', abbreviation: 'NYT',
    expectedRange: [3.0, 4.5],
    rssFeed: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
    lineColor: '#6366f1',
  },
  {
    id: 'washpost', name: 'Washington Post', abbreviation: 'WPost',
    expectedRange: [2.8, 4.2],
    rssFeed: 'https://feeds.washingtonpost.com/rss/politics',
    lineColor: '#7c3aed',
  },
  {
    id: 'aljazeera', name: 'Al Jazeera', abbreviation: 'AJ',
    expectedRange: [3.5, 5.0],
    rssFeed: 'https://www.aljazeera.com/xml/rss/all.xml',
    lineColor: '#a78bfa',
  },
  {
    id: 'bbc', name: 'BBC', abbreviation: 'BBC',
    expectedRange: [4.0, 5.5],
    rssFeed: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
    lineColor: '#d97706',
  },
  {
    id: 'politico', name: 'Politico', abbreviation: 'PLTICO',
    expectedRange: [4.0, 5.5],
    rssFeed: 'https://www.politico.com/rss/politics08.xml',
    lineColor: '#f59e0b',
  },
  {
    id: 'nypost', name: 'NY Post', abbreviation: 'NYPost',
    expectedRange: [6.5, 8.0],
    rssFeed: 'https://nypost.com/feed/',
    lineColor: '#f97316',
  },
  {
    id: 'foxnews', name: 'Fox News', abbreviation: 'FOX',
    expectedRange: [7.0, 8.5],
    rssFeed: 'https://feeds.foxnews.com/foxnews/politics',
    lineColor: '#ef4444',
  },
  {
    id: 'dailycaller', name: 'Daily Caller', abbreviation: 'DC',
    expectedRange: [7.5, 9.0],
    rssFeed: 'https://dailycaller.com/feed/',
    lineColor: '#dc2626',
  },
  {
    id: 'breitbart', name: 'Breitbart', abbreviation: 'BB',
    expectedRange: [8.5, 9.8],
    rssFeed: 'https://feeds.feedburner.com/breitbart',
    lineColor: '#991b1b',
  },
]

export const OUTLET_BY_ID: Record<string, OutletConfig> = Object.fromEntries(
  OUTLETS_CONFIG.map(o => [o.id, o])
)
