import { NextResponse } from 'next/server'

export async function POST() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO

  if (!token || !repo) {
    return NextResponse.json({ error: 'GitHub remote control not configured' }, { status: 503 })
  }

  const [owner, repoName] = repo.split('/')

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

  const body = await res.text()
  return NextResponse.json({ error: body }, { status: res.status })
}
