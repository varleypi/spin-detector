import { config } from "../config.js";
import {
  mae, bias, agreementRate, labelAccuracy, pearsonCorrelation,
  allCenterMae, confusionMatrix, worstOffenders, perOutlet,
} from "./metrics.js";

// pairs: [{ id, outlet, headline, human_score, model_score }]
export function summarize(pairs, { name, refName = "human" } = {}) {
  const n = pairs.length;
  const nScored = pairs.filter((p) => Number.isFinite(p.model_score)).length;
  return {
    name,
    ref: refName,
    n_items: n,
    n_scored: nScored,
    mae: mae(pairs),
    bias: bias(pairs),
    agreement_rate: agreementRate(pairs, config.tolerance),
    tolerance: config.tolerance,
    label_accuracy: labelAccuracy(pairs),
    pearson: pearsonCorrelation(pairs),
    baseline_all_center_mae: refName === "human" ? allCenterMae(pairs, config.scale.neutral) : null,
    confusion: confusionMatrix(pairs),
    worst: worstOffenders(pairs).map((p) => ({
      id: p.id, outlet: p.outlet, headline: p.headline,
      ref: p.human_score, model: p.model_score, delta: p.model_score - p.human_score,
    })),
    outliers_by_outlet: perOutlet(pairs).slice(0, 8),
  };
}

const pct = (x) => (x === null ? "n/a" : (x * 100).toFixed(1) + "%");
const num = (x, d = 2) => (x === null || x === undefined ? "n/a" : x.toFixed(d));
const signed = (x) => (x === null ? "n/a" : (x >= 0 ? "+" : "") + x.toFixed(2));

export function sectionMarkdown(s) {
  const ref = s.ref;
  const confHeader = "| " + ["", ...Object.keys(s.confusion)].join(" | ") + " |";
  const confSep = "|" + Array(Object.keys(s.confusion).length + 1).fill("---").join("|") + "|";
  const confRows = Object.entries(s.confusion)
    .map(([actual, row]) => `| **${actual}** | ${Object.values(row).join(" | ")} |`)
    .join("\n");
  const baseline = s.baseline_all_center_mae !== null
    ? `\n| MAE if it always said "center" (5.0) | ${num(s.baseline_all_center_mae)} |` : "";
  return `## ${s.name}

| Metric | Value |
|---|---|
| Items scored | ${s.n_scored}/${s.n_items} |
| MAE (avg points off ${ref}) | ${num(s.mae)} |${baseline}
| Agreement within ±${s.tolerance} | ${pct(s.agreement_rate)} |
| Same label (Far Left / Left / Center / Right / Far Right) | ${pct(s.label_accuracy)} |
| Correlation (Pearson r) | ${num(s.pearson, 3)} |
| Bias (model minus ${ref}; + means reads more right) | ${signed(s.bias)} |

Rows = ${ref} label, columns = model label.

${confHeader}
${confSep}
${confRows}

**Biggest misses**

| ID | Outlet | ${ref} | Model | Δ | Headline |
|---|---|---|---|---|---|
${s.worst.map((w) => `| ${w.id} | ${w.outlet} | ${w.ref} | ${w.model} | ${signed(w.delta)} | ${w.headline.replace(/\|/g, "/")} |`).join("\n") || "| | | | | | none |"}
${s.outliers_by_outlet.length ? `
**Outlets the model is systematically off on** (3+ items; Δ = average model minus ${ref})

| Outlet | n | Δ | MAE |
|---|---|---|---|
${s.outliers_by_outlet.map((o) => `| ${o.outlet} | ${o.n} | ${signed(o.bias)} | ${num(o.mae)} |`).join("\n")}
` : ""}`;
}

export function toMarkdown(title, meta, sections) {
  return `# ${title}\n\n${meta}\n\n${sections.map(sectionMarkdown).join("\n")}`;
}

export function printSummary(s) {
  console.log(`\n--- ${s.name} ---`);
  console.log(`Scored:            ${s.n_scored}/${s.n_items}`);
  console.log(`MAE:               ${num(s.mae)}${s.baseline_all_center_mae !== null ? `   (always-"center" baseline: ${num(s.baseline_all_center_mae)})` : ""}`);
  console.log(`Agreement ±${s.tolerance}:    ${pct(s.agreement_rate)}`);
  console.log(`Same label:        ${pct(s.label_accuracy)}`);
  console.log(`Correlation r:     ${num(s.pearson, 3)}`);
  console.log(`Bias (model-${s.ref}): ${signed(s.bias)}`);
}
