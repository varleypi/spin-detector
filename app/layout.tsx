import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Spin Detector — Political Media Bias Tracker',
  description:
    'Real-time AI analysis of political bias across 12 major news outlets. Same story, multiple outlets, measurable bias.',
  keywords: ['media bias', 'political bias', 'news analysis', 'spin detector', 'journalism'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  )
}
