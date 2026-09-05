import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Describes the dialog for screen readers when the title is not enough. */
  description?: string
}

/**
 * A small focus-trapping dialog. Deliberately hand-rolled: the app needs one
 * dialog, and a component library would be more surface than it is worth.
 */
export function Modal({ open, title, description, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocusTo.current = document.activeElement as HTMLElement | null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('input, button')?.focus()
    }, 0)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(timer)
      restoreFocusTo.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/25 p-0 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default"
        aria-label="닫기"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-description={description}
        className="relative w-full max-w-lg rounded-t-xl border border-ink-200 bg-white shadow-pop sm:rounded-xl"
      >
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
