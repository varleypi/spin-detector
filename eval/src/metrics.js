// All functions take pairs shaped like:
//   { id, outlet, headline, human_score: number, model_score: number|null }
// `human_score` is the reference side. cross-model-eval.js passes Claude's
// score as the reference and Grok's as model_score.
import { labelFor, LABELS } from "../config.js";

const scored = (pairs) => pairs.filter((p) => Number.isFinite(p.model_score));

export function mae(pairs) {
  const v = scored(pairs);
  if (!v.length) return null;
  return v.reduce((s, p) => s + Math.abs(p.model_score - p.human_score), 0) / v.length;
}

// Mean of (model - human). Positive = model scores more right than humans.
export function bias(pairs) {
  const v = scored(pairs);
  if (!v.length) return null;
  return v.reduce((s, p) => s + (p.model_score - p.human_score), 0) / v.length;
}

export function agreementRate(pairs, tolerance) {
  const v = scored(pairs);
  if (!v.length) return null;
  // Small epsilon: 4.5 vs 5.5 is exactly 1.0 apart but floats can say 1.0000000000000009.
  return v.filter((p) => Math.abs(p.model_score - p.human_score) <= tolerance + 1e-9).length / v.length;
}

export function labelAccuracy(pairs) {
  const v = scored(pairs);
  if (!v.length) return null;
  return v.filter((p) => labelFor(p.model_score) === labelFor(p.human_score)).length / v.length;
}

export function pearsonCorrelation(pairs) {
  const v = scored(pairs);
  const n = v.length;
  if (n < 2) return null;
  const xs = v.map((p) => p.human_score);
  const ys = v.map((p) => p.model_score);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : num / denom;
}

// What a model that always answered "center" would score. A real model has to
// beat this clearly, otherwise the agreement rate is flattering it.
export function allCenterMae(pairs, neutral = 5) {
  if (!pairs.length) return null;
  return pairs.reduce((s, p) => s + Math.abs(neutral - p.human_score), 0) / pairs.length;
}

export function confusionMatrix(pairs) {
  const m = {};
  for (const l of LABELS) m[l] = Object.fromEntries(LABELS.map((x) => [x, 0]));
  for (const p of scored(pairs)) m[labelFor(p.human_score)][labelFor(p.model_score)]++;
  return m;
}

export function worstOffenders(pairs, n = 8) {
  return [...scored(pairs)]
    .sort((a, b) => Math.abs(b.model_score - b.human_score) - Math.abs(a.model_score - a.human_score))
    .slice(0, n);
}

// Per-outlet mean signed error, only for outlets with enough items to mean anything.
export function perOutlet(pairs, minItems = 3) {
  const by = new Map();
  for (const p of scored(pairs)) {
    if (!by.has(p.outlet)) by.set(p.outlet, []);
    by.get(p.outlet).push(p.model_score - p.human_score);
  }
  return [...by.entries()]
    .filter(([, e]) => e.length >= minItems)
    .map(([outlet, e]) => ({
      outlet,
      n: e.length,
      bias: e.reduce((a, b) => a + b, 0) / e.length,
      mae: e.reduce((a, b) => a + Math.abs(b), 0) / e.length,
    }))
    .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
}
