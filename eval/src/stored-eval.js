// Offline accuracy check: compares your human labels to the scores production
// ALREADY produced for the same headlines (stored in golden-set/production-scores.json
// from the daily snapshots). No API keys, no cost.
//
// This is the closest answer to "how well is the live pipeline doing?". Note the
// stored scores came from the full-day batch prompt (clustering + scoring), so
// this measures what readers actually saw, not the scoring-only prompt that
// `npm run eval` uses.
import { writeFileSync, mkdirSync } from "node:fs";
import { config } from "../config.js";
import { loadGolden, loadProduction, isLabeled } from "./lib/golden.js";
import { summarize, toMarkdown, printSummary } from "./report.js";

const items = loadGolden();
const prod = loadProduction();
const labeled = items.filter(isLabeled);
const sections = [];

if (labeled.length >= config.minLabeled) {
  for (const [key, label] of [["claude", "Production Claude (as published) vs. your labels"], ["grok", "Production Grok (as published) vs. your labels"]]) {
    const pairs = labeled
      .filter((it) => Number.isFinite(prod[it.id]?.[key]))
      .map((it) => ({
        id: it.id, outlet: it.outlet, headline: it.headline,
        human_score: it.human_score, model_score: prod[it.id][key],
      }));
    sections.push(summarize(pairs, { name: label }));
  }
} else {
  console.log(`Only ${labeled.length}/${items.length} items labeled (need ${config.minLabeled}); skipping accuracy vs. your labels. Run: npm run label\n`);
}

// Claude vs Grok on the stored scores. Needs no labels.
const both = items
  .filter((it) => Number.isFinite(prod[it.id]?.claude) && Number.isFinite(prod[it.id]?.grok))
  .map((it) => ({
    id: it.id, outlet: it.outlet, headline: it.headline,
    human_score: prod[it.id].claude, model_score: prod[it.id].grok,
  }));
sections.push(summarize(both, { name: "Production Grok vs. production Claude (no labels needed)", refName: "Claude" }));

mkdirSync("reports", { recursive: true });
writeFileSync("reports/stored-latest.json", JSON.stringify({ sections }, null, 2));
writeFileSync(
  "reports/stored-latest.md",
  toMarkdown("SpinDetector: production scores as published", `Run: ${new Date().toISOString()}  \nItems: ${items.length} (${labeled.length} labeled)`, sections)
);
sections.forEach(printSummary);
console.log("\nFull report: reports/stored-latest.md");
