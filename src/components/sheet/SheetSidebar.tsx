import { useEffect, useMemo, useRef, useState } from 'react'
import { isSheetEmpty, type Sheet, type Workbook } from '@/lib/workbook/model'
import { Icon } from '@/components/ui/Icon'

interface SheetSidebarProps {
  workbook: Workbook
  activeSheetId: string | null
  onSelect: (sheetId: string) => void
  onShowOverview: () => void
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
  onCollapse?: () => void
}

export function SheetList({
  workbook,
  activeSheetId,
  onSelect,
  onShowOverview,
  onCollapse,
}: SheetListProps) {
  const [query, setQuery] = useState('')
  const activeRef = useRef<HTMLButtonElement>(null)

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
          <ul className="space-y-0.5">
            {matches.map((sheet) => (
              <li key={sheet.sheetId}>
                <SheetLink
                  ref={sheet.sheetId === activeSheetId ? activeRef : undefined}
                  sheet={sheet}
                  active={sheet.sheetId === activeSheetId}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        )}
      </nav>
    </>
  )
}

interface SheetLinkProps {
  sheet: Sheet
  active: boolean
  onSelect: (sheetId: string) => void
  ref?: React.Ref<HTMLButtonElement>
}

function SheetLink({ sheet, active, onSelect, ref }: SheetLinkProps) {
  const empty = isSheetEmpty(sheet)
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(sheet.sheetId)}
      aria-current={active ? 'page' : undefined}
      title={sheet.sheetName}
      className={`group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors ${
        active
          ? 'bg-brand-100 font-medium text-brand-900'
          : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900'
      }`}
    >
      <Icon
        name={empty ? 'article' : 'table_chart'}
        className={`shrink-0 text-[18px] ${active ? 'text-brand-600' : 'text-ink-400'}`}
      />
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
  )
}
