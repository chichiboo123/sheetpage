import { Icon } from './ui/Icon'

/** Site-wide credit footer, per the standing footer rule. */
export function ChichibooFooter({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`w-full border-t border-ink-200 bg-ink-50 px-6 py-3 text-center ${className}`}
    >
      <a
        href="https://litt.ly/chichiboo"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[13px] text-ink-500 transition-colors hover:text-brand-600"
      >
        <Icon name="auto_stories" className="text-[16px]" />
        Created by. 교육뮤지컬 꿈꾸는 치수쌤
      </a>
    </footer>
  )
}
