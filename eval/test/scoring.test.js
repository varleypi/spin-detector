import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBatchPrompt, parseScores, scoreItems, loadPrompts } from "../src/lib/scoring.js";

const items = (n) => Array.from({ length: n }, (_, i) => ({ outlet: "Outlet", outlet_id: `o${i}`, topic: "Some story", headline: `Headline ${i}` }));

test("buildBatchPrompt uses production line format and fills placeholders", () => {
  const { template } = loadPrompts();
  const p = buildBatchPrompt(template, items(3));
  assert.match(p, /Score these 3 news headlines/);
  assert.match(p, /include all 3 entries/);
  assert.match(p, /^\[0\] O0 \| Some story: Headline 0$/m);
  assert.match(p, /^\[2\] O2 \| Some story: Headline 2$/m);
  assert.ok(!p.includes("{{"));
});

test("parseScores handles fences, clamping, gaps and garbage", () => {
  const text = 'Here you go:\n```json\n{"scores":[{"index":0,"biasScore":3.2},{"index":2,"biasScore":14},{"index":9,"biasScore":5},{"index":1,"biasScore":"x"}]}\n```';
  assert.deepEqual(parseScores(text, 3), [3.2, null, 10]);
  assert.deepEqual(parseScores("no json here", 2), [null, null]);
  assert.deepEqual(parseScores("{not valid}", 2), [null, null]);
});

test("scoreItems batches, keeps order, and survives a failed batch", async () => {
  const all = items(5);
  let call = 0;
  const callModel = async ({ user }) => {
    call++;
    if (call === 2) throw new Error("boom");
    const n = Number(user.match(/Score these (\d+)/)[1]);
    return JSON.stringify({ scores: Array.from({ length: n }, (_, i) => ({ index: i, biasScore: 5 + i })) });
  };
  const warnings = [];
  const out = await scoreItems(all, { callModel, batchSize: 2, concurrency: 1, onWarn: (w) => warnings.push(w) });
  // batches: [0,1] ok, [2,3] fails, [4] ok
  assert.deepEqual(out, [5, 6, null, null, 5]);
  assert.equal(warnings.length, 1);
});
