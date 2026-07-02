import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — Spin Detector',
  description: 'Privacy policy for Spin Detector, explaining how we collect, use, and protect your data.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPolicy() {
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
        <h2 className="text-3xl font-black mb-2">Privacy Policy</h2>
        <p className="text-slate-500 text-sm mb-10">Last updated: May 2026</p>

        <div className="space-y-8 text-slate-300 leading-relaxed">

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Overview</h3>
            <p>
              Spin Detector (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates spindetector.com. This Privacy Policy explains
              what information we collect, how we use it, and your rights regarding that information.
              By using this site, you agree to the practices described below.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Information We Collect</h3>
            <p className="mb-3">We do not require account registration and do not collect personal information directly. However, the following data may be collected automatically:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>IP address and general geographic location (country/region)</li>
              <li>Browser type and version</li>
              <li>Pages visited and time spent on site</li>
              <li>Referring website</li>
              <li>Device type (desktop, mobile, tablet)</li>
            </ul>
            <p className="mt-3">This data is collected through standard web server logs and third-party analytics services.</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Cookies</h3>
            <p className="mb-3">
              This site uses cookies — small text files stored in your browser. Cookies are used for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>Analytics (understanding how visitors use the site)</li>
              <li>Advertising (serving relevant ads via Google AdSense)</li>
              <li>Site functionality (remembering your preferences)</li>
            </ul>
            <p className="mt-3">
              You can disable cookies in your browser settings, though some site features may not function correctly as a result.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Google AdSense & Advertising</h3>
            <p className="mb-3">
              We use Google AdSense to display advertisements on this site. Google AdSense uses cookies and web
              beacons to serve ads based on your prior visits to this and other websites.
            </p>
            <p className="mb-3">
              Google&apos;s use of advertising cookies enables it and its partners to serve ads based on your visit to
              this site and/or other sites on the internet. You may opt out of personalized advertising by visiting{' '}
              <a
                href="https://www.google.com/settings/ads"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Google&apos;s Ads Settings
              </a>.
            </p>
            <p>
              For more information on how Google uses data when you use our site, visit{' '}
              <a
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Google&apos;s Privacy & Terms
              </a>.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Third-Party Services</h3>
            <p className="mb-3">We use the following third-party services that may collect data independently:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li><strong className="text-slate-300">Google AdSense</strong> — advertising, subject to Google&apos;s Privacy Policy</li>
              <li><strong className="text-slate-300">Vercel</strong> — website hosting, subject to Vercel&apos;s Privacy Policy</li>
              <li><strong className="text-slate-300">Supabase</strong> — database hosting, subject to Supabase&apos;s Privacy Policy</li>
            </ul>
            <p className="mt-3">We do not sell your personal data to third parties.</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Data Retention</h3>
            <p>
              We retain server log data for a maximum of 90 days. News article data and bias scores stored in
              our database are retained indefinitely for historical trend analysis but contain no personal information.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Your Rights</h3>
            <p className="mb-3">Depending on your location, you may have rights including:</p>
            <ul className="list-disc list-inside space-y-2 text-slate-400">
              <li>The right to know what data we hold about you</li>
              <li>The right to request deletion of your data</li>
              <li>The right to opt out of personalized advertising</li>
              <li>The right to lodge a complaint with a data protection authority (EU/UK residents)</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Children&apos;s Privacy</h3>
            <p>
              Spin Detector is not directed at children under 13. We do not knowingly collect personal
              information from children. If you believe a child has provided us with personal information,
              please contact us so we can delete it.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Changes to This Policy</h3>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this page
              with an updated date. Continued use of the site after changes constitutes acceptance of the
              updated policy.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-100 mb-3">Contact</h3>
            <p>
              For privacy-related questions or requests, contact us at:{' '}
              <a
                href="mailto:piers@spindetector.com"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                piers@spindetector.com
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
