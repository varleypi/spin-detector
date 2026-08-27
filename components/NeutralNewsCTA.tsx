import { NEUTRAL_NEWS_URL } from '@/lib/links'

/**
 * Cross-promo for our sister site: the same headlines, rewritten without the
 * spin. Rendered as a slim banner near the top of the homepage.
 */
export default function NeutralNewsCTA() {
  return (
    <a
      href={NEUTRAL_NEWS_URL}
      target="_blank"
      rel="noopener"
      className="group flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/[0.12]"
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 flex-shrink-0">
        Spin removed
      </span>
      <span className="text-sm text-slate-300 leading-snug">
        Seen how the outlets spin it? Now read the same stories with the spin taken out at{' '}
        <span className="font-semibold text-emerald-300 group-hover:text-emerald-200">Neutral News</span>
        <span className="text-emerald-400/70 group-hover:text-emerald-300"> →</span>
      </span>
    </a>
  )
}
