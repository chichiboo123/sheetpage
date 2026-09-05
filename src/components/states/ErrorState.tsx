import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Logo } from '@/components/Logo'

interface ErrorStateProps {
  title: string
  detail?: string
  /** Extra guidance specific to the failure — e.g. how to fix link sharing. */
  hints?: string[]
  actionLabel?: string
  onAction?: () => void
}

export function ErrorState({ title, detail, hints, actionLabel, onAction }: ErrorStateProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-16">
      <Logo className="mb-8" />
      <div className="w-full max-w-md rounded-lg border border-ink-200 bg-white p-6 text-center">
        <Icon name="error_outline" className="text-[30px] text-danger-600" />
        <h1 className="mt-3 text-[16px] font-semibold text-ink-900">{title}</h1>
        {detail && <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{detail}</p>}

        {hints && hints.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-md bg-ink-50 px-4 py-3 text-left text-[13px] text-ink-600">
            {hints.map((hint) => (
              <li key={hint} className="flex gap-2">
                <Icon name="chevron_right" className="mt-px shrink-0 text-[15px] text-ink-400" />
                <span className="leading-relaxed">{hint}</span>
              </li>
            ))}
          </ul>
        )}

        {onAction && (
          <Button variant="primary" size="md" className="mt-5" onClick={onAction}>
            {actionLabel ?? '다시 시도'}
          </Button>
        )}
      </div>
    </main>
  )
}
