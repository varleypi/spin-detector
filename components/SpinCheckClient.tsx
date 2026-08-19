'use client'

import { useState } from 'react'
import { fmtScore, biasLabel, scoreColor } from '@/lib/score'
import ShareOnX from '@/components/ShareOnX'

const MAX_CHARS = 5000
const MIN_CHARS = 15

// Mirrors lib/spinCheck.ts — the API returns one of these per model.
type Verdict = {
  ok: true
  biasScore: number
  biasSignals: string[]
  rationale: string
  confidence: 'low' | 'medium' | 'high'
  isPolitical: boolean
  model: string
}
type VerdictError = { ok: false; error: string; model: string }
type ModelResult = Verdict | VerdictError
type CheckResult = { claude: ModelResult; grok: ModelResult; checkedAt: string }

const EXAMPLES = [
  {
    label: 'Try a charged post',
    text:
      'Radical activists stormed the capital today demanding open borders while hardworking families ' +
      'foot the bill for a crisis this administration created and refuses to admit exists.',
  },
  {
    label: 'Try a neutral one',
    text:
      'The Senate voted 54-45 on Thursday to advance the spending bill. A final vote is expected next week, ' +
      'according to a statement from the majority leader.',
  },
]

// ── Small pieces ─────────────────────────────────────────────────────────────

/** The −5…+5 spectrum with a marker at this score. */
function SpectrumBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, (score / 10) * 100))
  return (
    <div className="relative pt-1 pb-4">
      <div
        className="h-1.5 rounded-full w-full"
        style={{ background: 'linear-gradient(to right, #1d4ed8, #3b82f6, #8b5cf6, #f59e0b, #ef4444, #991b1b)' }}
      />
      <div
        className="absolute top-0 w-0.5 h-4 rounded-full bg-slate-100 shadow"
        style={{ left: `calc(${pct}% - 1px)` }}
        aria-hidden="true"
      />
      <div className="flex justify-between text-[10px] text-slate-600 mt-1">
        <span>−5</span>
        <span>0</span>
        <span>+5</span>
      </div>
    </div>
  )
}

function ConfidenceChip({ confidence }: { confidence: Verdict['confidence'] }) {
  const tone =
    confidence === 'high'
      ? 'bg-green-500/10 text-green-400 border-green-500/30'
      : confidence === 'low'
        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
        : 'bg-slate-700/30 text-slate-400 border-slate-600/50'
  return (
    <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${tone}`}>
      {confidence} confidence
    </span>
  )
}

function VerdictCard({
  title,
  accent,
  result,
}: {
  title: string
  accent: string
  result: ModelResult
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-sm font-bold" style={{ color: accent }}>
          {title}
        </div>
        <span className="text-[10px] text-slate-600 font-mono">{result.model}</span>
      </div>

      {!result.ok ? (
        <div className="flex-1 flex items-center text-sm text-slate-500 leading-relaxed">{result.error}</div>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <div className="text-5xl font-black tabular-nums" style={{ color: scoreColor(result.biasScore) }}>
              {fmtScore(result.biasScore)}
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">{biasLabel(result.biasScore)}</div>
              <div className="text-[11px] text-slate-500">on the −5 … +5 scale</div>
            </div>
          </div>

          <SpectrumBar score={result.biasScore} />

          {!result.isPolitical && (
            <div className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5 mb-3">
              No political framing detected — scored as neutral by default.
            </div>
          )}

          {result.rationale && (
            <p className="text-sm text-slate-300 leading-relaxed mb-3">{result.rationale}</p>
          )}

          {result.biasSignals.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">
                Signals detected
              </div>
              <ul className="space-y-1">
                {result.biasSignals.map((s, i) => (
                  <li key={i} className="text-xs text-slate-400 flex gap-2 leading-relaxed">
                    <span className="text-slate-600 flex-shrink-0">▸</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-auto pt-1">
            <ConfidenceChip confidence={result.confidence} />
          </div>
        </>
      )}
    </div>
  )
}

/** Agreement strip — only meaningful when both models actually returned. */
function Consensus({ claude, grok }: { claude: ModelResult; grok: ModelResult }) {
  if (!claude.ok || !grok.ok) return null

  const avg = (claude.biasScore + grok.biasScore) / 2
  const diff = Math.abs(claude.biasScore - grok.biasScore)
  const verdict =
    diff < 0.5 ? 'Strong agreement' : diff < 1.5 ? 'Broad agreement' : diff < 3 ? 'Notable divergence' : 'Sharp disagreement'
  const tone = diff < 1.5 ? 'text-green-400' : diff < 3 ? 'text-amber-400' : 'text-red-400'

  const shareText =
    `I ran this through Spin Detector: Claude scored it ${fmtScore(claude.biasScore)}, ` +
    `Grok scored it ${fmtScore(grok.biasScore)} on a −5 (far left) to +5 (far right) scale. #MediaBias`

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
              Combined score
            </div>
            <div className="text-2xl font-black tabular-nums" style={{ color: scoreColor(avg) }}>
              {fmtScore(avg)}
              <span className="text-sm font-bold text-slate-400 ml-2">{biasLabel(avg)}</span>
            </div>
          </div>
          <div className="w-px h-10 bg-slate-800" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
              Model gap
            </div>
            <div className={`text-2xl font-black tabular-nums ${tone}`}>
              {diff.toFixed(1)}
              <span className="text-sm font-bold ml-2">{verdict}</span>
            </div>
          </div>
        </div>
        <ShareOnX url="https://www.spindetector.com/spin-check" text={shareText} label="Share result" />
      </div>
    </div>
  )
}

// ── Page body ────────────────────────────────────────────────────────────────

export default function SpinCheckClient() {
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckResult | null>(null)

  const tooShort = text.trim().length < MIN_CHARS
  const tooLong = text.length > MAX_CHARS

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading || tooShort || tooLong) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/spin-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), source: source.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.')
        return
      }
      setResult(data as CheckResult)
    } catch {
      setError('Could not reach the scorer. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
        <label htmlFor="spin-text" className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
          Paste the text
        </label>
        <textarea
          id="spin-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          maxLength={MAX_CHARS + 200}
          placeholder="Paste an X post, a headline, or a few paragraphs of an article…"
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-slate-600 resize-y"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                onClick={() => setText(ex.text)}
                className="text-[11px] font-semibold px-2 py-1 rounded border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
              >
                {ex.label}
              </button>
            ))}
          </div>
          <span className={`text-[11px] tabular-nums ${tooLong ? 'text-red-400' : 'text-slate-600'}`}>
            {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
          </span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="spin-source" className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              Where it came from <span className="font-normal normal-case tracking-normal text-slate-600">(optional)</span>
            </label>
            <input
              id="spin-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={200}
              placeholder="e.g. an X post by a political commentator"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-slate-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading || tooShort || tooLong}
            className="px-5 py-2.5 rounded-lg bg-slate-100 text-slate-900 text-sm font-bold hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          >
            {loading ? 'Scoring…' : 'Score this text'}
          </button>
        </div>

        {tooLong && (
          <p className="text-xs text-red-400 mt-2">
            Too long by {(text.length - MAX_CHARS).toLocaleString()} characters — trim it to {MAX_CHARS.toLocaleString()}.
          </p>
        )}
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 mb-6">
          {error}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {['Claude', 'Grok'].map((m) => (
            <div key={m} className="bg-slate-900 rounded-xl border border-slate-800 p-5 animate-pulse">
              <div className="text-sm font-bold text-slate-700 mb-4">{m} is reading it…</div>
              <div className="h-10 w-24 bg-slate-800 rounded mb-4" />
              <div className="h-1.5 bg-slate-800 rounded-full mb-4" />
              <div className="h-3 bg-slate-800 rounded mb-2" />
              <div className="h-3 bg-slate-800 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <VerdictCard title="Claude" accent="#d97757" result={result.claude} />
            <VerdictCard title="Grok" accent="#94a3b8" result={result.grok} />
          </div>
          <Consensus claude={result.claude} grok={result.grok} />
        </div>
      )}
    </>
  )
}
