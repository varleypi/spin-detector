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

async function callXai(body, timeoutMs = 60000, url = XAI_CHAT_URL) {
  if (!process.env.XAI_API_KEY) throw new Error('XAI_API_KEY not set')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`xAI API ${response.status}: ${await response.text()}`)
  }
  return response.json()
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
  return { data: extractJson(text), raw: json }
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
 * Returns { data, raw, citations }.
 */
async function xSearchJson({
  prompt,
  system,
  model = process.env.XAI_SEARCH_MODEL || DEFAULT_SEARCH_MODEL,
  fromDate,
  toDate,
  allowedHandles,
  excludedHandles,
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
    { model, stream: false, input, tools: [tool] },
    180000, // agentic search does multiple round-trips — allow generous time
    XAI_RESPONSES_URL,
  )
  return {
    data: extractJson(responseText(json)),
    raw: json,
    citations: responseCitations(json),
  }
}

module.exports = {
  chatJson,
  xSearchJson,
  extractJson,
  responseText,
  DEFAULT_MODEL,
  DEFAULT_SEARCH_MODEL,
}
