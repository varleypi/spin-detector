import type { Metadata } from 'next'
import XQueueClient from './XQueueClient'

export const metadata: Metadata = {
  title: 'X Queue — Spin Detector Admin',
  robots: { index: false, follow: false },
}

export default function XQueuePage() {
  return <XQueueClient />
}
