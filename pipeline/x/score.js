/**
 * Stage 3 — Bias scoring (grok-3-mini, one batched call).
 *
 * Uses the SAME 0–10 calibrated scale as pipeline/cluster.js so X scores match
 * the site (display value = score − 5, via social.js fmt/label). Adds a short
 * public `rationale` for the score card + tweet body.
 *
 * content_hash cache: a normalized headline scored before is reused verbatim —
 * the same wire copy reposted by many accounts costs one scoring call, not many.
 */

const crypto = require('crypto')
const { chatJson } = require('./grok')
const { getCachedScores, putCachedScore } = require('./db')

const SCORE_MODEL = 'grok-3-mini'

// Normalize text so near-identical headlines share a cache key: lowercase, drop
// URLs/@mentions/#hashtags, collapse punctuation + whitespace.
function contentHash(text) {
  const norm = String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[@#]\w+/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return crypto.createHash('sha256').update(norm).digest('hex')
}

// Shared calibration block — kept in sync with cluster.js buildGrokPrompt.
const SCALE_BLOCK = `BIAS SCALE:
  0–2   Far Left  — heavy progressive framing, emotionally charged, activists as heroes
  2–4   Left      — progressive framing, sympathetic to left causes
  4–6   Center    — neutral verbs, balanced sourcing, minimal ideological signals
  6–8   Right     — conservative framing, sympathetic to right causes, critical of government
  8–10  Far Right — heavy conservative framing, charged language, threats/invasion framing

CALIBRATION — 5.0 IS TRUE CENTER, NOT A MIDPOINT TO DRIFT BELOW:
  • Anchor genuinely neutral, factual wire copy at EXACTLY 5.0 (neutral verbs, no loaded
    adjectives, no victim framing, no ideological signal).
  • Do NOT deduct below 5.0 merely for lacking conservative framing — absence of right-framing
    is not evidence of left bias. Left of 5.0 requires an actual left-coded signal.
  • Subject matter alone does NOT set the score — only the WORDING moves it.
  • When in doubt between "slightly biased" and "neutral", score 5.0.`

function buildPrompt(items) {
  const list = items
    .map((c, i) => `[${i}] @${c.author_handle}: ${c.text}`)
    .join('\n')

  return `Score these X news posts for political language bias.

${SCALE_BLOCK}

POSTS:
${list}

For EACH post return:
  index      : input index
  biasScore  : 0.0–10.0, one decimal
  biasSignals: exactly 2 observations, <=10 words each
  rationale  : ONE plain-English sentence <=140 chars, no jargon — shown publicly on X

Respond JSON only:
{"scores":[{"index":0,"biasScore":3.2,"biasSignals":["...","..."],"rationale":"..."}]}
RULES:
  • Score every post — all ${items.length} indices.`
}

/**
 * Scores survivors. Returns candidates augmented with bias_score / bias_signals /
 * rationale / score_model / content_hash. Cache hits skip the model entirely.
 * On Grok failure the uncached items are returned unscored (status handled by caller).
 */
async function scoreCandidates(supabase, survivors) {
  if (survivors.length === 0) return []

  const withHash = survivors.map((c) => ({ ...c, content_hash: contentHash(c.text) }))
  const cache = await getCachedScores(supabase, [...new Set(withHash.map((c) => c.content_hash))])

  const cached = []
  const toScore = []
  for (const c of withHash) {
    const hit = cache.get(c.content_hash)
    if (hit) {
      cached.push({
        ...c,
        bias_score: Number(hit.bias_score),
        bias_signals: hit.bias_signals || [],
        rationale: hit.rationale || null,
        score_model: hit.score_model || SCORE_MODEL,
        _cacheHit: true,
      })
    } else {
      toScore.push(c)
    }
  }
  if (cached.length) console.log(`   ↺ ${cached.length} scored from cache`)

  let scored = []
  if (toScore.length) {
    try {
      const { data } = await chatJson({
        prompt: buildPrompt(toScore),
        system:
          'You are a computational linguistics researcher specializing in political media bias analysis. You always respond with valid JSON only, no preamble or explanation.',
        maxTokens: 6000,
      })
      const byIndex = new Map((data?.scores ?? []).map((s) => [s.index, s]))
      for (let i = 0; i < toScore.length; i++) {
        const s = byIndex.get(i)
        const c = toScore[i]
        if (!s) {
          scored.push({ ...c, bias_score: null })
          continue
        }
        const bias = Math.max(0, Math.min(10, Number(s.biasScore)))
        const row = {
          ...c,
          bias_score: Math.round(bias * 10) / 10,
          bias_signals: Array.isArray(s.biasSignals) ? s.biasSignals.slice(0, 2) : [],
          rationale: (s.rationale || '').slice(0, 140) || null,
          score_model: SCORE_MODEL,
        }
        scored.push(row)
        // Persist to cache for future near-duplicates.
        if (row.bias_score != null) {
          await putCachedScore(supabase, {
            content_hash: c.content_hash,
            bias_score: row.bias_score,
            bias_signals: row.bias_signals,
            rationale: row.rationale,
            score_model: SCORE_MODEL,
          })
        }
      }
      console.log(`   ✓ Scored ${scored.filter((r) => r.bias_score != null).length}/${toScore.length} via ${SCORE_MODEL}`)
    } catch (err) {
      console.warn(`   ⚠ Scoring Grok call failed: ${err.message} — items left unscored`)
      scored = toScore.map((c) => ({ ...c, bias_score: null }))
    }
  }

  return [...cached, ...scored]
}

module.exports = { scoreCandidates, contentHash, buildPrompt }
