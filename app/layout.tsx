import type { Metadata } from 'next'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Spin Detector — Political Media Bias Tracker',
  description:
    'Real-time AI analysis of political bias across 55 major news outlets. Same story, multiple outlets, measurable bias.',
  keywords: ['media bias', 'political bias', 'news analysis', 'spin detector', 'journalism'],
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
      </body>
    </html>
  )
}
