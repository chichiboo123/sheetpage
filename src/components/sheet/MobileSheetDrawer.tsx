import { useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { SheetList } from './SheetSidebar'
import type { Workbook } from '@/lib/workbook/model'

interface MobileSheetDrawerProps {
  open: boolean
  workbook: Workbook
  activeSheetId: string | null
  onSelect: (sheetId: string) => void
  onShowOverview: () => void
  onClose: () => void
}

/**
 * On a phone the sheet list is a drawer rather than a permanent column — the
 * screen is too narrow to give up a third of it, and shrinking the desktop
 * layout would make both halves unusable.
 */
export function MobileSheetDrawer({
  open,
  workbook,
  activeSheetId,
  onSelect,
  onShowOverview,
  onClose,
}: MobileSheetDrawerProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        type="button"
        aria-label="시트 목록 닫기"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-ink-900/25"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="시트 목록"
        className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-white shadow-pop"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-ink-200 px-3">
          <span className="text-[13px] font-semibold text-ink-900">시트 목록</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <SheetList
          workbook={workbook}
          activeSheetId={activeSheetId}
          onSelect={(sheetId) => {
            onSelect(sheetId)
            onClose()
          }}
          onShowOverview={() => {
            onShowOverview()
            onClose()
          }}
        />
      </div>
    </div>
  )
}
