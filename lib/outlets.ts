/**
 * Canonical outlet list for the web app, derived from the pipeline's single
 * source of truth (pipeline/outlets.js) so the two never drift. Used to
 * statically generate the per-outlet SEO pages and their OG images.
 */

interface RawOutlet {
  name: string
  abbr: string
  newsapiId: string | null
  rssUrl: string
  expectedRange: [number, number]
}

// pipeline/outlets.js is pure data (CommonJS, no node-only deps). require keeps
// it usable without enabling allowJs in tsconfig, matching lib/db.ts's style.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OUTLETS } = require('../pipeline/outlets.js') as {
  OUTLETS: Record<string, RawOutlet>
}

export interface WebOutlet {
  id: string
  slug: string
  name: string
  abbr: string
  /** Expected bias range on the 0–10 scale (from media research). */
  expectedRange: [number, number]
}

export const WEB_OUTLETS: WebOutlet[] = Object.entries(OUTLETS).map(
  ([id, o]) => ({
    id,
    slug: id,
    name: o.name,
    abbr: o.abbr,
    expectedRange: o.expectedRange,
  })
)

export function getWebOutlet(slug: string): WebOutlet | undefined {
  return WEB_OUTLETS.find((o) => o.slug === slug)
}
