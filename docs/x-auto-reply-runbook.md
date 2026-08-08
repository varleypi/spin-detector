# X Auto-Reply — Runbook

How the reply system works, how to turn it on safely, and what to change when
it misbehaves. Supersedes the queue-and-approve flow in
`x-viral-scoring-design.md` (that doc still describes discovery and scoring
accurately; the approval stage is gone).

---

## Why it replies instead of posting

A standalone post from a low-follower account is shown to almost nobody. A reply
inherits the audience of the post it's under. Everything upstream — discovery,
ranking, cluster matching — exists to find a parent post worth replying under.

Three things had to be true at once for that to work:

1. **It has to be fast.** Reply placement is decided in the first hour. The old
   flow ran 3×/day and waited for human approval, which guaranteed we were
   hours late. So it now posts unattended, every 30 minutes.
2. **It has to be worth reading.** A bare score under a breaking-news post reads
   as bot spam. When a viral post matches a story the daily pipeline already
   scored, the reply shows *how every other outlet worded the same event* —
   which is useful, unfakeable, and costs nothing extra.
3. **It has to be safe unattended.** Every gate in `guardrails.js` is
   deterministic and fails closed. No model decides whether something is
   postable.

---

## Turning it on

```bash
npm run x:test
```

Then, in order:

1. **Apply the migration.** Paste `supabase/x_schema_replies.sql` into the
   Supabase SQL editor and run it. It's additive and idempotent. Nothing works
   properly until this is done — you'll see `column ... does not exist` warnings.

2. **Watch it dry-run for a few days.** `X_AUTOPOST` unset (or anything other
   than `on`) means compose-and-record-but-never-publish. The scheduled workflow
   is already running; read the digest each morning.

3. **Read the digest.** Actions → *X Reply Digest* → job summary. Its first
   section, **"Would have posted (dry run)"**, is the one that matters: each
   entry shows the parent post and the exact reply text that would have been
   published. Then "Stopped, and why", then the day's spend. This is the review
   step — read this, not X.

   Locally, the same report: `npm run x:digest`.

   Withheld replies are stored on `x_candidates` with `status='dry_run'` (they
   never touch `x_posts`, which only records real tweets), so you can also query
   them directly in Supabase.

4. **Check the topic filter's false positives.** The digest has a collapsible
   section for these. If it's blocking coverage you'd want to reply to, tune
   `X_TOPIC_GROUPS` (see below) — don't weaken the regexes.

5. **Go live.** Set repository variable `X_AUTOPOST=on`
   (Settings → Secrets and variables → Actions → Variables). Takes effect on the
   next scheduled run. Set it to anything else to stop immediately — no deploy.

To force a single live run without flipping the variable: Actions → *X
Auto-Reply* → Run workflow → tick **live**.

---

## The gates, in order

From `pipeline/x/guardrails.js`. A candidate must clear all of them.

| # | Gate | Default | Variable |
| - | ---- | ------- | -------- |
| 1 | Parent is a tracked outlet account | — | `pipeline/xHandles.js` |
| 2 | Parent text trips no blocked topic | all groups on | `X_TOPIC_GROUPS` |
| 3 | Parent has real reach | 50,000 followers | `MIN_PARENT_FOLLOWERS` |
| 4 | Parent is still fresh | 180 min | `MAX_PARENT_AGE_MINUTES` |
| 5 | Under the daily reply cap | 8 | `DAILY_POST_CAP` |
| 6 | Not already replied to this outlet today | 1 | `MAX_REPLIES_PER_PARENT_DAY` |
| 7 | Has something to say | ±1.0 spin | `MIN_SPIN_THRESHOLD` |

Gate 1 only ever allows outlet *institutions* — never individual journalists,
never private people. Replying to an institution is media criticism; replying
under a named person's post is something else. Don't add people to
`X_HANDLES`.

Gate 6 is the one that keeps this from reading as harassment. Three replies to
one outlet in a day is a pile-on, not analysis.

Gate 7 is waived when a story cluster matched — a comparison reply always has
something to say (the spread between outlets), even if the replied-to post is
itself neutral.

### Topic blocklist groups

| group | blocks | cost of keeping it on |
| ----- | ------ | -------------------- |
| `harm` | death, mass casualty, violence | low |
| `grief` | funerals, memorials, active disasters | low |
| `victims` | abuse, exploitation, self-harm, missing persons | low |
| `health` | individual medical emergencies | low |
| `legal` | indicted / arraigned / pleads guilty / sentenced | **high** |

`legal` is the expensive one. Indictment coverage is where spin runs highest and
it's fair game for public figures — but the wording can't distinguish a senator
from a private defendant, so it ships blocked. Relax it with
`X_TOPIC_GROUPS=harm,grief,victims,health` once you trust the rest.

---

## Cost

Discovery (agentic `x_search` on grok-4.5) is ~95% of spend. Two components:
tokens ($2/M in, $6/M out) and tool calls ($5 per 1,000 searches).

**Measured 2026-08-08 on live traffic.** The last three rows ran back-to-back
within the same minute, so they're directly comparable:

| config | posts found | fresh ≤180m | search calls | cost/run |
| ------ | ----------: | ----------: | -----------: | -------: |
| effort `high` (the old default), 24h window | 18 | — | 10 | $0.14 |
| effort `low`, 6 handles, no search budget | 10 | — | 20 | $0.26 |
| effort `low`, 3h window, budget 3 | **0** | 0 | 3 | $0.02 |
| effort `low`, **12h window, budget 6** | 8 | 6 | 5 | **$0.076** |
| effort `low`, 12h window, no budget | 8 | 8 | 17 | $0.185 |

Four findings worth not re-learning:

- **`reasoning.effort` defaults to `high`.** Nobody sets it and it silently
  dominated the bill. This is a "find and list posts" task; `low` answers it
  just as well.
- **Narrowing the handle list makes runs *more* expensive.** Fewer accounts means
  the agent works harder to find qualifying posts. `X_HANDLES_PER_RUN` is a
  targeting dial, not a cost dial.
- **The agent treats "find up to N" as a target** and keeps searching until it
  hits it (17 calls unbudgeted). The SEARCH BUDGET line in `discover.js` is the
  main cost lever — but **cap it too hard and it returns nothing at all.** The
  3-call/3-hour config looked like a 4× saving and was actually a dead pipeline.
  A cheap run that finds zero posts is not a cheap run, it's a broken one.
- **The prompt's time window is a search-EFFORT dial, not a freshness control.**
  Asking for 3 hours doesn't return fresher posts; it makes the search hard
  enough that a budgeted agent gives up. Freshness is enforced downstream on
  each post's actual age. Ask wide, filter hard.

`DAILY_COST_BUDGET_USD` (default $1.00) is checked *before* discovery, so a
capped day costs nothing further. At ~$0.07/run the hourly cron (12 runs) comes
to ~$0.84/day with headroom. Every 30 minutes would be ~$1.68/day and the guard
would cut the day off around 18:00 UTC — losing the evening entirely rather than
thinning coverage evenly. Raise the budget before raising the frequency.

**Watch for:** transient `500 Internal error during token parsing` from xAI. Seen
twice during calibration; `callXai` retries 5xx/429 three times with backoff.

Free-tier X allows ~500 posts/month. At `DAILY_POST_CAP=8` you'd use ~240,
leaving room for the daily standalone post.

---

## Two reply formats

**`comparison`** — the good one. The viral post matched a story cluster the daily
pipeline already scored, so we can show the spread across outlets. Zero
additional model cost.

```
Same event, side by side (20 outlets scored):
HuffPost −3.5 · NPR +0.0 · Federalist +3.5

7.0-point spread between the ends.

Scale: −5 left ↔ +5 right
```

It names three outlets, not twenty, even when twenty were scored. The first
version printed the full list: on a real cluster that ran to exactly 280 chars,
was mostly `+0.0` filler, and buried the gap — the one number that carries the
argument. `selectOutlets()` now takes both extremes plus a recognisable centre
anchor (AP/Reuters/BBC/NPR), and the header carries the real count so it still
reads as evidence rather than cherry-picking.

Display names come from `X_DISPLAY_NAMES` in `compose.js`, which overrides the
site's abbreviations where they're ambiguous standalone — the site's `Fed` for
The Federalist reads as the Federal Reserve on a politics timeline.

**`single`** — fallback when nothing matched. We paid to score the post alone.
Weaker, so gate 7 requires a real lean.

```
How this is framed: +2.3 (Right)

"Surge" and "scramble" frame routine processing as a crisis.

Scale: −5 left ↔ +5 right
```

Neither carries a link. X suppresses reach on posts with external links, and a
link in a reply from an account the reader doesn't follow is a spam signal. The
reply's job is to earn a profile click — **the bio and pinned post do the
converting, so make sure both are good.**

Cluster match rate was ~25% on first live runs. Raising it is the highest-value
tuning available: lower `CLUSTER_MATCH_THRESHOLD` (0.26) toward 0.22 and check
the digest for wrong-story matches, which are the failure mode that matters.

---

## When something looks wrong

| symptom | look at |
| ------- | ------- |
| Nothing published | Is `X_AUTOPOST=on`? Digest says outright if not. |
| Discovery returns 0 posts run after run | `MAX_SEARCH_CALLS` too low or `DISCOVERY_WINDOW_HOURS` too short — the two failure modes look identical in the log. Try 6 / 12. |
| Everything dropped at the ranking stage | `viralityScore` is calibrated to Grok's engagement estimates (velocity p50 ≈ 0.9, p90 ≈ 10). If those change scale, every candidate lands at the floor. Re-measure and adjust `VELOCITY_CEILING`. |
| Everything blocked as "daily cap reached (Infinity/N)" | The `x_posts` read failed — this is the fail-closed path. Check the migration ran. |
| Cost climbing | `x_runs.cost_usd` per run. If search calls > 6, the SEARCH BUDGET text isn't landing. |
| Replies read as spam | Cluster match rate too low — you're shipping mostly `single`. Tune the threshold. |
| Wrong outlets named in a reply | `CLUSTER_MATCH_THRESHOLD` too low. Raise it. |
| Outlet never appears | Its handle in `xHandles.js` is stale. Fails closed and silently. |

**Stop everything:** set `X_AUTOPOST` to `off`. Next run is dry within 30 minutes.
To stop discovery spend too, disable the *X Auto-Reply* workflow in the Actions tab.

---

## What this doesn't do

- **No metrics backfill.** `x_posts` has impression/like columns but nothing
  fills them — the X free tier is write-only. Until that changes there's no
  closed loop telling you which replies actually worked, so treat format
  decisions as hypotheses.
- **No reply-to-reply.** We never engage with responses. That genuinely needs a
  human.
- **The daily standalone post is unchanged** — `pipeline/social.js`, still on the
  daily pipeline. It exists so a profile click lands on something.
