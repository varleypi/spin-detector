/**
 * Stage 3.5 — Write an original, grounded bias analysis for each story cluster.
 *
 * Why this exists: the /story pages were flagged "low value content" because
 * each one was a chart plus a list of OTHER outlets' headlines — almost no
 * original writing. This turns the site's own scoring data (per-headline bias
 * scores and signals from Claude and Grok) into a short analytical paragraph
 * explaining HOW the framing differed across the spectrum. That is genuinely
 * original content only this site can write, grounded entirely in data it
 * already computed — not generic filler.
 *
 * Model: prefers Claude when ANTHROPIC_API_KEY is set (the CI pipeline), and
 * falls back to Grok when only XAI_API_KEY is present (local backfill). The two
 * models already power the scoring, so either is on-brand.
 */

const Anthropic = require('@anthropic-ai/sdk')

const CLAUDE_MODEL = 'claude-sonnet-4-6'
const GROK_MODEL = 'grok-3-mini'

const SYSTEM_PROMPT =
  'You are a media-bias analyst writing short, neutral, factual notes on how ' +
  'different outlets framed the same story. You never take a political side, ' +
  'never invent facts, and only describe framing differences that are actually ' +
  'present in the headlines you are given.'

// Round to one decimal for display in the prompt, matching the site.
function fmt(n) {
  if (n === null || n === undefined) return '—'
  const v = Number(n)
  return (v >= 0 ? '+' : '') + v.toFixed(1)
}

/**
 * Convert a 0–10 score (site's storage scale, 5 = center) into the −5..+5
 * spectrum the reader sees, so the prompt speaks in the same terms as the page.
 */
function toSpectrum(score) {
  return Number(score) - 5
}

function buildPrompt(cluster) {
  const sorted = [...cluster.articles].sort((a, b) => a.biasScore - b.biasScore)
  const lines = sorted.map((a) => {
    const signals = [...(a.biasSignals ?? []), ...(a.biasSignalsGrok ?? [])]
      .filter(Boolean)
      .slice(0, 3)
      .join('; ')
    const grok = a.biasScoreGrok != null ? `, Grok ${fmt(toSpectrum(a.biasScoreGrok))}` : ''
    return `- ${a.outletName} (Claude ${fmt(toSpectrum(a.biasScore))}${grok}): "${a.headline}"` +
      (signals ? `\n    signals: ${signals}` : '')
  })

  const scores = sorted.map((a) => toSpectrum(a.biasScore))
  const spread = (scores[scores.length - 1] - scores[0]).toFixed(1)

  return `STORY: ${cluster.topicLabel}
DATE: ${cluster.date}
SCALE: −5 (far left framing) … 0 (neutral/center) … +5 (far right framing)
BIAS SPREAD across outlets: ${spread} points

Below are the headlines from every outlet that covered this story, each with its
bias score(s) and the specific linguistic signals our scorers flagged:

${lines.join('\n')}

Write a single analytical paragraph of 110–150 words for readers of this story
page. Requirements:
  • Explain HOW the framing differed from the most-left to the most-right
    headline — quote the actual differing words/phrases from the headlines above.
  • Name specific outlets when useful (e.g. how the left-most and right-most
    framed it), but do not list every outlet.
  • If the spread is small (under ~1.5 points), say plainly that coverage was
    largely uniform and note what the shared neutral framing looked like — do
    not manufacture a divide that isn't there.
  • Neutral, analytical voice. Describe the language; never endorse a side.
  • Only use facts present in the headlines and signals above. Invent nothing.
  • No preamble, no heading, no bullet points. Return ONLY the paragraph text.`
}

// ── Model calls ────────────────────────────────────────────────────────────────

async function callClaude(prompt) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  })
  return { text: (res.content[0]?.text ?? '').trim(), model: CLAUDE_MODEL }
}

async function callGrok(prompt) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) throw new Error(`xAI API ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return { text: (json.choices?.[0]?.message?.content ?? '').trim(), model: GROK_MODEL }
}

// Prefer Claude (matches the scorer's voice) when its key is present; otherwise
// use Grok. Retries transient failures a couple of times before giving up.
async function callModel(prompt) {
  const useClaude = !!process.env.ANTHROPIC_API_KEY
  const useGrok = !!process.env.XAI_API_KEY
  if (!useClaude && !useGrok) {
    throw new Error('No model key set (need ANTHROPIC_API_KEY or XAI_API_KEY)')
  }

  const call = useClaude ? callClaude : callGrok
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await call(prompt)
    } catch (err) {
      lastErr = err
      // Fall back to Grok if Claude fails and Grok is available.
      if (useClaude && useGrok && attempt === 1) {
        try {
          return await callGrok(prompt)
        } catch (grokErr) {
          lastErr = grokErr
        }
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 3000))
    }
  }
  throw lastErr
}

/** Reject an analysis that came back empty or implausibly short/long. */
function isUsable(text) {
  if (!text) return false
  const words = text.split(/\s+/).filter(Boolean).length
  return words >= 40 && words <= 260
}

/**
 * Generate an analysis for one cluster.
 * @param cluster { clusterId, topicLabel, date, articles: [{ outletName, headline,
 *                  biasScore, biasSignals, biasScoreGrok, biasSignalsGrok }] }
 * @returns { analysis, model } or null if it could not be produced.
 */
async function analyzeCluster(cluster) {
  if (!cluster?.articles || cluster.articles.length < 2) return null
  const { text, model } = await callModel(buildPrompt(cluster))
  if (!isUsable(text)) {
    console.warn(`   ⚠ analysis for "${cluster.topicLabel}" was unusable (len ${text?.length ?? 0}) — skipping`)
    return null
  }
  return { analysis: text, model }
}

/**
 * Batch entry point for the nightly pipeline.
 * @param clusters      [{ clusterId, topicLabel }]
 * @param scoredArticles flat list with clusterId, used to assemble each cluster
 * @param date          ISO date
 * @returns Map<clusterId, { analysis, model }>
 */
async function generateClusterAnalyses(clusters, scoredArticles, date) {
  const byCluster = new Map()
  for (const c of clusters) {
    const articles = scoredArticles.filter((a) => a.clusterId === c.clusterId)
    if (articles.length >= 2) {
      byCluster.set(c.clusterId, {
        clusterId: c.clusterId,
        topicLabel: c.topicLabel,
        date,
        articles: articles.map((a) => ({
          outletName: a.outletName ?? a.outletId,
          headline: a.headline,
          biasScore: a.biasScore,
          biasSignals: a.biasSignals,
          biasScoreGrok: a.biasScoreGrok,
          biasSignalsGrok: a.biasSignalsGrok,
        })),
      })
    }
  }

  const out = new Map()
  let ok = 0
  for (const [clusterId, cluster] of byCluster) {
    try {
      const result = await analyzeCluster(cluster)
      if (result) {
        out.set(clusterId, result)
        ok++
      }
    } catch (err) {
      console.warn(`   ⚠ analysis failed for "${cluster.topicLabel}": ${err.message}`)
    }
  }
  console.log(`   ✓ generated ${ok}/${byCluster.size} story analyses`)
  return out
}

module.exports = { analyzeCluster, generateClusterAnalyses, buildPrompt }
