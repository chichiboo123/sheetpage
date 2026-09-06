import { useEffect, useRef } from 'react'
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

interface SheetIconPickerProps {
  current: string | undefined
  onPick: (icon: string | undefined) => void
  onClose: () => void
}

export function SheetIconPicker({ current, onPick, onClose }: SheetIconPickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    // Deferred so the click that opened the picker does not immediately close it.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onPointerDown))
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="시트 아이콘 선택"
      className="absolute left-0 top-full z-30 mt-1 w-[268px] rounded-lg border border-ink-200 bg-white p-2 shadow-pop"
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
    </div>
  )
}
