import type { Metadata } from 'next'
import Link from 'next/link'
import SpinCheckClient from '@/components/SpinCheckClient'

export const metadata: Metadata = {
  title: 'Spin Check — Score Any Text for Political Bias | Spin Detector',
  description:
    'Paste an X post, a headline, or an article and get an instant political bias score from both Claude and Grok, on the same −5 to +5 scale Spin Detector uses to track 56 news outlets.',
  alternates: { canonical: '/spin-check' },
  openGraph: {
    title: 'Spin Check — Score Any Text for Political Bias',
    description:
      'Paste any text and see how Claude and Grok score its political framing, from −5 (far left) to +5 (far right).',
    url: 'https://spindetector.com/spin-check',
    siteName: 'Spin Detector',
    type: 'website',
  },
}

export default function SpinCheckPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-baseline gap-2">
            <h1 className="text-xl font-black tracking-tight">
              <span style={{ color: '#3b82f6' }}>SPIN</span>
              <span className="text-slate-400 mx-1.5 font-light">·</span>
              <span style={{ color: '#ef4444' }}>DETECTOR</span>
            </h1>
          </Link>
          <Link href="/" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
            Spin Check
          </div>
          <h2 className="text-3xl font-black mb-3">Score any text for political bias</h2>
          <p className="text-slate-400 leading-relaxed max-w-2xl">
            Paste an X post, a headline, or a few paragraphs of an article. Two AI models —{' '}
            <span className="text-slate-200 font-semibold">Claude</span> and{' '}
            <span className="text-slate-200 font-semibold">Grok</span> — read it independently and
            score its political framing on the same −5 (far left) to +5 (far right) scale we use to
            track 56 news outlets every day. Where they disagree is often the interesting part.
          </p>
        </div>

        <SpinCheckClient />

        <section className="mt-12 space-y-6 text-sm text-slate-400 leading-relaxed">
          <div>
            <h3 className="text-base font-bold text-slate-100 mb-2">What is actually being scored</h3>
            <p>
              The models score <strong className="text-slate-300">language, not politics</strong>. They
              look for the linguistic signals that mark a piece of writing as left- or right-framed:
              loaded word choice (&ldquo;undocumented&rdquo; vs &ldquo;illegal alien&rdquo;), charged verbs, who is cast
              as victim and who as threat, which sources are treated as trustworthy, and what gets
              emphasised versus buried. Subject matter alone moves nothing — a post about immigration
              is not left or right because of its topic, only because of its wording.
            </p>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 mb-2">Why two models</h3>
            <p>
              Claude and Grok are given an identical rubric and never see each other&apos;s answers. Two
              independent readings make a single model&apos;s quirks visible: when both land in the same
              place, the framing is unambiguous; when they diverge by more than a point or two, the
              text is genuinely ambiguous — or one model is reacting to something the other ignored.
              The{' '}
              <Link href="/" className="text-slate-200 underline underline-offset-2 hover:text-white">
                Model Wars
              </Link>{' '}
              tab tracks the same disagreement across every outlet we follow.
            </p>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-100 mb-2">Limits worth knowing</h3>
            <p>
              A score is a computational estimate of linguistic patterns, not a fact-check and not a
              verdict on whether the text is true, fair, or worth reading. Short inputs are harder to
              score than long ones — a six-word headline gives the models very little to work with,
              which is why each verdict carries a confidence rating. Nothing you paste is stored.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
