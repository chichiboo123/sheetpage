import { useCallback, useEffect, useMemo, useState } from 'react'
import { Toolbar } from './Toolbar'
import { SheetSidebar } from './sheet/SheetSidebar'
import { MobileSheetDrawer } from './sheet/MobileSheetDrawer'
import { SheetViewer } from './sheet/SheetViewer'
import { SheetOverview } from './sheet/SheetOverview'
import { ShareDialog } from './share/ShareDialog'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { ChichibooFooter } from './ChichibooFooter'
import { useWorkbookDownload } from '@/hooks/use-download'
import type { Sheet, Workbook } from '@/lib/workbook/model'

interface WorkbookWorkspaceProps {
  workbook: Workbook
  activeSheet: Sheet | null
  activeSheetId: string | null
  readOnly: boolean
  edited: boolean
  canUndo: boolean
  onSelectSheet: (sheetId: string) => void
  onShowOverview: () => void
  onSetSheetIcon: (sheetId: string, icon: string | undefined) => void
  /** Moves a sheet to a new position in the workbook's tab order. */
  onMoveSheet: (sheetId: string, to: number) => void
  onCommitCell: (sheetId: string, r: number, c: number, input: string) => void
  onUndo: () => void
  onRedo: () => void
  /** Closes the workbook and returns to the start screen. */
  onReset: () => void
}

/**
 * The workbook screen: toolbar on top, sheet list on the left, the current
 * sheet filling the rest. Identical whether the workbook came from a file, a
 * Google Sheets link or a share snapshot — only `readOnly` differs.
 */
export function WorkbookWorkspace({
  workbook,
  activeSheet,
  activeSheetId,
  readOnly,
  edited,
  canUndo,
  onSelectSheet,
  onShowOverview,
  onSetSheetIcon,
  onMoveSheet,
  onCommitCell,
  onUndo,
  onRedo,
  onReset,
}: WorkbookWorkspaceProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { downloading, download } = useWorkbookDownload()

  const index = useMemo(
    () => workbook.sheets.findIndex((sheet) => sheet.sheetId === activeSheetId),
    [workbook.sheets, activeSheetId],
  )
  const previous = index > 0 ? workbook.sheets[index - 1] : null
  const next = index >= 0 && index < workbook.sheets.length - 1 ? workbook.sheets[index + 1] : null

  const step = useCallback(
    (direction: -1 | 1) => {
      if (index < 0) return
      const target = workbook.sheets[index + direction]
      if (target) onSelectSheet(target.sheetId)
    },
    [index, workbook.sheets, onSelectSheet],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd+PageUp/PageDown moves between sheets, as it does in Excel.
      if ((event.ctrlKey || event.metaKey) && (event.key === 'PageUp' || event.key === 'PageDown')) {
        event.preventDefault()
        step(event.key === 'PageDown' ? 1 : -1)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [step])

  useEffect(() => {
    if (readOnly) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      // Let the browser handle undo inside a field the user is typing in.
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return
      event.preventDefault()
      if (event.shiftKey) onRedo()
      else onUndo()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [readOnly, onUndo, onRedo])

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <Toolbar
        workbook={workbook}
        readOnly={readOnly}
        edited={edited}
        canUndo={canUndo}
        downloading={downloading}
        onOpenSheetList={() => setDrawerOpen(true)}
        onDownload={() => void download(workbook)}
        onShare={() => setShareOpen(true)}
        onUndo={onUndo}
        // Always confirm: closing the workbook discards it either way, and the
        // file has to be picked again to get back to where the user was.
        onReset={() => setConfirmReset(true)}
      />

      <div className="flex min-h-0 flex-1">
        <SheetSidebar
          workbook={workbook}
          activeSheetId={activeSheetId}
          onSelect={onSelectSheet}
          onShowOverview={onShowOverview}
          onMove={readOnly ? undefined : onMoveSheet}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeSheet ? (
            <SheetViewer
              key={activeSheet.sheetId}
              sheet={activeSheet}
              readOnly={readOnly}
              onCommit={(r, c, input) => onCommitCell(activeSheet.sheetId, r, c, input)}
              position={{ index, total: workbook.sheets.length }}
              previous={previous}
              next={next}
              onNavigate={onSelectSheet}
              onShowOverview={onShowOverview}
            />
          ) : (
            <SheetOverview
              workbook={workbook}
              onSelect={onSelectSheet}
              onSetIcon={onSetSheetIcon}
              readOnly={readOnly}
            />
          )}
          <ChichibooFooter />
        </div>
      </div>

      <MobileSheetDrawer
        open={drawerOpen}
        workbook={workbook}
        activeSheetId={activeSheetId}
        onSelect={onSelectSheet}
        onShowOverview={onShowOverview}
        onMove={readOnly ? undefined : onMoveSheet}
        onClose={() => setDrawerOpen(false)}
      />

      {shareOpen && <ShareDialog workbook={workbook} onClose={() => setShareOpen(false)} />}

      {confirmReset && (
        <Modal open title="처음 화면으로" onClose={() => setConfirmReset(false)}>
          <p className="text-[13.5px] leading-relaxed text-ink-600">
            {edited
              ? '지금까지 수정한 내용이 모두 사라집니다. 필요하다면 먼저 xlsx로 내려받거나 공유 링크를 만들어주세요.'
              : '열어둔 Workbook을 닫고 처음 화면으로 돌아갑니다. 다시 보려면 파일을 한 번 더 불러와야 합니다.'}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setConfirmReset(false)}>취소</Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmReset(false)
                onReset()
              }}
            >
              닫고 처음으로
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
