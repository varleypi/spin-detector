import { readFileSync, writeFileSync } from "node:fs";

export const goldenPath = () => process.env.GOLDEN_SET_PATH || "golden-set/golden-set.json";
export const productionPath = () => process.env.PRODUCTION_SCORES_PATH || "golden-set/production-scores.json";

export const loadGolden = () => JSON.parse(readFileSync(goldenPath(), "utf8"));
export const saveGolden = (items) => writeFileSync(goldenPath(), JSON.stringify(items, null, 2) + "\n");
export const loadProduction = () => JSON.parse(readFileSync(productionPath(), "utf8"));

export const isLabeled = (it) =>
  typeof it.human_score === "number" && it.human_score >= 0 && it.human_score <= 10;

// Exits with a clear message if there aren't enough human labels to report on.
export function requireLabeled(items, minLabeled, { ci = false } = {}) {
  const labeled = items.filter(isLabeled);
  if (labeled.length >= minLabeled) return labeled;
  const msg = `Only ${labeled.length}/${items.length} golden-set items have a human_score (need at least ${minLabeled}). Run: npm run label`;
  if (ci) {
    console.log(`::warning::${msg} Skipping the accuracy gate.`);
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}
