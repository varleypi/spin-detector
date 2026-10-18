// Runs the golden-set headlines through Claude AND Grok with the same prompt and
// reports how often they agree with EACH OTHER (not vs. human labels). Needs no
// labels. This is the number for the methodology page: a bias detector whose
// second opinion comes from a model owned by a platform it scores is a
// credibility risk, and a published agreement rate is a concrete answer.
// Needs ANTHROPIC_API_KEY and XAI_API_KEY.
import { writeFileSync, mkdirSync } from "node:fs";
import { config } from "../config.js";
import { loadGolden } from "./lib/golden.js";
import { callAnthropic, callXai } from "./lib/models.js";
import { scoreItems } from "./lib/scoring.js";
import { summarize, toMarkdown, printSummary } from "./report.js";

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const xaiKey = process.env.XAI_API_KEY;
if (!anthropicKey || !xaiKey) {
  console.error("Cross-model check needs both ANTHROPIC_API_KEY and XAI_API_KEY.");
  process.exit(1);
}

const items = loadGolden();
const claudeModel = config.models.primary.model;
const grokModel = config.models.secondary.model;
const opts = { batchSize: config.batchSize, concurrency: config.concurrency };

console.log(`Scoring ${items.length} headlines with ${claudeModel} and ${grokModel}...`);
const [claude, grok] = await Promise.all([
  scoreItems(items, { ...opts, callModel: ({ system, user }) => callAnthropic({ apiKey: anthropicKey, model: claudeModel, system, user }) }),
  scoreItems(items, { ...opts, callModel: ({ system, user }) => callXai({ apiKey: xaiKey, model: grokModel, system, user }) }),
]);

// metrics.js compares model_score against human_score; here "reference" = Claude.
const pairs = items
  .map((it, i) => ({ id: it.id, outlet: it.outlet, headline: it.headline, human_score: claude[i], model_score: grok[i] }))
  .filter((p) => Number.isFinite(p.human_score));
const summary = summarize(pairs, { name: `${grokModel} vs. ${claudeModel}`, refName: "Claude" });

mkdirSync("reports", { recursive: true });
const stamp = new Date().toISOString();
writeFileSync("reports/cross-model-latest.json", JSON.stringify({ timestamp: stamp, claudeModel, grokModel, summary, pairs }, null, 2));
writeFileSync("reports/cross-model-latest.md", toMarkdown("Claude vs. Grok agreement", `Run: ${stamp}`, [summary]));
printSummary(summary);
console.log("\nFull report: reports/cross-model-latest.md");
