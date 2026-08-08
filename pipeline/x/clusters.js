/**
 * Match a viral tweet to a story cluster the daily pipeline already scored.
 *
 * This is the highest-value, lowest-cost path in the whole system. The daily
 * pipeline already scores every tracked outlet's coverage and groups it into
 * story clusters. If a viral tweet is about a story we've already clustered, we
 * can answer "how did the other outlets word this?" from data sitting in
 * Postgres — no Grok call, and the reply says something no other account on X
 * can say.
 *
 * Only when there's no cluster match do we fall back to paying to score the
 * single tweet on its own.
 */

const { similarity } = require('./dedupe')

// Cluster match needs a HIGHER bar than the story-dedupe threshold (0.18).
// Dedupe asks "might these be the same story?" and a false positive merely
// skips a post. Here a false positive puts wrong outlet names in a public
// reply, so we want confidence, not recall.
const MATCH_THRESHOLD = () => Number(process.env.CLUSTER_MATCH_THRESHOLD) || 0.26

// A comparison reply needs at least this many outlets to be interesting.
// "2 outlets disagree" is an anecdote; 3+ is a pattern.
const MIN_OUTLETS = 3

/**
 * Load today's and yesterday's scored clusters with their articles.
 * Two days because a story breaking at 23:00 UTC gets clustered under one date
 * and keeps trending into the next.
 */
async function loadRecentClusters(supabase) {
  const iso = (d) => d.toISOString().slice(0, 10)
  const today = new Date()
  const dates = [iso(new Date(today.getTime() - 24 * 60 * 60 * 1000)), iso(today)]

  const [{ data: clusters, error: ce }, { data: articles, error: ae }] = await Promise.all([
    supabase.from('story_clusters').select('cluster_id, topic_label, date').in('date', dates),
    supabase
      .from('articles')
      .select('cluster_id, outlet_id, outlet_name, headline, bias_score, date')
      .in('date', dates),
  ])

  if (ce || ae) {
    console.warn(`   ⚠ cluster load failed: ${(ce || ae).message} — falling back to per-post scoring`)
    return []
  }

  const byCluster = new Map()
  for (const a of articles || []) {
    if (a.bias_score == null) continue
    if (!byCluster.has(a.cluster_id)) byCluster.set(a.cluster_id, [])
    byCluster.get(a.cluster_id).push(a)
  }

  return (clusters || [])
    .map((c) => ({
      clusterId: c.cluster_id,
      topicLabel: c.topic_label,
      date: c.date,
      articles: byCluster.get(c.cluster_id) || [],
      // Match against the cluster's headline text, not its topic label — labels
      // are short and generic ("Trump tariffs"), headlines carry the detail that
      // makes Jaccard discriminative.
      corpus: (byCluster.get(c.cluster_id) || []).map((a) => a.headline).join(' '),
    }))
    .filter((c) => c.articles.length >= MIN_OUTLETS)
}

/**
 * Best cluster for a tweet, or null. Compares the tweet against each cluster's
 * combined headline corpus AND its single best-matching headline — the corpus
 * catches broad topical overlap, the per-headline max catches the case where one
 * outlet's wording is near-identical to the tweet but the cluster is large
 * enough to dilute the corpus score.
 */
function matchCluster(tweetText, clusters) {
  let best = null
  for (const c of clusters) {
    const corpusSim = similarity(tweetText, c.corpus)
    let headlineSim = 0
    for (const a of c.articles) {
      const s = similarity(tweetText, a.headline)
      if (s > headlineSim) headlineSim = s
    }
    const score = Math.max(corpusSim, headlineSim)
    if (!best || score > best.score) best = { cluster: c, score }
  }
  if (!best || best.score < MATCH_THRESHOLD()) return null
  return best
}

/**
 * Spread summary for a matched cluster: the outlets, sorted left→right, plus the
 * gap between the extremes. Dedupes to one article per outlet (the daily
 * pipeline can cluster two pieces from the same outlet) keeping the outlet's
 * most extreme take, since that's the one worth naming.
 */
function clusterSpread(cluster) {
  const byOutlet = new Map()
  for (const a of cluster.articles) {
    const prev = byOutlet.get(a.outlet_id)
    const dev = Math.abs(Number(a.bias_score) - 5)
    if (!prev || dev > Math.abs(Number(prev.bias_score) - 5)) byOutlet.set(a.outlet_id, a)
  }

  const outlets = [...byOutlet.values()]
    .map((a) => ({
      outletId: a.outlet_id,
      name: a.outlet_name,
      headline: a.headline,
      score: Number(a.bias_score),
    }))
    .sort((a, b) => a.score - b.score)

  if (outlets.length === 0) return null
  return {
    clusterId: cluster.clusterId,
    topicLabel: cluster.topicLabel,
    date: cluster.date,
    outlets,
    left: outlets[0],
    right: outlets[outlets.length - 1],
    gap: Math.round((outlets[outlets.length - 1].score - outlets[0].score) * 10) / 10,
  }
}

/**
 * Attach cluster context to candidates. Each gets `cluster` (a spread summary)
 * or null. Costs one pair of Supabase reads for the whole batch.
 */
async function attachClusters(supabase, candidates) {
  if (candidates.length === 0) return candidates
  const clusters = await loadRecentClusters(supabase)
  if (clusters.length === 0) {
    console.log('   ℹ No scored clusters available — all candidates will need per-post scoring')
    return candidates.map((c) => ({ ...c, cluster: null }))
  }

  let matched = 0
  const out = candidates.map((c) => {
    const hit = matchCluster(c.text, clusters)
    if (!hit) return { ...c, cluster: null }
    const spread = clusterSpread(hit.cluster)
    if (!spread) return { ...c, cluster: null }
    matched++
    return { ...c, cluster: { ...spread, matchScore: Math.round(hit.score * 100) / 100 } }
  })

  console.log(
    `   ✓ ${matched}/${candidates.length} matched a scored cluster ` +
      `(${clusters.length} clusters in window) — those reply for free`,
  )
  return out
}

module.exports = {
  attachClusters,
  loadRecentClusters,
  matchCluster,
  clusterSpread,
  MIN_OUTLETS,
}
