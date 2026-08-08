/**
 * Daily digest — the review step for unattended posting.
 *
 * Auto-posting is only acceptable if you can audit it cheaply afterwards. This
 * prints everything that went out in the last 24h, everything the guardrails
 * stopped and why, and what it all cost. Written to the GitHub Actions job
 * summary so it lands somewhere you'll actually look, with no email plumbing.
 *
 * Usage: node pipeline/x/digest.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.local') })

const {
  getSupabase,
  getPostsToday,
  getSkippedToday,
  getDryRunToday,
  getSpendToday,
} = require('./db')
const { cfg } = require('./guardrails')

/** Group an array by a key function into a Map. */
function groupBy(rows, keyFn) {
  const m = new Map()
  for (const r of rows) {
    const k = keyFn(r)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(r)
  }
  return m
}

function bar(n, max, width = 20) {
  if (max <= 0) return ''
  return '█'.repeat(Math.max(1, Math.round((n / max) * width)))
}

async function main() {
  const supabase = getSupabase()
  const [posts, skipped, dryRun, spend] = await Promise.all([
    getPostsToday(supabase),
    getSkippedToday(supabase),
    getDryRunToday(supabase),
    getSpendToday(supabase),
  ])

  const lines = []
  const out = (s = '') => lines.push(s)

  out('# 🐦 Spin Detector — X reply digest')
  out()
  out(
    `**${posts.length}** published · **${dryRun.length}** withheld (dry run) · ` +
      `**${skipped.length}** stopped · **$${spend.toFixed(4)}** xAI spend today`,
  )
  out()

  // ── Composed but not published ────────────────────────────────────────────
  // The review surface for dry-run mode. These cleared every guardrail and are
  // exactly what would have gone out live, so this is the section to read
  // before flipping X_AUTOPOST on.
  if (dryRun.length > 0) {
    out('## Would have posted (dry run)')
    out()
    out('These passed every guardrail. This is the text that would have been published.')
    out()
    for (const d of dryRun) {
      const when = new Date(d.created_at).toISOString().slice(11, 16)
      out(`### ${when}Z → @${d.author_handle} \`${d.reply_format || '?'}\``)
      out()
      out('**Replying to:**')
      out(`> ${String(d.text || '').slice(0, 200)}`)
      out(`> — [${d.author_handle}](${d.tweet_url || '#'})`)
      out()
      out('**Our reply:**')
      out()
      out('```')
      out(d.composed_text)
      out('```')
      if (d.cluster_id) out(`Matched cluster \`${d.cluster_id}\` — cost $0 to compose.`)
      out()
    }
  }

  // ── What went out ─────────────────────────────────────────────────────────
  out('## Published')
  if (posts.length === 0) {
    out('_Nothing published today._')
    if (!cfg.autopost()) {
      out()
      out('> ⚠️ `X_AUTOPOST` is not `on` — dry-run mode. Replies are composed and')
      out('> recorded above, but never sent to X.')
    }
  } else {
    for (const p of posts) {
      const when = new Date(p.posted_at).toISOString().slice(11, 16)
      const url = p.tweet_id ? `https://x.com/i/status/${p.tweet_id}` : '—'
      out(`### ${when}Z → @${p.reply_to_handle} \`${p.format}\``)
      out()
      out('```')
      out(p.text)
      out('```')
      out(`[our reply](${url}) · [parent](${p.reply_to_url || '—'})` +
          (p.cluster_id ? ` · cluster \`${p.cluster_id}\`` : ''))
      out()
    }
  }

  // ── Why things were stopped ───────────────────────────────────────────────
  out('## Stopped, and why')
  if (skipped.length === 0) {
    out('_Nothing stopped._')
  } else {
    // Normalise reasons so the histogram is readable — strip the variable parts
    // (handles, numbers) that would otherwise make every reason unique.
    const norm = (r) =>
      String(r || 'unknown')
        .replace(/@\w+/g, '@…')
        .replace(/\d+(\.\d+)?/g, 'N')
    const byReason = groupBy(skipped, (r) => norm(r.status_note))
    const sorted = [...byReason.entries()].sort((a, b) => b[1].length - a[1].length)
    const max = sorted[0][1].length
    out()
    out('| count | reason |')
    out('| ---: | :--- |')
    for (const [reason, rows] of sorted) {
      out(`| ${rows.length} ${bar(rows.length, max, 10)} | ${reason} |`)
    }
    out()
    out('<details><summary>Blocked by the topic filter (check for false positives)</summary>')
    out()
    const topicBlocked = skipped.filter((r) => /blocked topic group/.test(r.status_note || ''))
    if (topicBlocked.length === 0) out('_None._')
    for (const r of topicBlocked.slice(0, 25)) {
      out(`- **@${r.author_handle}** — ${r.status_note}`)
      out(`  > ${String(r.text || '').slice(0, 160)}`)
    }
    out()
    out('</details>')
  }

  // ── Config in force ───────────────────────────────────────────────────────
  out()
  out('## Settings in force')
  out()
  out('| setting | value |')
  out('| :--- | ---: |')
  out(`| autopost | \`${cfg.autopost() ? 'ON' : 'off (dry run)'}\` |`)
  out(`| daily reply cap | ${cfg.dailyCap()} |`)
  out(`| replies per outlet per day | ${cfg.perParentPerDay()} |`)
  out(`| min parent followers | ${cfg.minFollowers().toLocaleString('en-US')} |`)
  out(`| max parent age | ${cfg.maxAgeMinutes()} min |`)
  out(`| daily xAI budget | $${(Number(process.env.DAILY_COST_BUDGET_USD) || 1.0).toFixed(2)} |`)
  out()
  out('Flip `X_AUTOPOST` to `off` in repo variables to stop posting immediately — no deploy needed.')

  const text = lines.join('\n')
  console.log(text)

  const fs = require('fs')

  // Actions job summary — the always-available copy.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) fs.appendFileSync(summaryPath, text + '\n')

  // File copy, for the workflow step that opens the digest as a GitHub issue.
  // Written explicitly rather than by shell redirection so warnings on stderr
  // can never end up inside the issue body.
  const outFile = process.env.DIGEST_OUTPUT_FILE
  if (outFile) {
    fs.writeFileSync(outFile, text, 'utf8')
    console.error(`\n(digest also written to ${outFile})`)
  }
}

main().catch((err) => {
  console.error(`Digest failed: ${err.message}`)
  process.exit(1)
})
