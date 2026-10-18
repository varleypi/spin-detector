// Thin fetch wrappers for the two providers, mirroring how pipeline/cluster.js
// calls them (same endpoints, same system prompt). Retries transient errors.

async function post(url, headers, body, label) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) return await res.json();
      const text = await res.text();
      lastErr = new Error(`${label} API ${res.status}: ${text.slice(0, 300)}`);
      // Only retry rate limits and server errors.
      if (res.status !== 429 && res.status < 500) throw lastErr;
    } catch (err) {
      lastErr = err;
      if (/API 4\d\d/.test(String(err.message)) && !/API 429/.test(String(err.message))) throw err;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  throw lastErr;
}

export async function callAnthropic({ apiKey, model, system, user, maxTokens = 4000 }) {
  const data = await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
    "Anthropic"
  );
  return data.content?.find((b) => b.type === "text")?.text ?? "";
}

export async function callXai({ apiKey, model, system, user, maxTokens = 16000 }) {
  const data = await post(
    "https://api.x.ai/v1/chat/completions",
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    "xAI"
  );
  return data.choices?.[0]?.message?.content ?? "";
}
