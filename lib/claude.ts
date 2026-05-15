import Anthropic from '@anthropic-ai/sdk'
import type { RawArticle } from './rss'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ScoredArticle {
  outletId: string
  headline: string
  url: string
  pubDate: string
  biasScore: number
  biasSignals: string[]
  clusterId: string
  topicLabel: string
}

export async function clusterAndScoreHeadlines(articles: RawArticle[]): Promise<ScoredArticle[]> {
  const headlineList = articles
    .map((a, i) => `[${i}] ${a.outletId.toUpperCase()}: ${a.headline}`)
    .join('\n')

  const clusterResponse = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: 'You are a computational linguistics researcher analyzing political media bias. Always respond with valid JSON only.',
    messages: [
      {
        role: 'user',
        content: `Analyze these ${articles.length} news headlines from 12 political outlets.

1. Group them into 5-8 story clusters (same real-world story covered by multiple outlets)
2. For each article in each cluster, score bias 0-10 (0=far left, 10=far right)

Scoring criteria:
- Word choice: "undocumented" (left) vs "illegal alien" (right)
- Framing: who is portrayed as victim vs threat
- Emotional loading: neutral vs charged verbs
- Source implication: ACLU/unions (left) vs Heritage/police (right)
- What is emphasized vs minimized

Headlines:
${headlineList}

Return JSON:
{
  "clusters": [
    {
      "clusterId": "unique-id",
      "topicLabel": "Brief topic description",
      "articles": [
        {
          "index": 0,
          "biasScore": 3.5,
          "biasSignals": ["signal1", "signal2"]
        }
      ]
    }
  ]
}

Only include articles that clearly belong to a cluster. Skip off-topic articles.`,
      },
    ],
  })

  const content = clusterResponse.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const jsonMatch = content.text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON found in response')

  const parsed = JSON.parse(jsonMatch[0])

  const results: ScoredArticle[] = []
  for (const cluster of parsed.clusters) {
    for (const scored of cluster.articles) {
      const article = articles[scored.index]
      if (!article) continue
      results.push({
        outletId: article.outletId,
        headline: article.headline,
        url: article.url,
        pubDate: article.pubDate,
        biasScore: scored.biasScore,
        biasSignals: scored.biasSignals,
        clusterId: cluster.clusterId,
        topicLabel: cluster.topicLabel,
      })
    }
  }

  return results
}
