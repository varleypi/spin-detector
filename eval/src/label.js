// Interactive labeling. Shows one headline at a time and saves after every answer,
// so you can quit and resume any time.
//   npm run label                 -> label unlabeled items (outlet hidden)
//   npm run label -- --show-outlet
//
// Outlet is hidden by default on purpose: label the WORDING, not the brand.
// The production prompt tells the model the same ("only the WORDING moves it").
import readline from "node:readline/promises";
import { loadGolden, saveGolden, isLabeled } from "./lib/golden.js";

const showOutlet = process.argv.includes("--show-outlet");
const items = loadGolden();
const todo = items.filter((it) => !isLabeled(it));

console.log(`
Score each headline's political LANGUAGE bias, 0-10 (decimals OK, e.g. 4.5):

  0-2   Far Left  - heavy progressive framing, emotionally charged, activists as heroes
  2-4   Left      - progressive framing, sympathetic to left causes
  4-6   Center    - neutral verbs, balanced sourcing, minimal ideological signals
  6-8   Right     - conservative framing, sympathetic to right causes
  8-10  Far Right - heavy conservative framing, charged language, threats/invasion framing

Rules of thumb (same as the production prompt):
  - A plain headline that just states what happened is 5.0.
  - Topic alone does not move the score; only the wording does.
  - Absence of right-coded framing is NOT evidence of left bias.
  - When unsure between "slightly biased" and "neutral", use 5.0.

Commands: a number 0-10 | s = skip | u = undo last | q = quit
${items.length - todo.length}/${items.length} already labeled, ${todo.length} to go.
`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const history = [];

try {
  for (let i = 0; i < todo.length; i++) {
    const it = todo[i];
    console.log(`[${items.length - todo.length + i + 1}/${items.length}]${showOutlet ? ` ${it.outlet}:` : ""}`);
    console.log(`  Story:    ${it.topic}`);
    console.log(`  Headline: ${it.headline}`);
    while (true) {
      const a = (await rl.question("  Score> ")).trim().toLowerCase();
      if (a === "q") throw "quit";
      if (a === "s") break;
      if (a === "u") {
        const last = history.pop();
        if (!last) { console.log("  nothing to undo"); continue; }
        last.human_score = null; last.date_labeled = null;
        saveGolden(items);
        i = todo.indexOf(last) - 1; // re-ask that one
        console.log("  undone");
        break;
      }
      const v = Number(a);
      if (a !== "" && Number.isFinite(v) && v >= 0 && v <= 10) {
        it.human_score = Math.round(v * 10) / 10;
        it.date_labeled = new Date().toISOString().slice(0, 10);
        history.push(it);
        saveGolden(items);
        break;
      }
      console.log("  enter a number 0-10, s, u, or q");
    }
    console.log();
  }
  console.log("All done.");
} catch (e) {
  if (e !== "quit") throw e;
} finally {
  rl.close();
  const n = items.filter(isLabeled).length;
  console.log(`\nLabeled ${n}/${items.length}. Next: npm run eval:stored`);
}
