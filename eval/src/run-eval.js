// Scores the human-labeled golden set with the production scoring prompt and
// compares to your labels. Needs ANTHROPIC_API_KEY.
//   npm run eval       -> report only
//   npm run eval:ci    -> also exit 1 if thresholds in config.js are breached
import { writeFileSync, mkdirSync } from "node:fs";
import { config } from "../config.js";
import { loadGolden, requireLabeled } from "./lib/golden.js";
import { callAnthropic } from "./lib/models.js";
import { scoreItems } from "./lib/scoring.js";
import { summarize, toMarkdown, printSummary } from "./report.js";

const isCi = process.argv.includes("--ci");
const apiKey = process.env.ANTHROPIC_API_KEY;

async function main() {
  const labeled = requireLabeled(loadGolden(), config.minLabeled, { ci: isCi });
  if (!apiKey) {
    console.error("Missing ANTHROPIC_API_KEY (set it in eval/.env or the environment).");
    process.exit(1);
  }
  const model = config.models.primary.model;
  console.log(`Scoring ${labeled.length} labeled headlines with ${model} (batches of ${config.batchSize})...`);

  const scores = await scoreItems(labeled, {
    batchSize: config.batchSize,
    concurrency: config.concurrency,
    callModel: ({ system, user }) => callAnthropic({ apiKey, model, system, user }),
  });

  const pairs = labeled.map((it, i) => ({
    id: it.id, outlet: it.outlet, headline: it.headline,
    human_score: it.human_score, model_score: scores[i],
  }));
  const summary = summarize(pairs, { name: `${model} vs. your labels` });

  mkdirSync("reports", { recursive: true });
  const stamp = new Date().toISOString();
  writeFileSync("reports/eval-latest.json", JSON.stringify({ timestamp: stamp, model, summary, pairs }, null, 2));
  writeFileSync("reports/eval-latest.md", toMarkdown("SpinDetector Eval", `Run: ${stamp}  \nModel: ${model}`, [summary]));
  printSummary(summary);
  console.log("\nFull report: reports/eval-latest.md");

  if (isCi) {
    const failAgree = summary.agreement_rate !== null && summary.agreement_rate < config.agreementThreshold;
    const failMae = summary.mae !== null && summary.mae > config.maeThreshold;
    const failCoverage = summary.n_scored < summary.n_items * 0.9;
    if (failAgree || failMae || failCoverage) {
      console.error(
        `\nCI FAIL: agreement ${summary.agreement_rate?.toFixed(3)} (min ${config.agreementThreshold}), ` +
        `MAE ${summary.mae?.toFixed(2)} (max ${config.maeThreshold}), scored ${summary.n_scored}/${summary.n_items} (min 90%)`
      );
      process.exit(1);
    }
  }
}

main();
