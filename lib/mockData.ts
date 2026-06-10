import type { StoryCluster, OutletScore, TrendPoint } from './types'
import { OUTLETS_CONFIG } from './outlets'

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

function generateTrend(outletId: string, avgScore: number, variance: number): TrendPoint[] {
  const seed = outletId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    const rand = seededRandom(seed + i * 7)
    const score = Math.max(0.1, Math.min(9.9, avgScore + (rand - 0.5) * variance * 2))
    return { date: date.toISOString().split('T')[0], score: Math.round(score * 10) / 10 }
  })
}

const MOCK_SCORES: Record<string, { score: number; count: number; variance: number }> = {
  msnbc:       { score: 2.1, count: 47, variance: 0.6 },
  cnn:         { score: 3.1, count: 52, variance: 0.5 },
  npr:         { score: 3.8, count: 38, variance: 0.4 },
  nytimes:     { score: 3.6, count: 63, variance: 0.5 },
  washpost:    { score: 3.5, count: 58, variance: 0.5 },
  aljazeera:   { score: 4.3, count: 29, variance: 0.6 },
  bbc:         { score: 4.8, count: 44, variance: 0.4 },
  politico:    { score: 5.1, count: 71, variance: 0.6 },
  nypost:      { score: 7.0, count: 49, variance: 0.6 },
  foxnews:     { score: 7.8, count: 68, variance: 0.5 },
  dailycaller: { score: 8.2, count: 41, variance: 0.5 },
  breitbart:   { score: 9.1, count: 55, variance: 0.4 },
}

export const OUTLETS: OutletScore[] = OUTLETS_CONFIG.map(o => {
  const m = MOCK_SCORES[o.id] ?? { score: 5, count: 0, variance: 0.5 }
  return {
    outletId: o.id,
    outletName: o.name,
    abbreviation: o.abbreviation,
    currentScore: m.score,
    articleCount: m.count,
    expectedRange: o.expectedRange,
  }
})

export const OUTLET_TRENDS: Record<string, TrendPoint[]> = Object.fromEntries(
  OUTLETS_CONFIG.map(o => {
    const m = MOCK_SCORES[o.id] ?? { score: 5, count: 0, variance: 0.5 }
    return [o.id, generateTrend(o.id, m.score, m.variance)]
  })
)

export const MOCK_STORIES: StoryCluster[] = [
  {
    id: 'immigration-20260514',
    topicLabel: 'Federal Immigration Enforcement Operations',
    date: '2026-05-14',
    articles: [
      {
        id: 'a1', outletId: 'msnbc', outletName: 'MSNBC', clusterId: 'immigration-20260514',
        headline: 'Families torn apart as ICE raids sweep through immigrant communities across the country',
        url: 'https://msnbc.com', biasScore: 1.8, pubDate: '2026-05-14',
        biasSignals: ['"torn apart" — emotionally charged victim framing', '"sweep through" — implies aggressive, indiscriminate force', 'Centers perspective of those affected, not policy rationale'],
      },
      {
        id: 'a2', outletId: 'cnn', outletName: 'CNN', clusterId: 'immigration-20260514',
        headline: 'Immigration enforcement operations target major cities; rights groups raise concerns',
        url: 'https://cnn.com', biasScore: 3.1, pubDate: '2026-05-14',
        biasSignals: ['Neutral "operations" language', 'Includes rights group perspective', '"Target" slightly negative connotation'],
      },
      {
        id: 'a3', outletId: 'bbc', outletName: 'BBC', clusterId: 'immigration-20260514',
        headline: 'US authorities conduct immigration enforcement raids in multiple cities',
        url: 'https://bbc.com', biasScore: 4.6, pubDate: '2026-05-14',
        biasSignals: ['Neutral verb "conduct"', 'No loaded language', 'Factual, international perspective'],
      },
      {
        id: 'a4', outletId: 'politico', outletName: 'Politico', clusterId: 'immigration-20260514',
        headline: 'Administration defends deportation strategy amid escalating political fallout',
        url: 'https://politico.com', biasScore: 5.2, pubDate: '2026-05-14',
        biasSignals: ['Policy-focused framing', '"Political fallout" acknowledges controversy without taking sides', 'Slight administration-centric framing'],
      },
      {
        id: 'a5', outletId: 'foxnews', outletName: 'Fox News', clusterId: 'immigration-20260514',
        headline: 'Border agents crack down on illegal immigrant surge as deportations accelerate',
        url: 'https://foxnews.com', biasScore: 7.9, pubDate: '2026-05-14',
        biasSignals: ['"illegal immigrant" vs "undocumented"', '"crack down" frames enforcement as justified', '"surge" implies threat/invasion'],
      },
      {
        id: 'a6', outletId: 'breitbart', outletName: 'Breitbart', clusterId: 'immigration-20260514',
        headline: 'Deportation force crushes illegal alien invasion with historic raids across America',
        url: 'https://breitbart.com', biasScore: 9.3, pubDate: '2026-05-14',
        biasSignals: ['"illegal alien" — maximally charged term', '"invasion" — military threat framing', '"crushes" — triumphalist language celebrating force'],
      },
    ],
  },
  {
    id: 'economy-20260514',
    topicLabel: 'Federal Reserve Holds Interest Rates Steady',
    date: '2026-05-14',
    articles: [
      {
        id: 'b1', outletId: 'npr', outletName: 'NPR', clusterId: 'economy-20260514',
        headline: 'Fed holds rates as working families continue to feel squeeze from elevated prices',
        url: 'https://npr.org', biasScore: 2.9, pubDate: '2026-05-14',
        biasSignals: ['"Working families" — progressive framing', '"Feel squeeze" — empathy with lower-income groups', 'Soft on Fed, emphasizes consumer burden'],
      },
      {
        id: 'b2', outletId: 'nytimes', outletName: 'NY Times', clusterId: 'economy-20260514',
        headline: 'Federal Reserve holds interest rates steady amid mixed economic signals',
        url: 'https://nytimes.com', biasScore: 3.8, pubDate: '2026-05-14',
        biasSignals: ['Balanced framing', '"Mixed signals" acknowledges uncertainty', 'Neutral economic language throughout'],
      },
      {
        id: 'b3', outletId: 'bbc', outletName: 'BBC', clusterId: 'economy-20260514',
        headline: 'US Federal Reserve keeps interest rates unchanged at latest meeting',
        url: 'https://bbc.com', biasScore: 4.9, pubDate: '2026-05-14',
        biasSignals: ['Purely factual headline', 'No evaluative language', 'International perspective — no partisan framing'],
      },
      {
        id: 'b4', outletId: 'foxnews', outletName: 'Fox News', clusterId: 'economy-20260514',
        headline: 'Fed refuses rate cuts as inflation punishes American households for third straight year',
        url: 'https://foxnews.com', biasScore: 7.5, pubDate: '2026-05-14',
        biasSignals: ['"Refuses" implies stubbornness/failure', '"Punishes" — highly charged verb', '"Third straight year" amplifies severity'],
      },
      {
        id: 'b5', outletId: 'dailycaller', outletName: 'Daily Caller', clusterId: 'economy-20260514',
        headline: 'Americans crushed by inflation as incompetent Fed fails to deliver promised relief',
        url: 'https://dailycaller.com', biasScore: 8.2, pubDate: '2026-05-14',
        biasSignals: ['"Crushed" — hyperbolic emotional language', '"Incompetent" — direct institutional attack', '"Fails to deliver" — assigns clear blame'],
      },
    ],
  },
  {
    id: 'climate-20260514',
    topicLabel: 'IPCC Climate Report & Energy Policy Response',
    date: '2026-05-14',
    articles: [
      {
        id: 'c1', outletId: 'msnbc', outletName: 'MSNBC', clusterId: 'climate-20260514',
        headline: 'Scientists issue dire climate emergency warning as record temperatures shatter global benchmarks',
        url: 'https://msnbc.com', biasScore: 2.2, pubDate: '2026-05-14',
        biasSignals: ['"Dire emergency" — alarmist framing', '"Shatter" — dramatic intensification verb', 'Appeals to scientific authority uncritically'],
      },
      {
        id: 'c2', outletId: 'cnn', outletName: 'CNN', clusterId: 'climate-20260514',
        headline: 'New IPCC climate data shows accelerating warming; researchers urge immediate action',
        url: 'https://cnn.com', biasScore: 3.0, pubDate: '2026-05-14',
        biasSignals: ['"Accelerating" implies urgency', '"Urge immediate action" — advocacy framing', 'Generally accurate but tilts toward alarm'],
      },
      {
        id: 'c3', outletId: 'washpost', outletName: 'Washington Post', clusterId: 'climate-20260514',
        headline: 'Climate scientists warn of worsening impacts; policy response remains politically fraught',
        url: 'https://washingtonpost.com', biasScore: 3.7, pubDate: '2026-05-14',
        biasSignals: ['Acknowledges political complexity', '"Worsening" negative framing but factual', 'Balanced between science and political reality'],
      },
      {
        id: 'c4', outletId: 'bbc', outletName: 'BBC', clusterId: 'climate-20260514',
        headline: 'Climate report finds global temperatures rising faster than previously modeled',
        url: 'https://bbc.com', biasScore: 4.8, pubDate: '2026-05-14',
        biasSignals: ['Neutral, factual presentation', 'No advocacy language', '"Previously modeled" grounds claim in data'],
      },
      {
        id: 'c5', outletId: 'foxnews', outletName: 'Fox News', clusterId: 'climate-20260514',
        headline: 'Green energy agenda drives energy costs higher as Democrats push radical climate bill',
        url: 'https://foxnews.com', biasScore: 7.6, pubDate: '2026-05-14',
        biasSignals: ['"Green energy agenda" — dismissive framing', '"Radical climate bill" — ideological label', 'Links policy to consumer economic pain'],
      },
      {
        id: 'c6', outletId: 'breitbart', outletName: 'Breitbart', clusterId: 'climate-20260514',
        headline: 'Climate alarmists push socialist green agenda as Americans pay record fuel prices at the pump',
        url: 'https://breitbart.com', biasScore: 9.1, pubDate: '2026-05-14',
        biasSignals: ['"Alarmists" — delegitimizing label', '"Socialist green agenda" — dual ideological attack', '"Americans pay" — patriotic economic victimhood'],
      },
    ],
  },
  {
    id: 'guns-20260514',
    topicLabel: 'Senate Gun Safety Legislation Vote',
    date: '2026-05-14',
    articles: [
      {
        id: 'd1', outletId: 'msnbc', outletName: 'MSNBC', clusterId: 'guns-20260514',
        headline: 'Gun violence epidemic claims more lives as Senate paralyzed by NRA campaign money',
        url: 'https://msnbc.com', biasScore: 1.5, pubDate: '2026-05-14',
        biasSignals: ['"Epidemic" — medical crisis framing', '"Paralyzed by NRA money" — conspiracy of corruption framing', '"Claims more lives" — maximizes emotional weight'],
      },
      {
        id: 'd2', outletId: 'washpost', outletName: 'Washington Post', clusterId: 'guns-20260514',
        headline: 'Senate gun safety bill gains momentum as bipartisan support grows despite GOP holdouts',
        url: 'https://washingtonpost.com', biasScore: 2.8, pubDate: '2026-05-14',
        biasSignals: ['"Gun safety" — progressive preferred term', '"Gains momentum" — pro-legislation framing', '"GOP holdouts" — frames opponents as obstruction'],
      },
      {
        id: 'd3', outletId: 'politico', outletName: 'Politico', clusterId: 'guns-20260514',
        headline: 'Gun bill faces uncertain Senate path as party leaders negotiate final provisions',
        url: 'https://politico.com', biasScore: 5.1, pubDate: '2026-05-14',
        biasSignals: ['Neutral procedural framing', '"Uncertain path" — no predetermined outcome', 'Covers both sides of negotiation'],
      },
      {
        id: 'd4', outletId: 'nypost', outletName: 'NY Post', clusterId: 'guns-20260514',
        headline: "Democrats' gun grab faces fierce pushback from Second Amendment defenders in Senate",
        url: 'https://nypost.com', biasScore: 7.0, pubDate: '2026-05-14',
        biasSignals: ['"Gun grab" — inflammatory framing of legal legislation', '"Fierce pushback" — heroicizes opposition', '"Second Amendment defenders" — sympathetic framing for opponents'],
      },
      {
        id: 'd5', outletId: 'foxnews', outletName: 'Fox News', clusterId: 'guns-20260514',
        headline: 'Gun control push threatens constitutional rights as Republicans warn of overreach',
        url: 'https://foxnews.com', biasScore: 7.8, pubDate: '2026-05-14',
        biasSignals: ['"Gun control" vs "gun safety"', '"Threatens constitutional rights" — fear of rights loss', 'Republican voices centered as protectors'],
      },
    ],
  },
  {
    id: 'healthcare-20260514',
    topicLabel: 'Medicare Drug Price Negotiation Results',
    date: '2026-05-14',
    articles: [
      {
        id: 'e1', outletId: 'nytimes', outletName: 'NY Times', clusterId: 'healthcare-20260514',
        headline: 'Medicare drug price negotiations deliver savings for millions of seniors, data shows',
        url: 'https://nytimes.com', biasScore: 3.2, pubDate: '2026-05-14',
        biasSignals: ['"Deliver savings" — positive program framing', '"Millions of seniors" — broad benefit emphasis', '"Data shows" — factual grounding but selectively positive'],
      },
      {
        id: 'e2', outletId: 'npr', outletName: 'NPR', clusterId: 'healthcare-20260514',
        headline: 'Millions of Americans to see lower prescription costs under new Medicare rules',
        url: 'https://npr.org', biasScore: 2.6, pubDate: '2026-05-14',
        biasSignals: ['"Millions of Americans" — broad benefit framing', '"Lower costs" — consumer-positive emphasis', 'No mention of trade-offs or pharmaceutical industry concerns'],
      },
      {
        id: 'e3', outletId: 'bbc', outletName: 'BBC', clusterId: 'healthcare-20260514',
        headline: 'US Medicare launches drug price negotiations with major pharmaceutical firms',
        url: 'https://bbc.com', biasScore: 4.9, pubDate: '2026-05-14',
        biasSignals: ['Neutral, factual reporting', 'No advocacy language', 'Balanced without taking sides'],
      },
      {
        id: 'e4', outletId: 'foxnews', outletName: 'Fox News', clusterId: 'healthcare-20260514',
        headline: "Drug price controls spark innovation crisis fears as pharma warns of fewer cures",
        url: 'https://foxnews.com', biasScore: 7.4, pubDate: '2026-05-14',
        biasSignals: ['"Price controls" vs "negotiations"', '"Innovation crisis" — catastrophizing', 'Pharmaceutical industry perspective centered'],
      },
      {
        id: 'e5', outletId: 'dailycaller', outletName: 'Daily Caller', clusterId: 'healthcare-20260514',
        headline: "Socialist drug pricing scheme threatens America's world-leading pharmaceutical innovation",
        url: 'https://dailycaller.com', biasScore: 8.6, pubDate: '2026-05-14',
        biasSignals: ['"Socialist" — ideological label', '"Threatens America\'s" — patriotic victimhood', '"World-leading" — American exceptionalism appeal'],
      },
    ],
  },
]
