'use client'

import { useCallback, useEffect, useState } from 'react'

const MAX_TWEET = 280

type Candidate = {
  id: string
  tweet_url: string
  author_handle: string
  author_name: string | null
  author_type: string
  author_followers: number | null
  text: string
  likes: number
  reposts: number
  replies: number
  prefilter_score: number | null
  bias_score: number
  bias_signals: string[]
  rationale: string | null
  score_model: string | null
  composed: string
}

function fmtScore(score: number) {
  const d = Math.round((score - 5) * 10) / 10
  return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1)
}

function leanLabel(score: number) {
  const d = score - 5
  if (d <= -3) return 'Far Left'
  if (d <= -1) return 'Left'
  if (d < 1) return 'Center'
  if (d < 3) return 'Right'
  return 'Far Right'
}

// Blue (left) → purple (center) → red (right), matching the site's bias colors.
function scoreColor(score: number) {
  const d = score - 5
  if (d <= -1) return '#2563eb'
  if (d < 1) return '#7c3aed'
  return '#dc2626'
}

export default function XQueueClient() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [includeLink, setIncludeLink] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [postedToday, setPostedToday] = useState(0)
  const [dailyCap, setDailyCap] = useState(4)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (key: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/x/queue', { headers: { 'x-admin-secret': key } })
      if (res.status === 401) {
        setError('Incorrect secret.')
        setAuthed(false)
        return
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'failed to load queue')
      setCandidates(json.candidates)
      setPostedToday(json.postedToday)
      setDailyCap(json.dailyCap)
      setDrafts(
        Object.fromEntries(json.candidates.map((c: Candidate) => [c.id, c.composed])),
      )
      setAuthed(true)
      sessionStorage.setItem('sd_admin_secret', key)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem('sd_admin_secret')
    if (saved) {
      setSecret(saved)
      load(saved)
    }
  }, [load])

  async function act(id: string, action: 'post' | 'reject') {
    setBusy(id)
    setError('')
    setNotice('')
    try {
      const body =
        action === 'post'
          ? { id, text: drafts[id], includeLink: !!includeLink[id] }
          : { id }
      const res = await fetch(`/api/x/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `${action} failed`)
      if (action === 'post') {
        setNotice(`Posted to X → ${json.url}`)
        setPostedToday(json.postedToday)
      } else {
        setNotice('Candidate rejected.')
      }
      setCandidates((cs) => cs.filter((c) => c.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : `${action} failed`)
    } finally {
      setBusy(null)
    }
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-black tracking-tight mb-1">
            <span style={{ color: '#3b82f6' }}>SPIN</span>
            <span className="text-slate-400 mx-1.5 font-light">·</span>
            <span style={{ color: '#ef4444' }}>DETECTOR</span>
          </h1>
          <p className="text-sm text-slate-400 mb-6">X approval queue</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              load(secret)
            }}
          >
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Admin secret"
              autoFocus
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm
                         focus:outline-none focus:border-slate-500"
            />
            <button
              type="submit"
              disabled={!secret || loading}
              className="mt-3 w-full bg-slate-100 text-slate-900 font-semibold rounded px-3 py-2
                         text-sm hover:bg-white disabled:opacity-40"
            >
              {loading ? 'Checking…' : 'Unlock'}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    )
  }

  // ── Queue ──────────────────────────────────────────────────────────────────
  const capReached = postedToday >= dailyCap

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 sticky top-0 bg-slate-950/95 backdrop-blur z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-black tracking-tight">X Approval Queue</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {candidates.length} awaiting review · {postedToday}/{dailyCap} posted today
            </p>
          </div>
          <button
            onClick={() => load(secret)}
            disabled={loading}
            className="text-sm text-slate-400 hover:text-slate-200 disabled:opacity-40"
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {capReached && (
          <div className="mb-4 rounded border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
            Daily cap reached ({postedToday}/{dailyCap}). Posting is blocked until tomorrow —
            this protects the account from looking automated.
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded border border-emerald-700/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200 break-all">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {candidates.length === 0 && !loading && (
          <p className="text-slate-400 text-sm py-12 text-center">
            Nothing awaiting review. Run <code className="text-slate-300">node pipeline/x/run.js</code> to
            find new candidates.
          </p>
        )}

        <div className="space-y-5">
          {candidates.map((c) => {
            const draft = drafts[c.id] ?? ''
            const over = draft.length > MAX_TWEET
            return (
              <article
                key={c.id}
                className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden"
              >
                {/* Source tweet */}
                <div className="p-4 border-b border-slate-800">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <a
                        href={c.tweet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-slate-200 hover:underline"
                      >
                        @{c.author_handle}
                      </a>
                      <span className="ml-2 text-xs text-slate-500">
                        {c.author_type}
                        {c.author_followers
                          ? ` · ${(c.author_followers / 1000).toFixed(0)}k followers`
                          : ''}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className="text-2xl font-black leading-none"
                        style={{ color: scoreColor(c.bias_score) }}
                      >
                        {fmtScore(c.bias_score)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {leanLabel(c.bias_score)}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{c.text}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.bias_signals?.map((s, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {c.likes} likes · {c.reposts} reposts · virality{' '}
                    {c.prefilter_score ?? '—'} · {c.score_model}
                  </p>
                </div>

                {/* Draft post */}
                <div className="p-4">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Post text
                  </label>
                  <textarea
                    value={draft}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                    rows={7}
                    className="mt-1.5 w-full bg-slate-950 border border-slate-700 rounded px-3 py-2
                               text-sm text-slate-200 font-mono leading-relaxed resize-y
                               focus:outline-none focus:border-slate-500"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={!!includeLink[c.id]}
                        onChange={(e) =>
                          setIncludeLink((m) => ({ ...m, [c.id]: e.target.checked }))
                        }
                        className="accent-slate-400"
                      />
                      Add site link as self-reply
                    </label>
                    <span className={`text-xs ${over ? 'text-red-400' : 'text-slate-500'}`}>
                      {draft.length}/{MAX_TWEET}
                    </span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => act(c.id, 'post')}
                      disabled={busy === c.id || over || capReached || !draft.trim()}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm
                                 font-semibold rounded px-3 py-2 disabled:opacity-40
                                 disabled:hover:bg-emerald-600"
                    >
                      {busy === c.id ? 'Posting…' : 'Approve & Post'}
                    </button>
                    <button
                      onClick={() => act(c.id, 'reject')}
                      disabled={busy === c.id}
                      className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm
                                 font-semibold rounded py-2 disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </main>
    </div>
  )
}
