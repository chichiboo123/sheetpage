import { useEffect, useState } from 'react'
import { Toolbar } from './Toolbar'
import { SheetSidebar } from './sheet/SheetSidebar'
import { MobileSheetDrawer } from './sheet/MobileSheetDrawer'
import { SheetViewer } from './sheet/SheetViewer'
import { ShareDialog } from './share/ShareDialog'
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
  onCommitCell: (sheetId: string, r: number, c: number, input: string) => void
  onUndo: () => void
  onRedo: () => void
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
  onCommitCell,
  onUndo,
  onRedo,
}: WorkbookWorkspaceProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const { downloading, download } = useWorkbookDownload()

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
      />

      <div className="flex min-h-0 flex-1">
        <SheetSidebar
          workbook={workbook}
          activeSheetId={activeSheetId}
          onSelect={onSelectSheet}
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
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-[14px] text-ink-500">
              시트를 선택해주세요.
            </div>
          )}
          <ChichibooFooter />
        </div>
      </div>

      <MobileSheetDrawer
        open={drawerOpen}
        workbook={workbook}
        activeSheetId={activeSheetId}
        onSelect={onSelectSheet}
        onClose={() => setDrawerOpen(false)}
      />

      {shareOpen && <ShareDialog workbook={workbook} onClose={() => setShareOpen(false)} />}
    </div>
  )
}
