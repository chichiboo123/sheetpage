import { useEffect, useMemo, useRef, useState } from 'react'
import { isSheetEmpty, type Sheet, type Workbook } from '@/lib/workbook/model'
import { Icon } from '@/components/ui/Icon'

interface SheetSidebarProps {
  workbook: Workbook
  activeSheetId: string | null
  onSelect: (sheetId: string) => void
  onShowOverview: () => void
  /** Absent when the workbook must not be changed, which turns reordering off. */
  onMove?: (sheetId: string, to: number) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

/**
 * Sheet navigation as a page list.
 *
 * The whole point of SheetPage: a workbook with thirty tabs should read like a
 * small site's menu, not like a row of tabs you scroll sideways through. So the
 * sheets are a vertical list with search, and the current one is unmistakable.
 */
export function SheetSidebar({
  workbook,
  activeSheetId,
  onSelect,
  onShowOverview,
  onMove,
  collapsed,
  onToggleCollapsed,
}: SheetSidebarProps) {
  if (collapsed) {
    return (
      <div className="hidden w-12 shrink-0 flex-col items-center border-r border-ink-200 bg-white py-3 md:flex">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="시트 목록 펼치기"
          title="시트 목록 펼치기"
          className="grid h-9 w-9 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <Icon name="menu_open" className="rotate-180 text-[20px]" />
        </button>
      </div>
    )
  }

  return (
    <div className="hidden w-64 shrink-0 flex-col border-r border-ink-200 bg-white md:flex lg:w-72">
      <SheetList
        workbook={workbook}
        activeSheetId={activeSheetId}
        onSelect={onSelect}
        onShowOverview={onShowOverview}
        onMove={onMove}
        onCollapse={onToggleCollapsed}
      />
    </div>
  )
}

interface SheetListProps {
  workbook: Workbook
  activeSheetId: string | null
  onSelect: (sheetId: string) => void
  onShowOverview: () => void
  onMove?: (sheetId: string, to: number) => void
  onCollapse?: () => void
}

export function SheetList({
  workbook,
  activeSheetId,
  onSelect,
  onShowOverview,
  onMove,
  onCollapse,
}: SheetListProps) {
  const [query, setQuery] = useState('')
  const activeRef = useRef<HTMLButtonElement>(null)
  const drag = useSheetReorder(workbook.sheets.length, onMove)
  // Search results are a subset in match order, so a position dragged there
  // would mean nothing in the file.
  const reordering = onMove != null && query.trim() === ''

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return workbook.sheets
    return workbook.sheets.filter((sheet) => sheet.sheetName.toLowerCase().includes(needle))
  }, [workbook.sheets, query])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeSheetId])

  return (
    <>
      <div className="border-b border-ink-200 px-3 py-3">
        <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink-900" title={workbook.title}>
              {workbook.title}
            </p>
            <p className="text-2xs text-ink-400">시트 {workbook.sheets.length}개</p>
          </div>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="시트 목록 접기"
              title="시트 목록 접기"
              className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800"
            >
              <Icon name="menu_open" className="text-[18px]" />
            </button>
          )}
        </div>

        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[17px] text-ink-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="시트 검색"
            aria-label="시트 검색"
            className="h-9 w-full rounded-md border border-ink-200 bg-ink-50 pl-8 pr-2.5 text-[13px] text-ink-900 placeholder:text-ink-400 focus:border-brand-400 focus:bg-white"
          />
        </div>
      </div>

      <nav aria-label="시트 목록" className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {/* While a search is running the list is a set of results, so the
            navigation root would only be a non-matching row in the middle. */}
        {query.trim() === '' && (
        <>
        <button
          type="button"
          onClick={onShowOverview}
          aria-current={activeSheetId === null ? 'page' : undefined}
          className={`mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors ${
            activeSheetId === null
              ? 'bg-brand-100 font-medium text-brand-900'
              : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
          }`}
        >
          <Icon
            name="grid_view"
            className={`shrink-0 text-[18px] ${activeSheetId === null ? 'text-brand-600' : 'text-ink-400'}`}
          />
          <span className="min-w-0 flex-1 truncate">전체 시트</span>
        </button>
        <div className="mx-2.5 mb-1.5 border-t border-ink-100" />
        </>
        )}

        {matches.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-ink-400">
            &lsquo;{query}&rsquo;와 일치하는 시트가 없습니다.
          </p>
        ) : (
          <ul
            className="space-y-0.5"
            onPointerMove={drag.track}
            onPointerUp={drag.drop}
            onPointerCancel={drag.drop}
          >
            {(reordering ? drag.preview(matches) : matches).map((sheet, index) => (
              <li key={sheet.sheetId} className={sheet.sheetId === drag.movingId ? 'opacity-40' : ''}>
                <SheetLink
                  ref={sheet.sheetId === activeSheetId ? activeRef : undefined}
                  sheet={sheet}
                  active={sheet.sheetId === activeSheetId}
                  onSelect={onSelect}
                  onGrab={reordering ? (event) => drag.grab(event, sheet.sheetId, index) : undefined}
                  onNudge={reordering ? (delta) => drag.nudge(sheet, index, delta) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </nav>

      {/* Reordering by drag or by keyboard leaves nothing on screen that says
          what happened, so the new position is announced instead. */}
      <p className="sr-only" role="status" aria-live="polite">
        {drag.announcement}
      </p>
    </>
  )
}

/**
 * Dragging a sheet to a new position in the list.
 *
 * Pointer events rather than HTML5 drag-and-drop, because the same code then
 * works for a finger on a phone, and because the list can preview the new order
 * as the sheet is dragged instead of showing a ghost image of the row.
 */
function useSheetReorder(total: number, onMove: ((sheetId: string, to: number) => void) | undefined) {
  const [drag, setDrag] = useState<{
    sheetId: string
    from: number
    to: number
    startY: number
    rowHeight: number
  } | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const grab = (event: React.PointerEvent, sheetId: string, index: number) => {
    if (!onMove || event.button !== 0) return
    event.preventDefault()
    const row = (event.currentTarget as HTMLElement).closest('li')
    const handle = event.currentTarget as HTMLElement
    handle.setPointerCapture(event.pointerId)
    setDrag({
      sheetId,
      from: index,
      to: index,
      startY: event.clientY,
      rowHeight: row?.offsetHeight || 36,
    })
  }

  const track = (event: React.PointerEvent) => {
    if (!drag) return
    const steps = Math.round((event.clientY - drag.startY) / drag.rowHeight)
    const to = Math.min(Math.max(0, drag.from + steps), total - 1)
    if (to !== drag.to) setDrag({ ...drag, to })
  }

  const drop = () => {
    if (!drag) return
    setDrag(null)
    if (drag.to !== drag.from) onMove?.(drag.sheetId, drag.to)
  }

  const nudge = (sheet: Sheet, index: number, delta: number) => {
    const to = Math.min(Math.max(0, index + delta), total - 1)
    if (to === index) return
    onMove?.(sheet.sheetId, to)
    setAnnouncement(`${sheet.sheetName} 시트를 ${to + 1}번째로 옮겼습니다.`)
  }

  return {
    movingId: drag?.sheetId ?? null,
    announcement,
    grab,
    track,
    drop,
    nudge,
    /** The list as it would look if the drag ended here. */
    preview: (sheets: Sheet[]) => {
      if (!drag || drag.to === drag.from) return sheets
      const next = sheets.slice()
      const [moved] = next.splice(drag.from, 1)
      next.splice(drag.to, 0, moved)
      return next
    },
  }
}

interface SheetLinkProps {
  sheet: Sheet
  active: boolean
  onSelect: (sheetId: string) => void
  /** Starts a drag. Absent when the list is not reorderable right now. */
  onGrab?: (event: React.PointerEvent) => void
  /** Moves the sheet one place up (-1) or down (+1). */
  onNudge?: (delta: number) => void
  ref?: React.Ref<HTMLButtonElement>
}

function SheetLink({ sheet, active, onSelect, onGrab, onNudge, ref }: SheetLinkProps) {
  const empty = isSheetEmpty(sheet)
  return (
    <div className="group relative flex items-center">
      {onGrab && (
        <span
          aria-hidden="true"
          onPointerDown={onGrab}
          title="드래그해서 순서 바꾸기"
          className="absolute left-0 z-10 grid h-full w-4 cursor-grab touch-none place-items-center text-ink-300 opacity-50 transition-opacity active:cursor-grabbing group-hover:opacity-100"
        >
          <Icon name="drag_indicator" className="text-[15px]" />
        </span>
      )}
      <button
        ref={ref}
        type="button"
        onClick={() => onSelect(sheet.sheetId)}
        onKeyDown={(event) => {
          // Alt+arrow moves the sheet, matching the drag handle for anyone who
          // cannot use one. Plain arrows are left to the browser's own focus
          // movement.
          if (!onNudge || !event.altKey) return
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          onNudge(event.key === 'ArrowDown' ? 1 : -1)
        }}
        aria-current={active ? 'page' : undefined}
        title={onNudge ? `${sheet.sheetName} · Alt+↑/↓로 순서 바꾸기` : sheet.sheetName}
        className={`flex w-full items-center gap-2 rounded-md py-2 pr-2.5 text-left text-[13.5px] transition-colors ${
          onGrab ? 'pl-5' : 'pl-2.5'
        } ${
          active
            ? 'bg-brand-100 font-medium text-brand-900'
            : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
        }`}
      >
        {/* A sheet the user gave an icon keeps it everywhere it appears, so the
            list and the contents page read as the same set of pages. */}
        {sheet.metadata.icon ? (
          <span className="shrink-0 text-[15px] leading-none">{sheet.metadata.icon}</span>
        ) : (
          <Icon
            name={empty ? 'article' : 'table_chart'}
            className={`shrink-0 text-[18px] ${active ? 'text-brand-600' : 'text-ink-400'}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{sheet.sheetName}</span>
        {sheet.metadata.hidden && (
          <Icon name="visibility_off" className="shrink-0 text-[15px] text-ink-400" />
        )}
        <span
          className={`shrink-0 text-2xs tabular-nums ${active ? 'text-brand-700' : 'text-ink-400'}`}
        >
          {empty ? '—' : sheet.rows.toLocaleString('ko-KR')}
        </span>
      </button>
    </div>
  )
}
