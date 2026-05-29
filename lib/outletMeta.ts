/**
 * Static metadata for each outlet — readership figures, metric type, source year.
 * Keyed by outletId matching OUTLETS in pipeline/outlets.js.
 * Sources: Nielsen, Comscore, SimilarWeb, outlet press kits (2024–2025).
 */

export interface OutletMeta {
  dailyReaders: number        // raw number for sorting / bar sizing
  readerLabel: string         // formatted display e.g. "2.3M"
  readerType: 'tv' | 'web'   // TV viewers vs web visitors/unique visitors
  readerNote?: string         // optional caveat shown on hover
}

export const OUTLET_META: Record<string, OutletMeta> = {
  cbsnews: {
    dailyReaders: 4_000_000,
    readerLabel: '4.0M',
    readerType: 'tv',
    readerNote: 'CBS Evening News broadcast viewers (Nielsen Q4 2025)',
  },
  bbc: {
    dailyReaders: 3_340_000,
    readerLabel: '3.3M',
    readerType: 'web',
    readerNote: 'US unique visitors/day (Comscore 2024)',
  },
  nypost: {
    dailyReaders: 2_830_000,
    readerLabel: '2.8M',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb Mar 2025)',
  },
  nytimes: {
    dailyReaders: 2_250_000,
    readerLabel: '2.3M',
    readerType: 'web',
    readerNote: 'Unique visitors/day (Comscore Jul 2025)',
  },
  newsweek: {
    dailyReaders: 2_250_000,
    readerLabel: '2.3M',
    readerType: 'web',
    readerNote: 'Visits/day (SimilarWeb Aug 2025)',
  },
  npr: {
    dailyReaders: 2_200_000,
    readerLabel: '2.2M',
    readerType: 'web',
    readerNote: 'Visits/day (SimilarWeb Nov 2025)',
  },
  aljazeera: {
    dailyReaders: 2_100_000,
    readerLabel: '2.1M',
    readerType: 'web',
    readerNote: '~20% US share of global traffic (SimilarWeb 2024)',
  },
  washpost: {
    dailyReaders: 1_870_000,
    readerLabel: '1.9M',
    readerType: 'web',
    readerNote: 'Visits/day (SimilarWeb 2025); down 50%+ from peak',
  },
  cnbc: {
    dailyReaders: 1_700_000,
    readerLabel: '1.7M',
    readerType: 'web',
    readerNote: 'Unique visitors/day (Comscore Q1–Q3 2024)',
  },
  politico: {
    dailyReaders: 1_700_000,
    readerLabel: '1.7M',
    readerType: 'web',
    readerNote: 'Visits/day (SimilarWeb 2025)',
  },
  foxnews: {
    dailyReaders: 1_690_000,
    readerLabel: '1.7M',
    readerType: 'tv',
    readerNote: 'Cable TV viewers, total day average (Nielsen 2025)',
  },
  forbes: {
    dailyReaders: 1_630_000,
    readerLabel: '1.6M',
    readerType: 'web',
    readerNote: 'Unique visitors/day (Omniture Oct 2025)',
  },
  wsj: {
    dailyReaders: 1_400_000,
    readerLabel: '1.4M',
    readerType: 'web',
    readerNote: 'Unique visitors/day (WSJ media kit / SimilarWeb 2024)',
  },
  guardian: {
    dailyReaders: 1_160_000,
    readerLabel: '1.2M',
    readerType: 'web',
    readerNote: 'US unique visitors/day (Comscore Sept 2024)',
  },
  breitbart: {
    dailyReaders: 820_000,
    readerLabel: '820K',
    readerType: 'web',
    readerNote: 'Visits/day (SimilarWeb 2025); high volatility',
  },
  msnbc: {
    dailyReaders: 551_000,
    readerLabel: '551K',
    readerType: 'tv',
    readerNote: 'Cable TV viewers, total day average (Nielsen 2025)',
  },
  dailycaller: {
    dailyReaders: 550_000,
    readerLabel: '550K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (2023–2024)',
  },
  economist: {
    dailyReaders: 430_000,
    readerLabel: '430K',
    readerType: 'web',
    readerNote: 'Visits/day (Semrush Oct 2025)',
  },
  cnn: {
    dailyReaders: 406_000,
    readerLabel: '406K',
    readerType: 'tv',
    readerNote: 'Cable TV viewers, total day average (Nielsen 2025)',
  },
  washexaminer: {
    dailyReaders: 333_000,
    readerLabel: '333K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (press release 2024)',
  },
  thefreepress: {
    dailyReaders: 50_000,
    readerLabel: '~50K',
    readerType: 'web',
    readerNote: '1.5M total subscribers (paid + free); web traffic not publicly reported (Sacra Oct 2025)',
  },
  thehill: {
    dailyReaders: 1_000_000,
    readerLabel: '1.0M',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2025); ~30M monthly',
  },
  axios: {
    dailyReaders: 700_000,
    readerLabel: '700K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2025); ~20M monthly',
  },
  usatoday: {
    dailyReaders: 4_100_000,
    readerLabel: '4.1M',
    readerType: 'web',
    readerNote: 'Unique visitors/day (Comscore 2025); largest US daily by circulation',
  },
  nationalreview: {
    dailyReaders: 300_000,
    readerLabel: '300K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2024)',
  },
  thefederalist: {
    dailyReaders: 800_000,
    readerLabel: '800K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2024)',
  },
  timesofisrael: {
    dailyReaders: 160_000,
    readerLabel: '160K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2024); ~5M monthly',
  },
  latimes: {
    dailyReaders: 1_000_000,
    readerLabel: '1.0M',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2024); ~30M monthly',
  },
  bostonglobe: {
    dailyReaders: 100_000,
    readerLabel: '100K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2024); heavily paywalled',
  },
  chicagotribune: {
    dailyReaders: 300_000,
    readerLabel: '300K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2024); ~9M monthly',
  },
  startribune: {
    dailyReaders: 130_000,
    readerLabel: '130K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2024); largest MN newspaper',
  },
  charlotteobserver: {
    dailyReaders: 45_000,
    readerLabel: '45K',
    readerType: 'web',
    readerNote: 'Unique visitors/day (SimilarWeb 2024); McClatchy regional paper',
  },
}

/** Max daily readers across all outlets — used for proportional bar sizing. Computed dynamically. */
export const MAX_DAILY_READERS = Math.max(...Object.values(OUTLET_META).map((m) => m.dailyReaders))
