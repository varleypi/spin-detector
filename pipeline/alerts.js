/**
 * Pipeline alerting helpers — making silent degradation visible.
 *
 * Why this exists: on 2026-08-03 the xAI account ran out of credits. The daily
 * pipeline caught the 403, logged a warning buried in ~2000 lines of run output,
 * and exited 0 — so the job stayed green while the site quietly lost every Grok
 * score (Battleground's second opinion, Model Wars entirely) for five days.
 * Meanwhile the X viral-scoring workflow hard-failed on the same 403 three times
 * a day, so the one alert that DID fire was the one that couldn't be acted on
 * differently. Both behaviours were wrong in opposite directions.
 *
 *   • annotate()          — surfaces a warning on the Actions run summary itself,
 *                           not just in the log body.
 *   • isXaiBillingError() — distinguishes "we're out of money" (a standing
 *                           condition; don't cry wolf) from a real break.
 */

// Workflow commands must not contain raw newlines — GitHub would treat each line
// as a separate (malformed) command.
function escapeAnnotation(s) {
  return String(s).replace(/\r?\n/g, ' ').trim()
}

/**
 * Emit a GitHub Actions annotation, which appears on the run summary page and in
 * the job's Annotations panel. Outside CI it degrades to an ordinary console line
 * so local runs read normally.
 *
 * @param level   'warning' | 'error' | 'notice'
 * @param title   short label shown in bold on the summary
 * @param message one-line detail
 */
function annotate(level, title, message) {
  const text = escapeAnnotation(message)
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::${level} title=${escapeAnnotation(title)}::${text}`)
  } else {
    const icon = level === 'error' ? '❌' : level === 'warning' ? '⚠' : 'ℹ'
    console.log(`${icon} ${title}: ${text}`)
  }
}

/**
 * True when an error is xAI refusing the request for billing reasons rather than
 * anything wrong with our code or key.
 *
 * xAI returns HTTP 403 with code "permission-denied" for both exhausted prepaid
 * credits and a hit monthly spending limit — the message covers both cases in one
 * string. We match on the 403 plus the billing wording so an unrelated 403 (a
 * revoked key, a model our team can't access) still fails loudly.
 */
function isXaiBillingError(err) {
  const msg = String(err?.message ?? err ?? '')
  if (!/\b403\b/.test(msg)) return false
  return /permission-denied/i.test(msg) && /credits|spending limit/i.test(msg)
}

const XAI_BILLING_HINT =
  'xAI account is out of credits or has hit its monthly spending limit. ' +
  'Add credits at https://console.x.ai → Billing. No code change needed.'

module.exports = { annotate, isXaiBillingError, XAI_BILLING_HINT }
