import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'

/**
 * A small fixed palette rather than a full emoji keyboard.
 *
 * These icons only need to make thirty sheets tellable apart at a glance, and a
 * short list of document, subject and status marks does that faster than a
 * search field does.
 */
const PRESETS = [
  '📄', '📋', '📊', '📈', '📁', '🗂️', '📌', '🔖',
  '📝', '📚', '🗓️', '✅', '⭐', '💡', '🔍', '🎯',
  '🎭', '🎵', '🎬', '🎤', '🎨', '🩰', '🎪', '🏆',
  '🏫', '👥', '🌱', '🌍', '❤️', '✨', '🔥', '🧩',
]

const PANEL_WIDTH = 268
/** Breathing room kept between the panel and the edge of the window. */
const MARGIN = 8

interface SheetIconPickerProps {
  current: string | undefined
  /** The control the panel points at. Its position decides where the panel opens. */
  anchor: RefObject<HTMLElement | null>
  onPick: (icon: string | undefined) => void
  onClose: () => void
}

/**
 * The icon chooser.
 *
 * It renders into `document.body` rather than beside the button that opens it,
 * because the button lives inside a card that clips its own overflow — a panel
 * positioned inside that card gets cut off at the card's edge. Being in the
 * body means the panel is placed against the window instead, and it flips above
 * or slides left rather than opening off-screen.
 */
export function SheetIconPicker({ current, anchor, onPick, onClose }: SheetIconPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const place = () => {
      const panel = ref.current
      const target = anchor.current
      if (!panel || !target) return
      const rect = target.getBoundingClientRect()
      const height = panel.offsetHeight

      const left = Math.max(
        MARGIN,
        Math.min(rect.left, window.innerWidth - PANEL_WIDTH - MARGIN),
      )
      // Below the button by default; above it when there is no room below.
      const below = rect.bottom + 4
      const top =
        below + height > window.innerHeight - MARGIN
          ? Math.max(MARGIN, rect.top - height - 4)
          : below

      panel.style.left = `${Math.round(left)}px`
      panel.style.top = `${Math.round(top)}px`
      panel.style.visibility = 'visible'
    }

    place()
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    // Deferred so the click that opened the picker does not immediately close it.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onPointerDown))
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', place)
    // Capture, so the panel follows the button when any scroller moves it.
    window.addEventListener('scroll', place, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="시트 아이콘 선택"
      // Hidden for the first frame: it is measured before it is placed, and a
      // panel that appears at 0,0 and then jumps reads as a glitch.
      style={{ width: PANEL_WIDTH, visibility: 'hidden' }}
      className="fixed left-0 top-0 z-50 rounded-lg border border-ink-200 bg-white p-2 shadow-pop"
    >
      <div className="grid grid-cols-8 gap-0.5">
        {PRESETS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`아이콘 ${emoji}`}
            aria-pressed={current === emoji}
            onClick={() => {
              onPick(emoji)
              onClose()
            }}
            className={`grid h-8 w-8 place-items-center rounded text-[17px] leading-none transition-colors hover:bg-ink-100 ${
              current === emoji ? 'bg-brand-100' : ''
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {current && (
        <button
          type="button"
          onClick={() => {
            onPick(undefined)
            onClose()
          }}
          className="mt-1.5 flex w-full items-center gap-1.5 rounded border-t border-ink-100 px-2 pt-2 text-2xs text-ink-500 transition-colors hover:text-ink-900"
        >
          <Icon name="backspace" className="text-[14px]" />
          아이콘 지우기
        </button>
      )}
    </div>,
    document.body,
  )
}
