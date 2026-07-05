// A one-click "Share on X" button. Pure presentational (just an anchor to X's
// tweet intent), so it works inside both server and client components. The
// linked page's OG image is what unfurls as the card graphic.

export default function ShareOnX({
  url,
  text,
  className,
  label = 'Share on X',
}: {
  url: string
  text: string
  className?: string
  label?: string
}) {
  const href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Share this story on X"
      className={
        className ??
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors'
      }
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {label}
    </a>
  )
}
