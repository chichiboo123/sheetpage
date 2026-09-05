interface LogoProps {
  className?: string
  /** Hides the wordmark, leaving just the mark (used in tight toolbars). */
  markOnly?: boolean
}

export function Logo({ className = '', markOnly = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        className="h-[22px] w-[22px] shrink-0"
        role="img"
        aria-label="SheetPage"
      >
        <rect width="32" height="32" rx="7" fill="#1F6B4A" />
        <rect x="7" y="8" width="18" height="16" rx="2" fill="#FFFFFF" />
        <rect x="7" y="8" width="18" height="4" fill="#8CC3A5" />
        <rect x="13" y="12" width="1.4" height="12" fill="#DCEDE3" />
        <rect x="19" y="12" width="1.4" height="12" fill="#DCEDE3" />
        <rect x="7" y="16" width="18" height="1.4" fill="#DCEDE3" />
        <rect x="7" y="20" width="18" height="1.4" fill="#DCEDE3" />
      </svg>
      {!markOnly && (
        <span className="text-[15px] font-semibold tracking-tight text-ink-900">SheetPage</span>
      )}
    </span>
  )
}
