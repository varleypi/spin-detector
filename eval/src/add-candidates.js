// Grows the golden set with fresh, UNLABELED headlines from the latest daily
// snapshot (../public/data/latest.json), along with the scores production gave
// them (kept in production-scores.json, separate from the labeling file so they
// can't anchor you). Then run `npm run label`.
//   npm run add-candidates -- 20
import { readFileSync, writeFileSync } from "node:fs";
import { loadGolden, saveGolden, loadProduction, productionPath } from "./lib/golden.js";

const want = Number(process.argv[2]) || 20;
const snapshot = JSON.parse(readFileSync(process.env.SNAPSHOT_PATH || "../public/data/latest.json", "utf8"));
const items = loadGolden();
const prod = loadProduction();
const seen = new Set(items.map((i) => i.url || i.headline));

const pool = [];
for (const s of snapshot.stories ?? []) {
  for (const a of s.articles ?? []) {
    if (!Number.isFinite(a.biasScore) || !a.headline || seen.has(a.url || a.headline)) continue;
    pool.push({ a, topic: s.topicLabel ?? "" });
  }
}
// Shuffle, then cap at 2 per outlet so one outlet can't dominate.
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const perOutlet = {};
const picked = [];
for (const p of pool) {
  if (picked.length >= want) break;
  if ((perOutlet[p.a.outletId] = (perOutlet[p.a.outletId] ?? 0) + 1) > 2) continue;
  picked.push(p);
}

let n = items.reduce((m, i) => Math.max(m, Number(i.id.replace(/\D/g, ""))), 0);
for (const { a, topic } of picked) {
  const id = `gs-${String(++n).padStart(4, "0")}`;
  items.push({
    id, type: "headline", outlet: a.outletName ?? a.outletId, outlet_id: a.outletId,
    headline: a.headline.trim(), topic, url: a.url ?? "", human_score: null,
    labeler_notes: "", date_labeled: null, source_date: snapshot.date,
  });
  prod[id] = { claude: a.biasScore, grok: a.biasScoreGrok ?? null, claude_signals: a.biasSignals ?? [], source_date: snapshot.date };
}
saveGolden(items);
writeFileSync(productionPath(), JSON.stringify(prod, null, 2) + "\n");
console.log(`Added ${picked.length} unlabeled candidates (${items.length} total). Next: npm run label`);
