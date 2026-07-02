import type { Metadata } from 'next'
import Script from 'next/script'
import Link from 'next/link'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://www.spindetector.com'),
  title: 'Spin Detector — Political Media Bias Tracker',
  description:
    'Real-time AI analysis of political bias across 55 major news outlets. Same story, multiple outlets, measurable bias.',
  keywords: ['media bias', 'political bias', 'news analysis', 'spin detector', 'journalism'],
  verification: {
    google: '2AeeBLSQluxIY0viH_qPjGXThoZNQtVkgfB9RbclhO8',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9164130388115843"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Analytics />
        <footer className="border-t border-slate-800 bg-slate-950 mt-auto">
          <div className="max-w-5xl mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <span>© {new Date().getFullYear()} Spin Detector — AI-powered political media bias tracker</span>
            <nav className="flex gap-4">
              <Link href="/about" className="hover:text-slate-400 transition-colors">About</Link>
              <Link href="/privacy" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
              <a href="mailto:piers@spindetector.com" className="hover:text-slate-400 transition-colors">Contact</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  )
}
