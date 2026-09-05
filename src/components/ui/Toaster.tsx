import { dismissToast, useToasts, type ToastTone } from '@/hooks/use-toast'
import { Icon } from './Icon'

const TONES: Record<ToastTone, { classes: string; icon: string }> = {
  success: { classes: 'border-brand-200 bg-white text-ink-800', icon: 'check_circle' },
  error: { classes: 'border-danger-200 bg-white text-ink-800', icon: 'error_outline' },
  info: { classes: 'border-ink-200 bg-white text-ink-800', icon: 'info' },
}

const ICON_COLOR: Record<ToastTone, string> = {
  success: 'text-brand-600',
  error: 'text-danger-600',
  info: 'text-ink-500',
}

export function Toaster() {
  const toasts = useToasts()

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-pop ${TONES[toast.tone].classes}`}
        >
          <Icon
            name={TONES[toast.tone].icon}
            className={`mt-px text-[18px] ${ICON_COLOR[toast.tone]}`}
          />
          <p className="flex-1 leading-snug">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="알림 닫기"
            className="-mr-1 grid h-5 w-5 shrink-0 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <Icon name="close" className="text-[16px]" />
          </button>
        </div>
      ))}
    </div>
  )
}
