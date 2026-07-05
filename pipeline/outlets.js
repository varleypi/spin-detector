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
    rssUrl: 'https://www.usatoday.com/rss/news/',
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
  latimes: {
    name: 'LA Times',
    abbr: 'LAT',
    newsapiId: null, // Not reliably in NewsAPI — RSS only
    rssUrl: 'https://www.latimes.com/rss2.0.xml',
    expectedRange: [2.5, 4.0],
  },
  bostonglobe: {
    name: 'Boston Globe',
    abbr: 'Globe',
    newsapiId: null, // Paywalled — RSS only
    rssUrl: 'https://www.bostonglobe.com/arc/outboundfeeds/rss/section/nation/?outputType=xml',
    expectedRange: [2.5, 4.0],
  },
  chicagotribune: {
    name: 'Chicago Tribune',
    abbr: 'ChiTrib',
    newsapiId: null, // Not reliably in NewsAPI — RSS only
    rssUrl: 'https://www.chicagotribune.com/arcio/rss/',
    expectedRange: [4.5, 6.5],
  },
  startribune: {
    name: 'Star Tribune',
    abbr: 'StarTrib',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.startribune.com/politics/rss/',
    expectedRange: [3.5, 5.0],
  },
  charlotteobserver: {
    name: 'Charlotte Observer',
    abbr: 'CO',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.charlotteobserver.com/?rss=y',
    expectedRange: [4.0, 5.5],
  },
  dailymail: {
    name: 'Daily Mail',
    abbr: 'DM',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.dailymail.co.uk/articles.rss',
    expectedRange: [6.5, 8.5],
  },
  metro: {
    name: 'Metro',
    abbr: 'Metro',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://metro.co.uk/feed/',
    expectedRange: [3.0, 5.0],
  },
  telegraph: {
    name: 'The Telegraph',
    abbr: 'Tele',
    newsapiId: null, // Paywalled — RSS only (headlines available)
    rssUrl: 'https://www.telegraph.co.uk/rss.xml',
    expectedRange: [6.0, 7.5],
  },
  financialtimes: {
    name: 'Financial Times',
    abbr: 'FT',
    newsapiId: null, // Paywalled — RSS only (headlines available)
    rssUrl: 'https://www.ft.com/rss/home/us',
    expectedRange: [4.5, 6.0],
  },
  bloomberg: {
    name: 'Bloomberg',
    abbr: 'BBG',
    newsapiId: 'bloomberg',
    rssUrl: 'https://feeds.bloomberg.com/politics/news.rss',
    expectedRange: [4.0, 5.5],
  },
  yahoofinance: {
    name: 'Yahoo Finance',
    abbr: 'YFin',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://finance.yahoo.com/news/rssindex',
    expectedRange: [4.5, 6.0],
  },
  reuters: {
    name: 'Reuters',
    abbr: 'Reuters',
    newsapiId: 'reuters',
    rssUrl: 'https://feeds.reuters.com/reuters/topNews',
    expectedRange: [4.0, 5.5],
  },
  marketwatch: {
    name: 'MarketWatch',
    abbr: 'MW',
    newsapiId: null, // Not reliably in NewsAPI — RSS only
    rssUrl: 'https://www.marketwatch.com/rss/topstories',
    expectedRange: [4.5, 6.0],
  },
  businessinsider: {
    name: 'Business Insider',
    abbr: 'BI',
    newsapiId: 'business-insider',
    rssUrl: 'https://feeds.businessinsider.com/custom/all',
    expectedRange: [3.5, 5.0],
  },
  houstonchronicle: {
    name: 'Houston Chronicle',
    abbr: 'HChron',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.houstonchronicle.com/news/rss/',
    expectedRange: [4.0, 5.5],
  },
  miamiherald: {
    name: 'Miami Herald',
    abbr: 'MHerald',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.miamiherald.com/?rss=y',
    expectedRange: [3.5, 5.0],
  },
  abc: {
    name: 'ABC News',
    abbr: 'ABC',
    newsapiId: 'abc-news',
    rssUrl: 'https://abcnews.go.com/abcnews/topstories',
    expectedRange: [3.0, 4.5],
  },
  nbc: {
    name: 'NBC News',
    abbr: 'NBC',
    newsapiId: 'nbc-news',
    rssUrl: 'https://feeds.nbcnews.com/nbcnews/public/news',
    expectedRange: [3.0, 4.5],
  },
  ap: {
    name: 'Associated Press',
    abbr: 'AP',
    newsapiId: 'associated-press',
    rssUrl: 'https://apnews.com/hub/ap-top-news?format=rss',
    expectedRange: [4.5, 5.5],
  },
  independent: {
    name: 'The Independent',
    abbr: 'Indep',
    newsapiId: null, // Not reliably in NewsAPI — RSS only
    rssUrl: 'https://www.independent.co.uk/rss',
    expectedRange: [3.0, 4.5],
  },
  vox: {
    name: 'Vox',
    abbr: 'Vox',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.vox.com/rss/index.xml',
    expectedRange: [2.5, 4.0],
  },
  cbc: {
    name: 'CBC News',
    abbr: 'CBC',
    newsapiId: null, // Canadian outlet — RSS only
    rssUrl: 'https://www.cbc.ca/cmlink/rss-topstories',
    expectedRange: [3.5, 5.0],
  },
  huffpost: {
    name: 'HuffPost',
    abbr: 'HPost',
    newsapiId: 'the-huffington-post',
    rssUrl: 'https://www.huffpost.com/section/front-page/feed',
    expectedRange: [2.0, 3.5],
  },
  reason: {
    name: 'Reason',
    abbr: 'Reason',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://reason.com/feed/',
    expectedRange: [4.5, 6.5],
  },
  theatlantic: {
    name: 'The Atlantic',
    abbr: 'Atlntc',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.theatlantic.com/feed/all/',
    expectedRange: [2.5, 4.0],
  },
  skynews: {
    name: 'Sky News',
    abbr: 'Sky',
    newsapiId: null, // UK outlet — RSS only
    rssUrl: 'https://feeds.skynews.com/feeds/rss/home.xml',
    expectedRange: [4.0, 5.5],
  },
  timeslondon: {
    name: 'The Times (London)',
    abbr: 'TimesUK',
    newsapiId: null, // Paywalled — RSS headlines only
    rssUrl: 'https://www.thetimes.com/rss',
    expectedRange: [5.5, 7.0],
  },
  tampabaytimes: {
    name: 'Tampa Bay Times',
    abbr: 'TBTimes',
    newsapiId: null, // Not in NewsAPI — RSS only
    rssUrl: 'https://www.tampabay.com/news/rss/',
    expectedRange: [3.5, 5.0],
  },
  neutralnews: {
    name: 'Neutral News',
    abbr: 'NN',
    newsapiId: null, // Sister site — AI-neutralized summaries, RSS only
    rssUrl: 'https://www.neutralnews.us/rss.xml',
    expectedRange: [4.5, 5.5], // designed to read center/neutral
  },
}

// NewsAPI source ID → outletId reverse map
const NEWSAPI_TO_OUTLET = Object.fromEntries(
  Object.entries(OUTLETS)
    .filter(([, cfg]) => cfg.newsapiId)
    .map(([id, cfg]) => [cfg.newsapiId, id])
)

module.exports = { OUTLETS, NEWSAPI_TO_OUTLET }
