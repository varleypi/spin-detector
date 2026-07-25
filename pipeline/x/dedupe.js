/**
 * Story-level near-duplicate detection.
 *
 * content_hash (score.js) only catches byte-identical normalized text. It misses
 * the common case: three accounts reporting the SAME event in different words
 * ("Trump arrives at the Correspondents' Dinner" / "Trump takes the stage at the
 * rescheduled WHCA Dinner"). Posting all three would look broken.
 *
 * Cheap, no-model approach: Jaccard similarity over content words. Runs locally,
 * costs nothing, and is plenty for "is this the same story?".
 */

// Common words that carry no story identity — dropping them stops generic
// newsroom vocabulary ("breaking", "just in") from making everything look similar.
const STOP = new Set(
  ('a an the and or but of to in on at for with from by as is are was were be been being ' +
    'this that these those it its his her their they he she we you i not no do does did ' +
    'has have had will would can could should may might just now new breaking live watch ' +
    'update updates report reports says said announces announced after before amid over')
    .split(' '),
)

/** Normalize to a set of content-bearing tokens. */
function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[@#]\w+/g, ' ')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

/** Jaccard similarity: |intersection| / |union|. 0 = unrelated, 1 = identical. */
function similarity(aText, bText) {
  const a = tokenize(aText)
  const b = tokenize(bText)
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / (a.size + b.size - shared)
}

// Calibrated against a real 31-candidate batch (465 pairs, 2026-07-24):
//   • genuine same-story pairs scored 0.200 – 1.000
//     (3 outlets on the Smithsonian signs story; 5 on the Correspondents' Dinner)
//   • unrelated pairs that merely share "Trump" topped out at 0.154
// 0.18 sits in that gap. Re-check if headline styles drift.
const THRESHOLD = () => Number(process.env.STORY_DEDUPE_THRESHOLD) || 0.18

/**
 * Split candidates into { unique, duplicates }.
 *
 * `priorTexts` are texts already queued/posted recently — a new candidate matching
 * one of those is a duplicate even if it's the only one in this batch.
 * Within the batch, the FIRST candidate wins (callers should pass them in the
 * order they'd prefer to keep — e.g. highest virality first).
 */
function dedupeStories(candidates, priorTexts = []) {
  const kept = []
  const duplicates = []
  const seenTexts = [...priorTexts]

  for (const c of candidates) {
    const match = seenTexts.find((t) => similarity(c.text, t) >= THRESHOLD())
    if (match) {
      duplicates.push({ ...c, _duplicateOf: match })
    } else {
      kept.push(c)
      seenTexts.push(c.text)
    }
  }
  return { unique: kept, duplicates }
}

module.exports = { dedupeStories, similarity, tokenize }
