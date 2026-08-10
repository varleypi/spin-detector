'use client'

/**
 * One-tap reply queue. Built phone-first, because that's where it gets used:
 * the X composer opens in the app, you post, you come back and mark it done.
 *
 * The flow is two taps per reply — "Open in X" then "Mark posted" — and the
 * design goal is that the whole day's queue is clearable in under a minute.
 * Anything that adds a decision (editing, scoring, re-reading the scale) is
 * deliberately not here; the pipeline already made those calls.
 */

import { useCallback, useEffect, useState } from 'react'

type TapItem = {
  id: string
  tweetId: string
  authorHandle: string
  authorName: string | null
  authorFollowers: number | null
  parentText: string
  parentUrl: string
  composed: string
  format: string | null
  clusterId: string | null
  biasScore: number | null
  ageMinutes: number | null
  createdAt: string
  intentUrl: string
}

function fmtFollowers(n: number | null) {
  if (!n) return ''
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`
  return String(n)
}

function fmtAge(min: number | null) {
  if (min == null) return ''
  if (min < 60) return `${min}m old`
  const h = Math.round(min / 60)
  if (h < 48) return `${h}h old`
  return `${Math.round(h / 24)}d old`
}

export default function XQueueClient() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [items, setItems] = useState<TapItem[]>([])
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [postedToday, setPostedToday] = useState(0)
  const [dailyCap, setDailyCap] = useState(8)
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
      if (!res.ok) throw new Error(json.error || 'failed to load')
      setItems(json.candidates || [])
      setPostedToday(json.postedToday ?? 0)
      setDailyCap(json.dailyCap ?? 8)
      setAuthed(true)
      // Remember the secret so a round-trip to the X app doesn't log you out.
      try {
        window.localStorage.setItem('sd_admin', key)
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  // Restore the session on load, and refresh when returning from the X app so
  // the queue reflects anything marked on another device.
  useEffect(() => {
    let saved = ''
    try {
      saved = window.localStorage.getItem('sd_admin') || ''
    } catch {}
    if (saved) {
      setSecret(saved)
      load(saved)
    }
  }, [load])

  useEffect(() => {
    if (!authed) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(secret)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [authed, secret, load])

  async function markPosted(item: TapItem) {
    setBusy(item.id)
    setError('')
    try {
      const res = await fetch('/api/x/post', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ id: item.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'failed')
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setPostedToday(json.postedToday ?? postedToday + 1)
      setNotice(`Recorded reply to @${item.authorHandle}`)
      setTimeout(() => setNotice(''), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(null)
    }
  }

  async function skip(item: TapItem) {
    setBusy(item.id)
    try {
      await fetch('/api/x/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ id: item.id, reason: 'skipped from tap queue' }),
      })
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      setError('could not skip')
    } finally {
      setBusy(null)
    }
  }

  if (!authed) {
    return (
      <main style={S.wrap}>
        <h1 style={S.h1}>Spin Detector — reply queue</h1>
        <p style={S.muted}>Enter the admin secret.</p>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(secret)}
          style={S.input}
          placeholder="admin secret"
          autoComplete="current-password"
        />
        <button onClick={() => load(secret)} style={S.primary} disabled={loading}>
          {loading ? 'Checking…' : 'Unlock'}
        </button>
        {error && <p style={S.error}>{error}</p>}
      </main>
    )
  }

  return (
    <main style={S.wrap}>
      <header style={S.header}>
        <h1 style={S.h1}>Reply queue</h1>
        <span style={S.count}>
          {postedToday}/{dailyCap} today
        </span>
      </header>

      {notice && <p style={S.notice}>{notice}</p>}
      {error && <p style={S.error}>{error}</p>}

      {items.length === 0 && !loading && (
        <p style={S.muted}>
          Nothing waiting. The pipeline adds replies a few times a day — pull to refresh later.
        </p>
      )}

      {items.map((item) => (
        <article key={item.id} style={S.card}>
          <div style={S.parentRow}>
            <a href={item.parentUrl} target="_blank" rel="noreferrer" style={S.handle}>
              @{item.authorHandle}
            </a>
            <span style={S.meta}>
              {fmtFollowers(item.authorFollowers)} · {fmtAge(item.ageMinutes)}
            </span>
          </div>

          <p style={S.parentText}>{item.parentText}</p>

          <div style={S.replyBox}>
            <span style={S.replyLabel}>
              Your reply{item.format ? ` · ${item.format}` : ''}
            </span>
            <pre style={S.replyText}>{item.composed}</pre>
          </div>

          <div style={S.actions}>
            <a
              href={item.intentUrl}
              target="_blank"
              rel="noreferrer"
              style={S.primaryLink}
              onClick={() => setOpened((p) => ({ ...p, [item.id]: true }))}
            >
              Open in X →
            </a>
            <button
              onClick={() => markPosted(item)}
              disabled={busy === item.id}
              style={opened[item.id] ? S.doneReady : S.done}
            >
              {busy === item.id ? '…' : 'Mark posted'}
            </button>
            <button onClick={() => skip(item)} disabled={busy === item.id} style={S.skip}>
              Skip
            </button>
          </div>
        </article>
      ))}
    </main>
  )
}

// Inline styles: this page is admin-only and never themed with the marketing
// site, so a stylesheet would be more indirection than it's worth.
const S: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 620,
    margin: '0 auto',
    padding: '20px 16px 64px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#0f172a',
  },
  header: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  h1: { fontSize: 22, fontWeight: 700, margin: '0 0 4px' },
  count: { fontSize: 14, color: '#64748b', whiteSpace: 'nowrap' },
  muted: { color: '#64748b', fontSize: 15, lineHeight: 1.5 },
  input: {
    width: '100%',
    padding: '12px 14px',
    fontSize: 16, // 16px stops iOS zooming the viewport on focus
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    margin: '12px 0',
  },
  primary: {
    width: '100%',
    padding: '14px',
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    background: '#0f172a',
    border: 'none',
    borderRadius: 10,
  },
  card: {
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    padding: 16,
    margin: '16px 0',
    background: '#fff',
  },
  parentRow: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' },
  handle: { fontWeight: 700, color: '#0f172a', textDecoration: 'none', fontSize: 15 },
  meta: { fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap' },
  parentText: { fontSize: 15, lineHeight: 1.45, color: '#475569', margin: '8px 0 14px' },
  replyBox: { background: '#f8fafc', borderRadius: 10, padding: 12, border: '1px solid #e2e8f0' },
  replyLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  replyText: {
    margin: '8px 0 0',
    fontSize: 15,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
  },
  actions: { display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' },
  primaryLink: {
    flex: '1 1 auto',
    textAlign: 'center',
    padding: '13px 16px',
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    background: '#1d9bf0',
    borderRadius: 10,
    textDecoration: 'none',
    minWidth: 140,
  },
  done: {
    padding: '13px 16px',
    fontSize: 15,
    fontWeight: 600,
    color: '#0f172a',
    background: '#fff',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
  },
  // Highlighted once the composer has been opened — the likely next action.
  doneReady: {
    padding: '13px 16px',
    fontSize: 15,
    fontWeight: 600,
    color: '#166534',
    background: '#dcfce7',
    border: '1px solid #86efac',
    borderRadius: 10,
  },
  skip: {
    padding: '13px 12px',
    fontSize: 15,
    color: '#94a3b8',
    background: 'transparent',
    border: 'none',
  },
  notice: { color: '#166534', background: '#dcfce7', padding: '10px 12px', borderRadius: 8 },
  error: { color: '#b91c1c', background: '#fee2e2', padding: '10px 12px', borderRadius: 8 },
}
