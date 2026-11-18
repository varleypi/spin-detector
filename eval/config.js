// Central config for the eval harness.
//
// Scale: matches production exactly. The pipeline stores scores 0-10 with 5.0
// as true center (see pipeline/cluster.js "CALIBRATION"). The UI shows these
// as -5..+5 (lib/score.ts), but the eval works in raw 0-10 so numbers line up
// with what is in the database and public/data/latest.json.

import { loadEnv } from "./src/lib/env.js";
loadEnv(); // so EVAL_MODEL etc. in .env apply before config is built

export const config = {
  scale: { min: 0, max: 10, neutral: 5 },

  // A model score within this many points of the human label counts as
  // "agreement" (on a 0-10 scale, 1.0 = one tenth of the range).
  tolerance: 1.0,

  // Labeled items required before the metrics mean anything. Below this,
  // `eval:ci` prints a warning and passes (so unlabeled PRs aren't blocked)
  // and every other command refuses to report.
  minLabeled: 30,

  // CI gating for `npm run eval:ci`. PROVISIONAL: these are placeholders until
  // you have a first real baseline. After the first run on a labeled set, set
  // them a little below what production actually achieves.
  agreementThreshold: 0.7,
  maeThreshold: 1.25,

  // Headlines per model call. Production sends all of a day's headlines in one
  // call (~135+); smaller batches keep eval calls cheap and easy to retry.
  batchSize: 25,
  concurrency: 2,

  // Mirrors pipeline/cluster.js (claude-sonnet-4-6 for scoring, grok-3-mini for
  // the independent Grok score). Override with EVAL_MODEL / EVAL_GROK_MODEL.
  models: {
    primary: { provider: "anthropic", model: process.env.EVAL_MODEL || "claude-sonnet-4-6" },
    secondary: { provider: "xai", model: process.env.EVAL_GROK_MODEL || "grok-3-mini" },
  },
};

export const LABELS = ["Far Left", "Left", "Center", "Right", "Far Right"];

// Mirrors biasLabel() in lib/score.ts so the eval buckets scores exactly the
// way the site does (display = score - 5; Far Left <= -3, Left <= -1,
// Center < 1, Right < 3, else Far Right).
export function labelFor(score) {
  const d = Math.round((score - 5) * 10) / 10;
  if (d <= -3) return "Far Left";
  if (d <= -1) return "Left";
  if (d < 1) return "Center";
  if (d < 3) return "Right";
  return "Far Right";
}
