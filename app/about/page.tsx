import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About — Spin Detector',
  description: 'About Spin Detector — how we measure political media bias using AI analysis of news headlines.',
}

export default function About() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
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

      <main className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="text-3xl font-black mb-2">About Spin Detector</h2>
        <p className="text-slate-400 text-lg mb-10 leading-relaxed">
          Same story. Multiple outlets. Measurable bias.
        </p>

        <div className="space-y-8 text-slate-300 leading-relaxed">

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">What Is Spin Detector?</h3>
            <p className="mb-3">
              Spin Detector is an automated media bias tracker that analyzes how 20 major news outlets
              cover the same political stories. Every day, our pipeline fetches hundreds of headlines,
              clusters them by topic, and uses AI to score each headline&apos;s political language on a
              0–10 scale — from Far Left to Far Right.
            </p>
            <p>
              The goal is simple: give readers a concrete, data-driven way to see how language shapes
              political narratives across the media spectrum.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">How the Bias Score Works</h3>
            <p className="mb-4">
              Each headline is scored from 0 to 10 based on linguistic signals detected by AI analysis:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { range: '0–2', label: 'Far Left', color: '#2563eb', desc: 'Heavy progressive framing, emotionally charged language' },
                { range: '2–4', label: 'Left', color: '#3b82f6', desc: 'Progressive framing, sympathetic to left causes' },
                { range: '4–6', label: 'Center', color: '#8b5cf6', desc: 'Neutral verbs, balanced sourcing, minimal ideological signals' },
                { range: '6–8', label: 'Right', color: '#ef4444', desc: 'Conservative framing, sympathetic to right causes' },
                { range: '8–10', label: 'Far Right', color: '#991b1b', desc: 'Heavy conservative framing, charged language' },
              ].map((tier) => (
                <div key={tier.range} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-mono font-bold" style={{ color: tier.color }}>{tier.range}</span>
                    <span className="text-sm font-semibold" style={{ color: tier.color }}>{tier.label}</span>
                  </div>
                  <p className="text-xs text-slate-500">{tier.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">What Signals We Detect</h3>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li><strong className="text-slate-300">Word choice</strong> — &quot;undocumented&quot; vs &quot;illegal alien&quot;; &quot;gun safety&quot; vs &quot;gun grab&quot;</li>
              <li><strong className="text-slate-300">Verb loading</strong> — &quot;enforcement&quot; (neutral) vs &quot;raids&quot; (left-charged) vs &quot;crackdown&quot; (right)</li>
              <li><strong className="text-slate-300">Victim framing</strong> — who is portrayed as harmed vs threatening</li>
              <li><strong className="text-slate-300">Source trust</strong> — implicit alignment with certain institutions or advocacy groups</li>
              <li><strong className="text-slate-300">Emphasis</strong> — what information leads a headline vs what is omitted</li>
              <li><strong className="text-slate-300">Qualifiers</strong> — &quot;controversial&quot; applied selectively to certain policies</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">The Outlets We Track</h3>
            <p className="mb-3">
              We currently track 20 major English-language news outlets across the political spectrum,
              from MSNBC and The Guardian on the left to Breitbart and The Daily Caller on the right,
              with centrist outlets including BBC, Politico, The Economist, and CNBC in between.
            </p>
            <p>
              Headlines are fetched daily via NewsAPI and RSS feeds. Each outlet has an expected bias
              range based on established media research — scores significantly outside that range on a
              given day are flagged as notable.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Important Limitations</h3>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-amber-300 text-sm leading-relaxed mb-2">
                Bias scores are generated by AI language model analysis and represent computational
                estimates of linguistic patterns only.
              </p>
              <ul className="text-amber-400/80 text-sm space-y-1 list-disc list-inside">
                <li>Scores do not constitute editorial opinion or factual ratings</li>
                <li>Headline-level analysis may not reflect a full article&apos;s content</li>
                <li>Individual article scores may reflect topic-specific framing, not a publication&apos;s overall stance</li>
                <li>AI models can have their own biases that affect scoring</li>
                <li>This tool is designed for educational purposes only</li>
              </ul>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Contact</h3>
            <p>
              Questions, feedback, or press inquiries:{' '}
              <a
                href="mailto:contact@spindetector.com"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                contact@spindetector.com
              </a>
            </p>
          </section>

        </div>
      </main>

      <footer className="border-t border-slate-800 mt-12">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-xs text-slate-700">
          Spin Detector · <Link href="/privacy" className="hover:text-slate-500">Privacy Policy</Link> · <Link href="/about" className="hover:text-slate-500">About</Link>
        </div>
      </footer>
    </div>
  )
}
