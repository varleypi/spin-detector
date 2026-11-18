// Builds the same scoring prompt production sends to Grok (pipeline/cluster.js
// buildGrokPrompt) and scores golden-set items in batches.
//
// Why that prompt for both models: it is production's scoring-only prompt.
// Production's Claude prompt also clusters headlines by story, which can't be
// applied to a hand-picked set of unrelated headlines. The SCALE and
// CALIBRATION text is identical in both (npm run check-prompt verifies the
// copy in prompts/ hasn't drifted from the pipeline).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts");

export function loadPrompts() {
  return {
    system: readFileSync(join(promptsDir, "system-prompt.txt"), "utf8").trim(),
    template: readFileSync(join(promptsDir, "scoring-prompt.txt"), "utf8"),
  };
}

// Same line format as production: "[i] OUTLETID | topic: headline"
export function buildBatchPrompt(template, items) {
  const list = items
    .map((it, i) => `[${i}] ${String(it.outlet_id ?? it.outlet).toUpperCase()} | ${it.topic ?? ""}: ${it.headline}`)
    .join("\n");
  return template.replaceAll("{{COUNT}}", String(items.length)).replace("{{HEADLINES}}", list);
}

// Same extraction production uses: first {...} block in the response.
// Returns an array aligned to `count`; entries are numbers or null.
export function parseScores(text, count) {
  const out = new Array(count).fill(null);
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return out;
  let parsed;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return out;
  }
  for (const s of parsed.scores ?? []) {
    const i = Number(s.index);
    const v = Number(s.biasScore);
    if (Number.isInteger(i) && i >= 0 && i < count && Number.isFinite(v)) {
      out[i] = Math.max(0, Math.min(10, v));
    }
  }
  return out;
}

async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const run = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, run));
  return results;
}

// callModel({ system, user }) -> response text. Injected so tests can fake it.
// Returns one score (number|null) per item, in item order.
export async function scoreItems(items, { callModel, batchSize, concurrency, onWarn = console.warn }) {
  const { system, template } = loadPrompts();
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) batches.push(items.slice(i, i + batchSize));

  const perBatch = await pool(
    batches.map((batch, bi) => async () => {
      try {
        const text = await callModel({ system, user: buildBatchPrompt(template, batch) });
        const scores = parseScores(text, batch.length);
        const missing = scores.filter((s) => s === null).length;
        if (missing) onWarn(`  [warn] batch ${bi + 1}/${batches.length}: ${missing}/${batch.length} items got no score`);
        return scores;
      } catch (err) {
        onWarn(`  [warn] batch ${bi + 1}/${batches.length} failed: ${err.message}`);
        return new Array(batch.length).fill(null);
      }
    }),
    concurrency
  );
  return perBatch.flat();
}
