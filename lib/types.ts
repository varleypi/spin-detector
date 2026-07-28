export interface Article {
  id: string
  outletId: string
  outletName: string
  headline: string
  url: string
  biasScore: number
  biasSignals: string[]
  biasScoreGrok?: number
  biasSignalsGrok?: string[]
  pubDate: string
  clusterId: string
}

export interface StoryCluster {
  id: string
  topicLabel: string
  date: string
  /** Original grounded analysis of how outlets framed this story. May be absent
   *  on very old stories generated before analysis existed. */
  analysis?: string | null
  articles: Article[]
}

export interface OutletScore {
  outletId: string
  outletName: string
  abbreviation: string
  currentScore: number
  currentScoreGrok?: number
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
