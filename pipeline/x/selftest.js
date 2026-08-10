/**
 * Self-test for the X auto-reply safety and formatting logic.
 *
 * No network, no database, no API keys — pure functions only, so it runs in
 * under a second and can gate a deploy. It exists because this subsystem posts
 * publicly without a human in the loop: if a guardrail silently stops working,
 * nothing else in the stack will tell you.
 *
 * Run: npm run x:test
 */

const { composeReply } = require('./compose')
const { checkCandidate, blockedTopic } = require('./guardrails')
const { viralityScore, hasClaim } = require('./prefilter')
const { matchCluster, clusterSpread } = require('./clusters')
const { isReplyTarget, outletForHandle } = require('../xHandles')

let fails = 0
const ok = (cond, msg) => {
  if (!cond) { fails++; console.log('  ✗ ' + msg) } else console.log('  ✓ ' + msg)
}

console.log('\n— handles —')
ok(isReplyTarget('CNN') && isReplyTarget('@FoxNews'), 'tracked outlets are reply targets')
ok(!isReplyTarget('elonmusk'), 'random account is NOT a reply target')
ok(!isReplyTarget('neutralnews'), 'own sister site excluded')
ok(outletForHandle('washingtonpost') === 'washpost', 'handle → outletId')

console.log('\n— blocklist —')
ok(blockedTopic('Five dead after shooting at mall') === 'harm', 'mass casualty blocked')
ok(blockedTopic('Funeral held for former senator') === 'grief', 'grief blocked')
ok(blockedTopic('Senate passes tax bill after long debate') === null, 'ordinary politics allowed')
ok(blockedTopic('Trump indicted on federal charges') === 'legal', 'legal blocked by default')

console.log('\n— prefilter —')
ok(!hasClaim('WATCH: live coverage'), 'teaser has no claim')
ok(!hasClaim('Breaking'), 'one-word breaking has no claim')
ok(hasClaim('Senate passes sweeping tax package after all-night session'), 'headline has a claim')
const fresh = viralityScore({ velocity: 60, author_followers: 5e6, age_minutes: 10 })
const stale = viralityScore({ velocity: 60, author_followers: 5e6, age_minutes: 300 })
ok(fresh > stale, `fresh (${fresh}) ranks above stale (${stale})`)

console.log('\n— cluster match + compose —')
const clusters = [{
  clusterId: 'c1', topicLabel: 'Tariffs', date: '2026-08-08',
  articles: [
    { outlet_id: 'cnn', outlet_name: 'CNN', headline: 'Trump tariff plan sparks fears of higher grocery prices', bias_score: 3.2 },
    { outlet_id: 'ap', outlet_name: 'Associated Press', headline: 'Trump announces new tariffs on imported goods', bias_score: 5.0 },
    { outlet_id: 'foxnews', outlet_name: 'Fox News', headline: 'Trump tariff plan aims to protect American manufacturing jobs', bias_score: 7.1 },
    { outlet_id: 'nytimes', outlet_name: 'NY Times', headline: 'Economists warn Trump tariff plan could raise consumer costs', bias_score: 3.8 },
  ],
  corpus: 'Trump tariff plan sparks fears of higher grocery prices Trump announces new tariffs on imported goods Trump tariff plan aims to protect American manufacturing jobs Economists warn Trump tariff plan could raise consumer costs',
}]

const tweet = 'Trump tariff plan sparks fears of higher grocery prices for families'
const hit = matchCluster(tweet, clusters)
ok(hit !== null, `matched cluster (score ${hit && hit.score.toFixed(3)})`)
ok(matchCluster('Federal Reserve holds interest rates steady this quarter', clusters) === null, 'unrelated tweet does not match')

const spread = clusterSpread(clusters[0])
ok(spread.outlets.length === 4, '4 outlets in spread')
ok(spread.left.outletId === 'cnn' && spread.right.outletId === 'foxnews', 'sorted left→right')
ok(spread.gap === 3.9, `gap ${spread.gap}`)

const cand = { tweet_id: '1', author_handle: 'CNN', text: tweet, cluster: { ...spread, matchScore: 0.4 } }
const reply = composeReply(cand)
ok(reply && reply.format === 'comparison', 'composed a comparison reply')
ok(reply && reply.text.length <= 280, `within 280 (${reply && reply.text.length})`)
ok(reply && !/https?:\/\//.test(reply.text), 'contains no link')
ok(reply && !/^@/.test(reply.text), 'does not start with @mention')
console.log('\n  ┌─ comparison reply ─────────────')
console.log(reply.text.split('\n').map(l => '  │ ' + l).join('\n'))
console.log('  └────────────────────────────────')

const single = composeReply({
  tweet_id: '2', author_handle: 'FoxNews',
  text: 'Border surge continues as officials scramble',
  bias_score: 7.3, rationale: '"Surge" and "scramble" frame routine processing as a crisis.',
  cluster: null,
})
ok(single && single.format === 'single', 'composed a single reply')
ok(single && single.text.length <= 280, `within 280 (${single && single.text.length})`)
console.log('\n  ┌─ single reply ─────────────────')
console.log(single.text.split('\n').map(l => '  │ ' + l).join('\n'))
console.log('  └────────────────────────────────')

console.log('\n— guardrails —')
const state = { postedToday: 0, perParent: new Map(), degraded: false }
const good = { author_handle: 'CNN', text: tweet, author_followers: 6e6, age_minutes: 30, cluster: spread, bias_score: null }
ok(checkCandidate(good, state).ok, 'good candidate passes')
ok(!checkCandidate({ ...good, author_handle: 'somerandomguy' }, state).ok, 'untracked parent blocked')
ok(!checkCandidate({ ...good, text: 'Three dead in crash' }, state).ok, 'blocked topic blocked')
ok(!checkCandidate({ ...good, author_followers: 1000 }, state).ok, 'low reach blocked')
ok(!checkCandidate({ ...good, age_minutes: 400 }, state).ok, 'stale parent blocked')
ok(!checkCandidate({ ...good, cluster: null, bias_score: 5.2 }, state).ok, 'neutral single-post blocked')
ok(checkCandidate({ ...good, cluster: null, bias_score: 7.5 }, state).ok, 'slanted single-post passes')

// A cluster where every outlet agreed says nothing — must not post. Regression
// test for the real "CNN +0.0 · Metro +0.0 · Sky +0.0" reply composed 2026-08-10.
const flatSpread = { ...spread, gap: 0.0, outlets: spread.outlets.map((o) => ({ ...o, score: 5.0 })) }
ok(!checkCandidate({ ...good, cluster: flatSpread, bias_score: null }, state).ok,
  'flat cluster (no spread, no score) blocked')
ok(checkCandidate({ ...good, cluster: flatSpread, bias_score: 7.5 }, state).ok,
  'flat cluster still posts when the post itself has a real lean')
ok(checkCandidate({ ...good, cluster: spread }, state).ok,
  'cluster with a real gap passes')

const capped = { postedToday: 0, perParent: new Map([['cnn', 1]]), degraded: false }
ok(!checkCandidate(good, capped).ok, 'per-parent cap blocks 2nd reply to same outlet')
const full = { postedToday: 99, perParent: new Map(), degraded: false }
ok(!checkCandidate(good, full).ok, 'daily cap blocks')
const degraded = { postedToday: Infinity, perParent: new Map(), degraded: true }
ok(!checkCandidate(good, degraded).ok, 'DB failure fails closed')

console.log(fails === 0 ? '\n✅ all logic tests passed\n' : `\n❌ ${fails} failed\n`)
process.exit(fails === 0 ? 0 : 1)
