/**
 * Single source of truth for all 12 outlet configurations.
 * newsapiId  — source ID for NewsAPI /v2/top-headlines?sources=...
 * rssUrl     — fallback RSS feed (used when outlet not in NewsAPI, or as backup)
 */

const OUTLETS = {
  cnn: {
    name: 'CNN',
    abbr: 'CNN',
    newsapiId: 'cnn',
    rssUrl: 'http://rssnews.cnn.com/rss/edition.rss',
    expectedRange: [2.5, 4.0],
  },
  msnbc: {
    name: 'MSNBC',
    abbr: 'MSNBC',
    newsapiId: 'msnbc',
    rssUrl: 'http://feeds.msnbc.msn.com/msnbc/topstories',
    expectedRange: [1.5, 3.5],
  },
  nytimes: {
    name: 'NY Times',
    abbr: 'NYT',
    newsapiId: 'the-new-york-times',
    rssUrl: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
    expectedRange: [3.0, 4.5],
  },
  washpost: {
    name: 'Washington Post',
    abbr: 'WPost',
    newsapiId: 'the-washington-post',
    rssUrl: 'https://feeds.washingtonpost.com/rss/politics',
    expectedRange: [2.8, 4.2],
  },
  npr: {
    name: 'NPR',
    abbr: 'NPR',
    newsapiId: 'national-public-radio',
    rssUrl: 'https://feeds.npr.org/1014/rss.xml',
    expectedRange: [3.5, 4.5],
  },
  politico: {
    name: 'Politico',
    abbr: 'PLTICO',
    newsapiId: 'politico',
    rssUrl: 'https://www.politico.com/rss/politics08.xml',
    expectedRange: [4.0, 5.5],
  },
  bbc: {
    name: 'BBC',
    abbr: 'BBC',
    newsapiId: 'bbc-news',
    rssUrl: 'https://feeds.bbci.co.uk/news/politics/rss.xml',
    expectedRange: [4.0, 5.5],
  },
  aljazeera: {
    name: 'Al Jazeera',
    abbr: 'AJ',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.aljazeera.com/xml/rss/all.xml',
    expectedRange: [3.5, 5.0],
  },
  foxnews: {
    name: 'Fox News',
    abbr: 'FOX',
    newsapiId: 'fox-news',
    rssUrl: 'https://feeds.foxnews.com/foxnews/politics',
    expectedRange: [7.0, 8.5],
  },
  nypost: {
    name: 'NY Post',
    abbr: 'NYPost',
    newsapiId: 'the-new-york-post',
    rssUrl: 'https://nypost.com/feed/',
    expectedRange: [6.5, 8.0],
  },
  dailycaller: {
    name: 'Daily Caller',
    abbr: 'DC',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://dailycaller.com/feed/',
    expectedRange: [7.5, 9.0],
  },
  breitbart: {
    name: 'Breitbart',
    abbr: 'BB',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://feeds.feedburner.com/breitbart',
    expectedRange: [8.5, 9.8],
  },
}

// NewsAPI source ID → outletId reverse map
const NEWSAPI_TO_OUTLET = Object.fromEntries(
  Object.entries(OUTLETS)
    .filter(([, cfg]) => cfg.newsapiId)
    .map(([id, cfg]) => [cfg.newsapiId, id])
)

module.exports = { OUTLETS, NEWSAPI_TO_OUTLET }
