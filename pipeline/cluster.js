/**
 * Stage 2+3 — Cluster headlines by topic and score each for political bias.
 *
 * Single Claude API call: send all headlines → get clusters + per-article scores.
 * Optional Grok (xAI) call: independently re-score the same articles for comparison.
 *
 * Estimated cost: ~$0.02–0.05 per run at claude-sonnet pricing.
 */

const Anthropic = require('@anthropic-ai/sdk')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a computational linguistics researcher specializing in political media bias analysis.
You always respond with valid JSON only, no preamble or explanation.`

function buildPrompt(articles) {
  const list = articles
    .map((a, i) => `[${i}] ${a.outletId.toUpperCase()}: ${a.headline}`)
    .join('\n')

  return `Analyze these ${articles.length} news headlines from 36 major political news outlets.

TASK 1 — CLUSTER: Group them into 5–15 story clusters where multiple outlets are covering
the SAME underlying real-world news event or political topic. Include opinion and editorial
pieces when they clearly comment on the same event covered by other outlets' news articles.
Skip articles that don't match any cluster (sports, weather, celebrity, purely local news).

TASK 2 — SCORE: For each article in a cluster, score its political language bias 0–10.

BIAS SCALE:
  0–2   Far Left  — heavy progressive framing, emotionally charged, activists as heroes
  2–4   Left      — progressive framing, sympathetic to left causes, soft on institutions
  4–6   Center    — neutral verbs, balanced sourcing, minimal ideological signals
  6–8   Right     — conservative framing, sympathetic to right causes, critical of government
  8–10  Far Right — heavy conservative framing, charged language, threats/invasion framing

KEY LINGUISTIC SIGNALS TO DETECT:
  • Word choice: "undocumented" (left) vs "illegal alien" (right); "gun safety" vs "gun grab"
  • Verb loading: "enforcement" (neutral) vs "raids"/"sweeps" (left-charged) vs "crackdown" (right)
  • Victim framing: who is portrayed as harmed vs threatening
  • Source trust: ACLU/unions implicit trust (left) vs Heritage/police trust (right)
  • Emphasis: what information leads vs what is buried
  • Qualifiers: "controversial" before conservative policies, absent before progressive ones

HEADLINES:
${list}

RESPOND WITH JSON ONLY — no other text:
{
  "clusters": [
    {
      "clusterId": "kebab-case-id",
      "topicLabel": "Short factual description of the story (10 words max)",
      "articles": [
        {
          "index": 0,
          "biasScore": 3.2,
          "biasSignals": [
            "specific observation about word choice or framing",
            "second signal"
          ]
        }
      ]
    }
  ]
}

RULES:
  • Each cluster must have articles from at least 2 different outlets
  • biasSignals: exactly 2 short observations, max 10 words each (e.g. '"torn apart" — victim framing')
  • biasScore must be a number 0.0–10.0 with one decimal place
  • clusterId must be unique within this response
  • Omit articles that don't clearly belong to any cluster`
}

// ── Grok (xAI) — Independent bias scoring ────────────────────────────────────

function buildGrokPrompt(scoredArticles) {
  const list = scoredArticles
    .map((a, i) => `[${i}] ${a.outletId.toUpperCase()} | ${a.topicLabel}: ${a.headline}`)
    .join('\n')

  return `Score these ${scoredArticles.length} news headlines for political language bias.

BIAS SCALE:
  0–2   Far Left  — heavy progressive framing, emotionally charged, activists as heroes
  2–4   Left      — progressive framing, sympathetic to left causes
  4–6   Center    — neutral verbs, balanced sourcing, minimal ideological signals
  6–8   Right     — conservative framing, sympathetic to right causes, critical of government
  8–10  Far Right — heavy conservative framing, charged language, threats/invasion framing

KEY LINGUISTIC SIGNALS:
  • Word choice: "undocumented" (left) vs "illegal alien" (right); "gun safety" vs "gun grab"
  • Verb loading: "raids"/"sweeps" (left-charged) vs "enforcement"/"crackdown" (right)
  • Victim framing: who is portrayed as harmed vs threatening
  • Qualifiers: "controversial" used selectively by lean-left outlets
  • Emphasis: what information leads vs what is buried

HEADLINES:
${list}

RESPOND WITH JSON ONLY — no other text:
{
  "scores": [
    {
      "index": 0,
      "biasScore": 3.2,
      "biasSignals": ["specific word choice observation", "framing observation"]
    }
  ]
}

RULES:
  • Score every article — include all ${scoredArticles.length} entries
  • biasScore: number 0.0–10.0 with one decimal place
  • biasSignals: exactly 2 observations, max 10 words each`
}

async function scoreWithGrok(scoredArticles) {
  if (!process.env.XAI_API_KEY) {
    console.log('   ⚠ XAI_API_KEY not set — skipping Grok scoring')
    return scoredArticles
  }

  console.log(`   Sending ${scoredArticles.length} articles to Grok for independent scoring...`)
  const prompt = buildGrokPrompt(scoredArticles)

  let responseText = ''
  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        max_tokens: 16000,
        messages: [
          {
            role: 'system',
            content:
              'You are a computational linguistics researcher specializing in political media bias analysis. You always respond with valid JSON only, no preamble or explanation.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      throw new Error(`xAI API ${response.status}: ${await response.text()}`)
    }

    const json = await response.json()
    responseText = json.choices?.[0]?.message?.content ?? ''
    console.log(`   Grok responded (${responseText.length} chars)`)
  } catch (err) {
    console.warn(`   ⚠ Grok scoring failed: ${err.message} — continuing without Grok scores`)
    return scoredArticles
  }

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.warn('   ⚠ No JSON found in Grok response — continuing without Grok scores')
    return scoredArticles
  }

  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    console.warn(`   ⚠ Invalid Grok JSON: ${err.message} — continuing without Grok scores`)
    return scoredArticles
  }

  const grokMap = new Map((parsed.scores ?? []).map((s) => [s.index, s]))
  let grokCount = 0

  const result = scoredArticles.map((article, i) => {
    const grok = grokMap.get(i)
    if (!grok) return article
    const biasScoreGrok = Math.max(0.0, Math.min(10.0, Number(grok.biasScore) || 5.0))
    grokCount++
    return {
      ...article,
      biasScoreGrok: Math.round(biasScoreGrok * 10) / 10,
      biasSignalsGrok: Array.isArray(grok.biasSignals) ? grok.biasSignals.slice(0, 2) : [],
    }
  })

  console.log(`   ✓ Grok scored ${grokCount}/${scoredArticles.length} articles`)
  return result
}

// ── Main export ───────────────────────────────────────────────────────────────

async function clusterAndScore(articles) {
  if (articles.length === 0) return { articles: [], clusters: [] }

  const prompt = buildPrompt(articles)
  console.log(`   Sending ${articles.length} headlines to Claude...`)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0]?.text ?? ''
  console.log(`   Claude responded (${text.length} chars, ${response.usage?.output_tokens} tokens)`)

  // Extract JSON — Claude occasionally adds markdown fences despite instructions
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON found in Claude response:\n${text.slice(0, 500)}`)

  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    throw new Error(`Invalid JSON from Claude: ${err.message}\n${jsonMatch[0].slice(0, 300)}`)
  }

  const clusters = parsed.clusters ?? []
  const scoredArticles = []

  for (const cluster of clusters) {
    if (!cluster.clusterId || !cluster.topicLabel || !Array.isArray(cluster.articles)) continue

    for (const scored of cluster.articles) {
      const article = articles[scored.index]
      if (!article) {
        console.warn(`   ⚠ Claude returned unknown index ${scored.index}`)
        continue
      }
      const biasScore = Math.max(0.0, Math.min(10.0, Number(scored.biasScore) || 5.0))
      scoredArticles.push({
        ...article,
        biasScore: Math.round(biasScore * 10) / 10,
        biasSignals: Array.isArray(scored.biasSignals) ? scored.biasSignals.slice(0, 2) : [],
        clusterId: cluster.clusterId,
        topicLabel: cluster.topicLabel,
      })
    }
  }

  console.log(`   ${scoredArticles.length} articles scored across ${clusters.length} clusters`)

  // ── Grok independent scoring (optional — requires XAI_API_KEY) ────────────
  console.log('\n🤖 Grok — Independent bias scoring...')
  const articlesWithGrok = await scoreWithGrok(scoredArticles)

  return { articles: articlesWithGrok, clusters }
}

module.exports = { clusterAndScore }
