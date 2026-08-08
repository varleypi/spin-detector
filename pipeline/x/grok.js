/**
 * Shared Grok (xAI) helpers for the X viral-scoring pipeline.
 *
 * Uses XAI_API_KEY (same as pipeline/cluster.js). Two capabilities:
 *   • chatJson()    — a plain chat completion that must return JSON (scoring/prefilter).
 *   • xSearchJson() — the Agent Tools API (/v1/responses) with the built-in x_search
 *                     tool, for live X discovery. Replaces the deprecated Live Search
 *                     (search_parameters) API, which xAI removed (HTTP 410).
 *                     Docs: https://docs.x.ai/docs/guides/tools/overview
 *
 * All calls return parsed JSON (or throw). Callers decide how to degrade.
 */

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions'
const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses'
const DEFAULT_MODEL = 'grok-3-mini'
// x_search is an agentic tool — only tool-capable models support it.
const DEFAULT_SEARCH_MODEL = 'grok-4.5'

// Pull the first {...} or [...] JSON blob out of a model response.
function extractJson(text) {
  if (!text) throw new Error('empty Grok response')
  const start = text.search(/[[{]/)
  if (start === -1) throw new Error('no JSON found in Grok response')
  // Walk from the first bracket to its matching close.
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close) depth--
    if (depth === 0) return JSON.parse(text.slice(start, i + 1))
  }
  throw new Error('unbalanced JSON in Grok response')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Is this worth retrying? 5xx and 429 are xAI-side and transient; observed
 * repeatedly during calibration as `500 {"code":"internal","error":"Internal
 * error during token parsing"}` on otherwise valid requests. 4xx (bad request,
 * bad key, out of credits) will fail identically forever — retrying those just
 * burns time and, for billing errors, hides the real cause.
 */
function isRetryable(status) {
  return status === 429 || (status >= 500 && status < 600)
}

/**
 * POST to xAI with bounded retries on transient failures.
 *
 * This matters more than it looks: the pipeline runs unattended ~12×/day with
 * no human watching, and a single 500 on the discovery call otherwise wastes
 * the entire run — and its slot in the news cycle.
 */
async function callXai(body, timeoutMs = 60000, url = XAI_CHAT_URL, attempts = 3) {
  if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY not set')

  let lastErr = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let retryable = true // network/timeout failures default to retryable
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.ok) return response.json()

      retryable = isRetryable(response.status)
      lastErr = new Error(`xAI API ${response.status}: ${await response.text()}`)
    } catch (err) {
      lastErr = err
    }

    if (!retryable || attempt === attempts) throw lastErr

    const backoff = 1000 * 2 ** (attempt - 1) // 1s, then 2s
    console.warn(`   ↻ xAI call failed (attempt ${attempt}/${attempts}), retrying in ${backoff}ms`)
    console.warn(`     ${lastErr.message.slice(0, 140)}`)
    await sleep(backoff)
  }
  throw lastErr
}

/**
 * Plain JSON completion. `system` defaults to a strict "JSON only" instruction.
 */
async function chatJson({ prompt, system, model = DEFAULT_MODEL, maxTokens = 8000 }) {
  const json = await callXai({
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content:
          system ||
          'You are a precise analyst. You always respond with valid JSON only, no preamble or explanation.',
      },
      { role: 'user', content: prompt },
    ],
  })
  const text = json?.choices?.[0]?.message?.content ?? ''
  return { data: extractJson(text), raw: json, usage: json?.usage ?? null }
}

/**
 * Pull the assistant's text out of a /v1/responses payload. The Responses API
 * returns an `output` array of items (reasoning, tool calls, and the message);
 * we want the concatenated text of the final assistant message. Falls back to
 * output_text / chat-completions shapes so a schema tweak doesn't break us.
 */
function responseText(json) {
  if (typeof json?.output_text === 'string' && json.output_text.trim()) return json.output_text
  const out = Array.isArray(json?.output) ? json.output : []
  const parts = []
  for (const item of out) {
    if (item?.type && item.type !== 'message') continue
    for (const c of item?.content ?? []) {
      if (typeof c?.text === 'string') parts.push(c.text)
    }
  }
  if (parts.length) return parts.join('')
  return json?.choices?.[0]?.message?.content ?? ''
}

// Citations may arrive top-level or attached to the message item.
function responseCitations(json) {
  if (Array.isArray(json?.citations)) return json.citations
  const out = Array.isArray(json?.output) ? json.output : []
  for (const item of out) {
    if (Array.isArray(item?.citations)) return item.citations
  }
  return []
}

/**
 * X search via the Agent Tools API (/v1/responses + built-in `x_search` tool).
 * Grok agentically searches live X posts, then answers. Non-streaming.
 *
 * `fromDate`/`toDate` are ISO dates (YYYY-MM-DD). `allowedHandles` /
 * `excludedHandles` are arrays of bare handles (max 20, mutually exclusive).
 * Returns { data, raw, citations, usage }.
 *
 * COST: this is the single most expensive call in the system. Two components,
 * both controlled here:
 *   • tokens        — grok-4.5 is $2/M in, $6/M out, and `reasoning.effort`
 *                     DEFAULTS TO "high". On an agentic loop that means tens of
 *                     thousands of reasoning tokens per run. We default to
 *                     "low": this is a "find and list posts" task, not a
 *                     reasoning task, and low effort answers it just as well.
 *   • tool calls    — $5 per 1,000 x_search invocations. Fewer agentic
 *                     round-trips is the only lever, and a narrow search
 *                     (allowed handles + a tight date window) is what buys it.
 */
async function xSearchJson({
  prompt,
  system,
  model = process.env.XAI_SEARCH_MODEL || DEFAULT_SEARCH_MODEL,
  fromDate,
  toDate,
  allowedHandles,
  excludedHandles,
  effort = process.env.XAI_SEARCH_EFFORT || 'low',
  maxOutputTokens = Number(process.env.XAI_SEARCH_MAX_TOKENS) || 4000,
}) {
  const tool = { type: 'x_search' }
  if (fromDate) tool.from_date = fromDate
  if (toDate) tool.to_date = toDate
  if (allowedHandles?.length) tool.allowed_x_handles = allowedHandles.slice(0, 20)
  else if (excludedHandles?.length) tool.excluded_x_handles = excludedHandles.slice(0, 20)

  const input = []
  if (system) input.push({ role: 'system', content: system })
  input.push({ role: 'user', content: prompt })

  const json = await callXai(
    {
      model,
      stream: false,
      input,
      tools: [tool],
      reasoning: { effort },
      max_output_tokens: maxOutputTokens,
    },
    120000, // agentic search does multiple round-trips, but low effort is quick
    XAI_RESPONSES_URL,
  )
  return {
    data: extractJson(responseText(json)),
    raw: json,
    citations: responseCitations(json),
    usage: json?.usage ?? null,
  }
}

/**
 * Actual USD cost of a call, straight from xAI's `usage`. They report
 * `cost_in_usd_ticks` at 1e-10 USD per tick — verified 2026-08-08 against a live
 * call (158,964,000 ticks = $0.0159, matching hand-computed token + tool-call
 * rates to the cached-token discount). Falls back to computing from token counts
 * if the field ever disappears.
 */
const USD_PER_TICK = 1e-10

function callCost(usage) {
  const inTok = usage?.input_tokens ?? usage?.prompt_tokens ?? 0
  const outTok = usage?.output_tokens ?? usage?.completion_tokens ?? 0
  const reasoning = usage?.output_tokens_details?.reasoning_tokens ?? 0
  const toolCalls = usage?.server_side_tool_usage_details?.x_search_calls ?? 0
  const usd =
    typeof usage?.cost_in_usd_ticks === 'number'
      ? usage.cost_in_usd_ticks * USD_PER_TICK
      : (inTok / 1e6) * 2 + (outTok / 1e6) * 6 + toolCalls * 0.005
  return { inTok, outTok, reasoning, toolCalls, usd }
}

/** One-line cost summary for the run log. */
function costLine(usage, label = 'call') {
  const c = callCost(usage)
  return (
    `   💸 ${label}: $${c.usd.toFixed(4)} ` +
    `(${c.inTok} in / ${c.outTok} out, ${c.reasoning} reasoning, ${c.toolCalls} search calls)`
  )
}

module.exports = {
  chatJson,
  xSearchJson,
  extractJson,
  responseText,
  callCost,
  costLine,
  DEFAULT_MODEL,
  DEFAULT_SEARCH_MODEL,
}
