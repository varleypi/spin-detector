import { test } from "node:test";
import assert from "node:assert/strict";
import { labelFor } from "../config.js";
import { mae, bias, agreementRate, labelAccuracy, pearsonCorrelation, allCenterMae, confusionMatrix, perOutlet } from "../src/metrics.js";

const P = (human, model, outlet = "X") => ({ id: "t", outlet, headline: "h", human_score: human, model_score: model });

test("labelFor mirrors lib/score.ts biasLabel boundaries", () => {
  assert.equal(labelFor(2.0), "Far Left");
  assert.equal(labelFor(2.1), "Left");
  assert.equal(labelFor(4.0), "Left");
  assert.equal(labelFor(4.1), "Center");
  assert.equal(labelFor(5.0), "Center");
  assert.equal(labelFor(5.9), "Center");
  assert.equal(labelFor(6.0), "Right");
  assert.equal(labelFor(7.9), "Right");
  assert.equal(labelFor(8.0), "Far Right");
});

test("mae, bias, agreement ignore null model scores", () => {
  const pairs = [P(5, 6), P(3, 1), P(7, null)];
  assert.equal(mae(pairs), 1.5);
  assert.equal(bias(pairs), (1 + -2) / 2);
  assert.equal(agreementRate(pairs, 1), 0.5);
});

test("agreement tolerates float noise at the boundary", () => {
  assert.equal(agreementRate([P(4.5, 5.5), P(4.1, 5.1)], 1), 1);
});

test("label accuracy and confusion matrix", () => {
  const pairs = [P(5, 5.5), P(1, 3), P(9, 8.5)];
  assert.equal(labelAccuracy(pairs), 2 / 3);
  const m = confusionMatrix(pairs);
  assert.equal(m["Center"]["Center"], 1);
  assert.equal(m["Far Left"]["Left"], 1);
  assert.equal(m["Far Right"]["Far Right"], 1);
});

test("pearson is 1 for perfectly linear, null for constant", () => {
  assert.ok(Math.abs(pearsonCorrelation([P(1, 2), P(2, 4), P(3, 6)]) - 1) < 1e-9);
  assert.equal(pearsonCorrelation([P(5, 5), P(5, 5)]), null);
});

test("always-center baseline", () => {
  assert.equal(allCenterMae([P(5, 1), P(7, 1), P(3, 1)]), (0 + 2 + 2) / 3);
});

test("perOutlet needs 3+ items and sorts by absolute bias", () => {
  const pairs = [P(5, 7, "A"), P(5, 7, "A"), P(5, 7, "A"), P(5, 5.5, "B"), P(5, 5.5, "B"), P(5, 4, "C")];
  const out = perOutlet(pairs);
  assert.deepEqual(out.map((o) => o.outlet), ["A"]);
  assert.equal(out[0].bias, 2);
});
