# Spin Detector — X (Twitter) Viral Headline Scoring

Design doc for the "@SpinDetectorAI scores viral news tweets in-thread" system.
Extends the existing nightly pipeline; reuses its Grok scoring, X client, and Supabase conventions.

Status: **design / pre-MVP**. Owner: Piers. Last updated: 2026-07-24.

---

## 1. Goal & guardrails

Find high-potential viral news/headline tweets on X, score them for spin on the same
**−5 → +5** scale the site uses, and post the score **inside** an X post (number + rationale
+ score-card image) so people see the rating without leaving X. Drive @SpinDetectorAI +
spindetector.com.

Hard constraints that shape every decision below:

| Constraint | Design consequence |
|---|---|
| **Lowest token cost** | Grok-primary. `grok-3-mini` for pre-filter *and* scoring; batch every call; cache near-duplicates; escalate to Claude/`grok-4` only for the 0–2 highest-value items/day. |
| **Score visible in-tweet, no click-away** | Lead with the number in text **and** a generated score-card PNG. Link (if any) goes in a self-reply, never the body. |
| **Only real viral potential** | Two-gate funnel: cheap discovery filter → `grok-3-mini` virality pre-filter → hard daily cap (8–15) before any full scoring. |
| **Don't get the account banned** | Human-in-the-loop approval before every post. 3–8 posts/day. Original posts / hand-picked quote-tweets only. Never automated reply spam. |

---

## 2. Architecture

Reuses the current stack: Node pipeline scripts (run by **GitHub Actions cron**, same as the
nightly run), **Supabase** for state, **Next.js on Vercel** for the approval UI + the
image/post API routes. No new infra category.

```
                        ┌─────────────────────────────────────────────┐
                        │  GitHub Actions cron  (2–4×/day, e.g. 8/12/16/20 ET) │
                        └─────────────────────────────────────────────┘
                                          │
        (1) DISCOVERY            (2) PRE-FILTER            (3) SCORING
   ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
   │ Grok x_search      │   │ grok-3-mini        │   │ grok-3-mini        │
   │ search X for        │──▶│ 1 batched call:     │──▶│ 1 batched call:     │
   │ news/claim posts +  │   │ virality 0–1 +      │   │ bias 0–10 + 2       │
   │ velocity/reach      │   │ is-newsy? keep top  │   │ signals + 1-line    │
   │ (cheap, capped)     │   │ 8–15, drop rest     │   │ rationale for card  │
   └────────────────────┘   └────────────────────┘   └────────────────────┘
             │                        │                        │
             ▼                        ▼                        ▼
        x_candidates            status=prefiltered        x_score_cache
        (status=discovered)     _out / scored             (content_hash dedup)
                                                                 │
                                          (4) IMAGE + QUEUE       ▼
                                   ┌──────────────────────────────────────┐
                                   │ status = pending_review              │
                                   └──────────────────────────────────────┘
                                                 │
                    ┌────────────────────────────┴───────────────────────┐
                    ▼                                                     ▼
         (5) HUMAN APPROVAL                                     (optional Slack card
   ┌──────────────────────────────┐                             with Approve/Reject)
   │ /admin/x-queue  (Next.js)    │
   │ shows text + card preview,   │──── approve ───┐
   │ Approve / Edit / Reject      │                │
   └──────────────────────────────┘                ▼
                                          (6) POST  (Next.js API route)
                                   ┌──────────────────────────────────────┐
                                   │ @vercel/og → PNG card                │
                                   │ twitter-api-v2: upload media,        │
                                   │ tweet(score text + image),           │
                                   │ optional self-reply w/ link          │
                                   │ → x_posts (tweet_id)                 │
                                   └──────────────────────────────────────┘
                                                 │
                                          (7) METRICS BACKFILL
                                   ┌──────────────────────────────────────┐
                                   │ daily: pull impressions/likes/etc    │
                                   │ for posted tweet_ids → x_posts       │
                                   └──────────────────────────────────────┘
```

### Quality gates (added after the first live run, 2026-07-24)

The first run queued 18 candidates; only 4 were worth posting. Three gates now enforce that
*before* the human ever sees them — and two of the three run before scoring, so they cut cost:

| Gate | Where | Rule | Env |
|---|---|---|---|
| **Media-only** | discovery (pre-spend) | Keep `outlet\|journalist\|politician\|official`; drop `other` (aggregator/rewrite accounts). Rating an institution is a stronger bias claim and lower backlash risk than rating a random account. | `ELIGIBLE_AUTHOR_TYPES` |
| **Story dedup** | stage 2b (pre-spend) | Jaccard similarity ≥ 0.45 over content words = same story. Catches "Trump arrives at the dinner" reported 3 ways, which `content_hash` cannot. Also checks the last 48h so today's story isn't re-queued tomorrow. | `STORY_DEDUPE_THRESHOLD` |
| **Spin threshold** | stage 3 (post-score) | Queue only \|score − 5\| ≥ 1.0. A "+0.0, no spin detected" post wastes a slot in a 3–4/day budget. Neutral items are archived as `skipped`, not deleted. | `MIN_SPIN_THRESHOLD` |

Measured effect on the first batch: **18 → 4 queued**, and the 4 survivors were balanced
(+2.5, +1.5, −1.2, −1.8) across left and right — important for the brand's credibility.

### Why Grok x_search for discovery (the key cost/feasibility call)

The **X API free tier is write-only** (post/delete + your own account) — it does **not** grant
recent-search or filtered-stream. Native X search needs **Basic ($200/mo)** or higher.

**Grok's Agent Tools API** — `POST /v1/responses` with the built-in `tools: [{type:"x_search"}]`
— lets Grok agentically search live X posts, priced per use rather than per API seat. That means:

- **Discovery** → Grok `x_search` (no paid X read tier needed).
- **Posting** → X API **free write tier** (≈500 posts/mo; 3–8/day ≈ 150–240/mo fits).

This is the recommended default and keeps the whole thing on the free X tier + metered Grok.
If you're already on X Basic+, we can swap discovery to native `GET /2/tweets/search/recent`
behind the same `discoverCandidates()` interface — it's one module.

> ⚠️ **API migration note (2026-07-24):** xAI **retired Live Search** (`search_parameters` on
> `/v1/chat/completions`) — it now returns **HTTP 410**. Discovery was migrated to the Agent
> Tools API: endpoint `/v1/responses`, `input` instead of `messages`, an `output[]` array
> instead of `choices`, and model **`grok-4.5`** (agentic tools need a tool-capable model —
> `grok-3-mini` does not work here). Scoring/pre-filter still use `grok-3-mini` on the normal
> chat endpoint. `x_search` supports `from_date`/`to_date`/`allowed_x_handles`/
> `excluded_x_handles` but has **no result-count parameter** — the cap lives in the prompt.
> Docs: https://docs.x.ai/docs/guides/tools/overview

> ⚠️ Verify current xAI + X API pricing/limits before launch; both vendors change terms often.
> Costs below are order-of-magnitude planning numbers, not quotes.

---

## 3. Data model (Supabase)

Same conventions as `schema.sql`: 0–10 internal scale (`NUMERIC(4,2)`), RLS public-read /
service-write, `x_` prefix so it never collides with the site tables. Full SQL in
`supabase/x_schema.sql` (Phase 1 deliverable). Shape:

### `x_runs` — audit log (mirrors `pipeline_runs`)
```
id uuid pk | stage text | status text | discovered int | prefiltered int | scored int
queued int | error_message text | elapsed_seconds numeric | created_at timestamptz
```

### `x_candidates` — one row per discovered tweet
```
id             uuid pk
run_id         uuid  -> x_runs
tweet_id       text  UNIQUE          -- X status id (dedup key)
tweet_url      text
author_handle  text
author_name    text
author_type    text                  -- 'journalist'|'outlet'|'politician'|'official'|'other'
author_followers int
text           text                  -- the headline/claim
lang           text  default 'en'
-- velocity snapshot at discovery
likes int, reposts int, replies int, quotes int
age_minutes    int
velocity       numeric               -- engagement / age, computed at discovery
-- pre-filter (grok-3-mini)
prefilter_score  numeric             -- 0..1 virality potential
prefilter_reason text
-- final score (grok-3-mini, 0–10 like the site)
bias_score      numeric(4,2)
bias_signals    text[] default '{}'
rationale       text                 -- <=140 char "why", used on the card + tweet
score_model     text                 -- 'grok-3-mini' | 'grok-4' | 'dual'
-- optional escalation
claude_bias_score numeric(4,2)
content_hash    text                 -- normalized-text hash for cache lookups
status          text  default 'discovered'
                -- discovered|prefiltered_out|scored|pending_review|approved|rejected|posted|skipped|error
created_at      timestamptz default now()
```

### `x_score_cache` — near-duplicate cache (skip re-scoring)
```
content_hash text pk | bias_score numeric(4,2) | bias_signals text[] | rationale text
score_model text | created_at timestamptz
```
Look up by `content_hash` before scoring; write after. TTL ~72h (headlines go stale).

### `x_posts` — post history + performance
```
id            uuid pk
candidate_id  uuid -> x_candidates
tweet_id      text UNIQUE            -- OUR posted tweet id
format        text                   -- 'original' | 'quote'
image_used    boolean
text          text
reply_tweet_id text                  -- self-reply carrying the link, if any
posted_at     timestamptz
-- metrics, refreshed by the backfill job
impressions int, likes int, reposts int, replies int, quotes int
link_clicks int, profile_clicks int, followers_delta int
metrics_updated_at timestamptz
```

RLS: `x_posts` public-read is fine (nice for a public "our calls" page later); keep
`x_candidates` **service-write, no public read** until you decide to expose it.

---

## 4. Cost controls (in priority order)

1. **Grok-primary, `grok-3-mini` everywhere.** Pre-filter and scoring both use the mini model.
   Claude/`grok-4` only for ≤2 approved high-velocity items/day when site-consistency matters.
2. **One batched call per stage per run** — all N candidates scored in a single completion
   (the site already does this in `cluster.js`). N API calls → 1.
3. **Two gates before spend.** Discovery filter (reach/velocity/newsy) is cheap; only survivors
   hit the mini pre-filter; only the top `DAILY_CANDIDATE_CAP` (8–15) get full scoring.
4. **`content_hash` cache.** Normalize text (lowercase, strip punctuation/URLs/mentions) → hash.
   Cache hit skips scoring entirely. Same wire headline reposted by 5 accounts = 1 score.
5. **Hard caps as env vars.** `DAILY_CANDIDATE_CAP`, `DAILY_POST_CAP`, `MAX_LIVE_SEARCH_RESULTS`.
   Fail closed if exceeded.
6. **One tight, date-bounded x_search per run** — a short brief keeps the agentic search cheap.

**Rough monthly envelope** (verify vendor pricing): 4 runs/day × (1 x_search on grok-4.5 + 2 mini
completions) + ≤2 escalations/day + ~180 free-tier posts. Dominated by the agentic x_search
calls (grok-4.5 is pricier than mini) — keep runs to 2–4/day and `MAX_LIVE_SEARCH_RESULTS` low.

---

## 5. Grok prompts

### 5a. Virality pre-filter (`grok-3-mini`, batched)

```
You are a news-desk triage filter. Given raw X posts, score each for VIRAL NEWS potential.
Keep only posts that make a checkable news claim or carry a news headline AND show real early
traction for their age.

Do NOT reward: opinion with no claim, memes, threads about the poster's own life, ads,
engagement bait, or already-hours-old posts with flat velocity.

For each post return:
  index        : the input index
  keep         : boolean
  virality     : 0.00–1.00  (early engagement-for-age × author reach × claim clarity)
  newsy        : boolean    (is there a concrete news claim/headline?)
  reason       : <= 12 words

Input (index | @handle | followers | age_min | likes/reposts/replies | text):
{{LIST}}

Respond JSON only: {"items":[{"index":0,"keep":true,"virality":0.72,"newsy":true,"reason":"..."}]}
```

Sort survivors by `virality`, take top `DAILY_CANDIDATE_CAP`.

### 5b. Bias scoring (`grok-3-mini`, batched — reuses the site's calibrated scale)

Reuse the exact scale + calibration block from `pipeline/cluster.js` (`buildGrokPrompt`) so X
scores match the site. Only the I/O differs — add a one-line `rationale` for the card:

```
Score these X news posts for political language bias. [SAME 0–10 SCALE + CALIBRATION as
cluster.js buildGrokPrompt — 5.0 = true center, topic ≠ bias, needs a nameable signal.]

For each post return:
  index      : input index
  biasScore  : 0.0–10.0, one decimal
  biasSignals: exactly 2 observations, <=10 words each
  rationale  : ONE sentence <=140 chars, plain English, no jargon — this is shown publicly

Input:
{{LIST}}

Respond JSON only: {"scores":[{"index":0,"biasScore":3.2,"biasSignals":["..."],"rationale":"..."}]}
```

Convert to display with the existing `fmt()` (`score − 5` → `+1.2` / `−0.8`) and `label()`.

---

## 6. Post format (score visible, no click-away)

Text (no link in body — the throttle lesson from `social.js`):

```
Spin score: −2.4  (Left)

@outlet's headline leans left — "raids" framing + activists cast as victims.

Our −5 (far left) ↔ +5 (far right) scale.
```

Plus a **score-card PNG** rendered by `@vercel/og` (Satori): big signed number, a −5…+5 scale
bar with a marker, the ≤140-char rationale, @SpinDetectorAI attribution, brand colors from the
existing PNGs. Uploaded via `twitter-api-v2` media upload, attached to the tweet.

- **Original post** by default (screenshot/quote the target only when fair-use-safe and it
  clearly adds context). Quote-tweets lead with the score too.
- Optional self-reply: `Full multi-outlet breakdown 👇 spindetector.com/...` — link stays out of
  the scored post.

---

## 7. Human-in-the-loop

**MVP: Next.js admin page** `/admin/x-queue` (gated by a shared secret / Supabase auth):
lists `status='pending_review'` candidates with the composed text + live card preview and
**Approve / Edit text / Reject** buttons. Approve → API route posts immediately and writes
`x_posts`. Simple, no third-party dependency, on infra you already run.

**Optional later: Slack.** Post an interactive card to a channel with Approve/Reject buttons
(Slack Block Kit) hitting the same API route. Nice for phone approvals. (Slack MCP is available
in this workspace but needs auth; treat as Phase 3.)

---

## 8. Environment variables (new)

```
# Grok (already have XAI_API_KEY) — x_search uses the same key.
XAI_API_KEY=...                      # existing

# X posting — already defined for the daily post; reused as-is.
X_API_KEY= / X_API_SECRET= / X_ACCESS_TOKEN= / X_ACCESS_SECRET=   # existing

# New caps / knobs
DAILY_CANDIDATE_CAP=12
DAILY_POST_CAP=6
MAX_LIVE_SEARCH_RESULTS=20
X_QUEUE_ADMIN_SECRET=...             # protects /admin/x-queue + post route

# Optional (Phase 3)
SLACK_BOT_TOKEN= / SLACK_APPROVAL_CHANNEL=
```

Supabase URL/keys already exist. Posting route runs on Vercel with the **service key**
(server-only), never the anon key.

---

## 9. Phased plan

**Phase 1 — MVP — ✅ COMPLETE (2026-07-24), except the cron workflow**

Built and verified end-to-end against live APIs:
- `supabase/x_schema.sql` — applied.
- `pipeline/x/{grok,discover,prefilter,score,dedupe,db,run}.js` — full funnel, live-tested.
- `lib/xQueue.ts` (compose + auth) and `lib/xDb.ts` (service-key access).
- `app/api/x/{queue,post,reject}/route.ts` — admin-only; verified 401 without the secret.
- `app/admin/x-queue/` — approval UI; Reject verified end-to-end through to Supabase.

**Posting has never been exercised against the live X API** — that publishes publicly, so it
needs a human to click it. The route's guards (auth, daily cap, status check, 280-char check)
are all in place and the composer output was verified at ≤280 chars on real candidates.

- `.github/workflows/x-viral-scoring.yml` — cron, **3 runs/day** (12:00 / 17:00 / 22:00 UTC
  = 08:00 / 13:00 / 18:00 ET in summer). Never posts; only queues. `permissions: contents: read`
  (it commits nothing) and a `concurrency` group so overlapping runs don't double-spend on Grok.
- Stage 0 **expiry sweep** — `pending_review` items older than `CANDIDATE_EXPIRY_HOURS` (12h)
  are auto-`skipped`. News goes stale fast; a queue of dead items makes review a chore.

**Why 3 runs/day, not 4:** the daily post cap is 4, and the first live batch queued ~4
candidates per run. Four runs would queue ~16/day against 4 postable slots — the queue would
grow faster than you can clear it. Three runs, 12h expiry, and the 48h cross-run story dedup
keep the queue roughly matched to what you'll actually post.

### Deploying the cron

1. **GitHub → Settings → Secrets and variables → Actions → Secrets.** `XAI_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` already exist for the nightly pipeline — the
   workflow reuses them. It fails fast with a clear message if any are missing.
2. **Optional tuning knobs** go in the *Variables* tab (not Secrets), so they're editable in
   the UI without rotating anything: `DAILY_CANDIDATE_CAP`, `MAX_LIVE_SEARCH_RESULTS`,
   `ELIGIBLE_AUTHOR_TYPES`, `MIN_SPIN_THRESHOLD`, `STORY_DEDUPE_THRESHOLD`,
   `CANDIDATE_EXPIRY_HOURS`. Every one falls back to its in-code default when unset.
3. **Vercel env vars** (for the approval UI): `X_QUEUE_ADMIN_SECRET` (long random string),
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and the four `X_*` posting credentials. The post
   route fails closed if the admin secret is unset.
4. First run: trigger manually via **Actions → X Viral Scoring → Run workflow** rather than
   waiting for cron, so you can watch the logs.

**Phase 1 original scope (for reference)**
- `supabase/x_schema.sql` (tables above) + apply.
- `pipeline/x/discover.js` — Grok `x_search` → `x_candidates` (status=discovered).
- `pipeline/x/prefilter.js` — `grok-3-mini` gate → top N, status scored/prefiltered_out.
- `pipeline/x/score.js` — `grok-3-mini` bias score + rationale + cache; status=pending_review.
- `pipeline/x/run.js` + a GitHub Actions workflow (2–4×/day) tying them together.
- `/admin/x-queue` page + `POST /api/x/post` route (text-only tweet first, link self-reply).
- **Exit criteria:** you approve items in the UI and a correctly-scored text tweet goes out.

**Phase 2 — Score-card images + metrics**
- `@vercel/og` card route + media upload in the post route (image becomes default).
- `pipeline/x/metrics.js` daily backfill into `x_posts`.
- Card preview in the admin UI.

**Phase 3 — Polish & scale**
- Quote-tweet mode with fair-use guardrails.
- Slack approval flow.
- Public "our calls" page driven by `x_posts` (feeds SEO/backlinks to the site).
- Escalation path: dual Claude+Grok for top items to keep parity with the site.

---

## 10. Decisions (locked 2026-07-24)

1. **X API tier** — *Unknown / assume free.* Build discovery on **Grok `x_search`**; keep
   `discoverCandidates()` swappable so native X `search/recent` drops in if we upgrade to Basic+.
2. **Approval surface** — **Next.js admin page** (`/admin/x-queue`) for the MVP. Slack is Phase 3.
3. **Post cadence** — **3–4 posts/day** to start (`DAILY_POST_CAP=4`), raise after warm-up.
