export interface Article {
  id: string
  outletId: string
  outletName: string
  headline: string
  url: string
  biasScore: number
  biasSignals: string[]
  pubDate: string
  clusterId: string
}

export interface StoryCluster {
  id: string
  topicLabel: string
  date: string
  articles: Article[]
}

export interface OutletScore {
  outletId: string
  outletName: string
  abbreviation: string
  currentScore: number
  articleCount: number
  expectedRange: [number, number]
}

export interface TrendPoint {
  date: string
  score: number
}

export interface OutletTrend {
  outletId: string
  trend: TrendPoint[]
}

export interface PipelineStatus {
  lastRun: string | null
  articleCount: number
  storyCount: number
  status: 'success' | 'error' | 'never'
  dataSource: 'live' | 'demo'
}
