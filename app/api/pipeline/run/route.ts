import { NextRequest, NextResponse } from 'next/server'

/**
 * Remotely triggers the Daily Bias Pipeline GitHub Actions workflow via a
 * workflow_dispatch event, so the pipeline can be kicked off from the UI
 * without opening the GitHub Actions tab.
 *
 * Requires:
 *   GITHUB_TOKEN  — PAT with `workflow` scope (or a fine-grained token with
 *                   Actions: write) on the repo.
 *   GITHUB_REPO   — "owner/repo"; defaults to varleypi/spin-detector.
 * Optional:
 *   PIPELINE_TRIGGER_SECRET — when set, callers must send a matching
 *                   `x-trigger-secret` header, so the endpoint isn't open to
 *                   anonymous visitors.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.PIPELINE_TRIGGER_SECRET
  if (secret && request.headers.get('x-trigger-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO ?? 'varleypi/spin-detector'

  if (!token) {
    return NextResponse.json(
      { error: 'Remote trigger not configured (GITHUB_TOKEN missing)' },
      { status: 503 }
    )
  }

  const [owner, repoName] = repo.split('/')

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/actions/workflows/daily-pipeline.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'master' }),
      }
    )

    if (res.status === 204) {
      return NextResponse.json({ ok: true })
    }

    // Log full detail server-side; return a generic message to the client.
    const detail = await res.text()
    console.error('Workflow dispatch failed:', res.status, detail)
    return NextResponse.json(
      { error: 'Failed to trigger pipeline' },
      { status: res.status === 401 || res.status === 403 ? 502 : res.status }
    )
  } catch (error) {
    console.error('Workflow dispatch error:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: 'Failed to reach GitHub' }, { status: 502 })
  }
}
