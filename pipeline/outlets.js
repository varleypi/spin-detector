/**
 * Single source of truth for all 20 outlet configurations.
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
    rssUrl: 'https://nypost.com/news/feed/',
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
  guardian: {
    name: 'The Guardian',
    abbr: 'Guard',
    newsapiId: 'the-guardian-us',
    rssUrl: 'https://www.theguardian.com/us-news/rss',
    expectedRange: [2.5, 4.0],
  },
  cbsnews: {
    name: 'CBS News',
    abbr: 'CBS',
    newsapiId: 'cbs-news',
    rssUrl: 'https://www.cbsnews.com/latest/rss/main',
    expectedRange: [3.0, 4.5],
  },
  newsweek: {
    name: 'Newsweek',
    abbr: 'NW',
    newsapiId: null, // Not a confirmed NewsAPI source — RSS only
    rssUrl: 'https://feeds.feedburner.com/NewsweekTopNewsAndFeaturedStories',
    expectedRange: [4.0, 5.5],
  },
  economist: {
    name: 'The Economist',
    abbr: 'Econ',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.economist.com/united-states/rss.xml',
    expectedRange: [4.5, 6.0],
  },
  cnbc: {
    name: 'CNBC',
    abbr: 'CNBC',
    newsapiId: 'cnbc',
    rssUrl: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    expectedRange: [4.5, 6.0],
  },
  forbes: {
    name: 'Forbes',
    abbr: 'Forbes',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.forbes.com/business/feed/',
    expectedRange: [5.0, 6.5],
  },
  wsj: {
    name: 'Wall Street Journal',
    abbr: 'WSJ',
    newsapiId: null, // Paywalled — not available via NewsAPI free tier
    rssUrl: 'https://feeds.a.dj.com/rss/RSSWSJD.xml',
    expectedRange: [5.5, 7.0],
  },
  washexaminer: {
    name: 'Washington Examiner',
    abbr: 'WExam',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.washingtonexaminer.com/section/news/feed',
    expectedRange: [7.0, 8.5],
  },
  thefreepress: {
    name: 'The Free Press',
    abbr: 'TFP',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://thefreepress.substack.com/feed',
    expectedRange: [4.5, 6.5],
  },
  thehill: {
    name: 'The Hill',
    abbr: 'Hill',
    newsapiId: 'the-hill',
    rssUrl: 'https://thehill.com/feed/',
    expectedRange: [5.5, 7.0],
  },
  axios: {
    name: 'Axios',
    abbr: 'Axios',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://api.axios.com/feed/',
    expectedRange: [5.5, 6.5],
  },
  usatoday: {
    name: 'USA Today',
    abbr: 'USAT',
    newsapiId: 'the-usa-today',
    rssUrl: 'https://rssfeeds.usatoday.com/usatoday-NewsTopStories',
    expectedRange: [4.5, 6.0],
  },
  nationalreview: {
    name: 'National Review',
    abbr: 'NR',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.nationalreview.com/feed/',
    expectedRange: [7.0, 8.5],
  },
  thefederalist: {
    name: 'The Federalist',
    abbr: 'Fed',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://thefederalist.com/feed/',
    expectedRange: [7.5, 9.0],
  },
  timesofisrael: {
    name: 'Times of Israel',
    abbr: 'TOI',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.timesofisrael.com/feed/',
    expectedRange: [5.5, 7.5],
  },
}

// NewsAPI source ID → outletId reverse map
const NEWSAPI_TO_OUTLET = Object.fromEntries(
  Object.entries(OUTLETS)
    .filter(([, cfg]) => cfg.newsapiId)
    .map(([id, cfg]) => [cfg.newsapiId, id])
)

module.exports = { OUTLETS, NEWSAPI_TO_OUTLET }
