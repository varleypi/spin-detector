# SpinDetector eval harness

Answers one question: **how often do SpinDetector's bias scores match a human's?**

Everything runs on the production scale (0-10, 5.0 = center) and the production scoring prompt.

## Start here (about 45 minutes, one time)

1. `cd eval`
2. `npm run label`. Score the 100 candidate headlines. The outlet is hidden on purpose: judge the wording, not the brand. Progress saves after every answer, so you can quit (`q`) and resume.
3. `npm run eval:stored`. Compares your labels to the scores production already published. No API keys, no cost. **This is the real answer to "how well is the live pipeline doing?"**
4. (Optional) Add `ANTHROPIC_API_KEY` to `eval/.env` and run `npm run eval` to score your labeled headlines fresh with the current prompt.

You need at least 30 labeled items before any accuracy number is shown. 100 is better.

## Commands

| Command | Needs | What it does |
|---|---|---|
| `npm run label` | nothing | Label headlines (`-- --show-outlet` to reveal the outlet) |
| `npm run eval:stored` | labels | Your labels vs. the scores production published. Also shows Claude vs. Grok agreement, no labels needed |
| `npm run eval` | labels + Anthropic key | Your labels vs. a fresh run of the scoring prompt |
| `npm run eval:ci` | same | Same, but exits 1 if `config.js` thresholds are breached |
| `npm run cross-model` | both keys | Claude vs. Grok agreement on the golden set |
| `npm run add-candidates -- 20` | nothing | Add 20 fresh unlabeled headlines from today's snapshot |
| `npm run check-prompt` | nothing | Fails if `prompts/` has drifted from `pipeline/cluster.js` |
| `npm test` | nothing | Unit tests |

Reports are written to `eval/reports/` (git-ignored; CI uploads them as an artifact and posts them to the run summary).

## Reading the numbers

- **MAE**: average points the model is off from you, on the 0-10 scale. The report also prints what a model that just said 5.0 for everything would score on your labels; beating that clearly is the bar.
- **Agreement within ±1**: share of headlines scored within one point of your label.
- **Same label**: share landing in the same Far Left / Left / Center / Right / Far Right bucket the site shows (same cutoffs as `lib/score.ts`).
- **Bias**: average model minus you. Positive means the model reads more right than you do; negative, more left.
- **Outlets the model is systematically off on**: where bias concentrates by outlet.

## What's in `golden-set/`

- `golden-set.json`: 100 real headlines from 37 outlets, drawn from daily snapshots since the 5.0-center calibration shipped (2026-07-28), spread evenly across the production score range. `human_score` is `null` until you label it.
- `production-scores.json`: the Claude and Grok scores production published for each headline. Kept in a separate file so they can't anchor you while labeling.

## Limits to know about

- **One labeler.** The golden set measures agreement with *you*. For a credible public number, have a second person label the same items and report how often the two of you agree.
- **`npm run eval` is not byte-for-byte production.** Production's Claude call clusters a whole day's headlines and scores them in one batch; the eval scores batches of 25 with production's scoring-only prompt (the Grok prompt, whose scale and calibration text is identical). `eval:stored` is the check that reflects exactly what readers saw.
- **The sample is stratified**, not random, so it over-represents non-center headlines versus a typical day. Metrics describe performance across the whole scale, not the average day.
- **CI thresholds are provisional** (`agreementThreshold`, `maeThreshold` in `config.js`). After the first real run, set them a little below what production achieves.
- **Prompt drift.** If you edit the scoring prompt in `pipeline/cluster.js`, copy the change into `prompts/` (CI will fail until you do).
- Sampling uses the model's default temperature, like production, so repeated runs vary a little.

## CI

`.github/workflows/eval.yml` runs on PRs touching `eval/**` or `pipeline/cluster.js`, and every Monday 8am ET. Add `ANTHROPIC_API_KEY` (and `XAI_API_KEY` for the cross-model job) under repo Settings → Secrets and variables → Actions. Until 30 items are labeled, the accuracy gate passes with a warning.
