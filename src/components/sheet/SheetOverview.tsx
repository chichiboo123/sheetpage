import { useMemo, useState } from 'react'
import {
  buildMergeLookup,
  cellKey,
  columnNames,
  detectHeaderRow,
  displayValue,
  getCell,
  isSheetEmpty,
  sheetSummary,
  type Sheet,
  type Workbook,
} from '@/lib/workbook/model'
import { Icon } from '@/components/ui/Icon'
import { SheetIconPicker } from './SheetIconPicker'

export type OverviewView = 'post' | 'list'

const VIEW_KEY = 'sheetpage.overview-view'

/** Rows and columns shown in a post card's peek at the sheet's contents. */
const PEEK_ROWS = 3
const PEEK_COLS = 4

interface SheetOverviewProps {
  workbook: Workbook
  onSelect: (sheetId: string) => void
  onSetIcon: (sheetId: string, icon: string | undefined) => void
  readOnly: boolean
}

function readStoredView(): OverviewView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'post'
  } catch {
    return 'post'
  }
}

/**
 * The workbook's index page.
 *
 * A file with thirty tabs hides its own shape: the sidebar says the sheets
 * exist but not what is in them. This lays them out as a contents page, in
 * whichever of two readings suits the file — posts when you want to see what
 * each sheet holds, a plain list when you already know and just want to get
 * there.
 */
export function SheetOverview({ workbook, onSelect, onSetIcon, readOnly }: SheetOverviewProps) {
  const [view, setView] = useState<OverviewView>(readStoredView)

  const chooseView = (next: OverviewView) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // A remembered preference is a convenience, not a requirement.
    }
  }

  return (
    <div className="thin-scrollbar min-h-0 flex-1 overflow-auto bg-canvas">
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-semibold tracking-tight text-ink-900">
              {workbook.title}
            </h2>
            <p className="mt-1 text-[13.5px] text-ink-500">
              시트 {workbook.sheets.length}개 · 보려는 시트를 선택하세요.
            </p>
          </div>

          <div className="flex shrink-0 items-center rounded-md border border-ink-200 bg-white p-0.5">
            <ViewButton
              active={view === 'post'}
              onClick={() => chooseView('post')}
              icon="grid_view"
              label="포스트"
            />
            <ViewButton
              active={view === 'list'}
              onClick={() => chooseView('list')}
              icon="format_list_bulleted"
              label="리스트"
            />
          </div>
        </header>

        {view === 'post' ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {workbook.sheets.map((sheet, index) => (
              <li key={sheet.sheetId}>
                <PostCard
                  sheet={sheet}
                  index={index}
                  onSelect={onSelect}
                  onSetIcon={onSetIcon}
                  readOnly={readOnly}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="rounded-lg border border-ink-200 bg-white px-2 py-1.5">
            {workbook.sheets.map((sheet) => (
              <li key={sheet.sheetId}>
                <ListRow sheet={sheet} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-[13px] font-medium transition-colors ${
        active ? 'bg-brand-100 text-brand-800' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
      }`}
    >
      <Icon name={icon} className="text-[17px]" />
      {label}
    </button>
  )
}

/** Falls back to a shape that at least separates data sheets from empty ones. */
function autoIcon(sheet: Sheet): string {
  return isSheetEmpty(sheet) ? '📄' : '📊'
}

function PostCard({
  sheet,
  index,
  onSelect,
  onSetIcon,
  readOnly,
}: {
  sheet: Sheet
  index: number
  onSelect: (sheetId: string) => void
  onSetIcon: (sheetId: string, icon: string | undefined) => void
  readOnly: boolean
}) {
  const [picking, setPicking] = useState(false)
  const empty = isSheetEmpty(sheet)
  const headerRow = useMemo(() => detectHeaderRow(sheet), [sheet])
  const summary = useMemo(() => sheetSummary(sheet, headerRow), [sheet, headerRow])
  const columns = useMemo(() => columnNames(sheet, headerRow), [sheet, headerRow])

  const rows = Math.min(sheet.rows, PEEK_ROWS)
  const cols = Math.min(sheet.cols, PEEK_COLS)
  // Cells hidden under a merge are not visible in the real sheet, so showing
  // them here would make the preview disagree with what the user opens.
  const merges = useMemo(() => buildMergeLookup(sheet), [sheet.merges]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-ink-200 bg-white transition-colors hover:border-brand-400">
      {/* Stands in for a cover image: the first rows, as the sheet actually looks. */}
      <button
        type="button"
        onClick={() => onSelect(sheet.sheetId)}
        aria-label={`${sheet.sheetName} 시트 열기`}
        className="block h-[104px] w-full overflow-hidden border-b border-ink-100 bg-ink-50/60 p-2.5 text-left"
      >
        {empty ? (
          <p className="pt-7 text-center text-2xs text-ink-400">비어 있는 시트</p>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td
                      key={c}
                      className={`truncate px-1 py-px text-2xs ${
                        headerRow && r === 0 ? 'font-medium text-ink-700' : 'text-ink-500'
                      }`}
                    >
                      {merges.covered.has(cellKey(r, c)) ? '' : displayValue(getCell(sheet, r, c))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </button>

      <div className="flex flex-1 flex-col p-4">
        <div className="relative flex items-start gap-2">
          {readOnly ? (
            <span className="mt-px text-[19px] leading-none">{sheet.metadata.icon ?? autoIcon(sheet)}</span>
          ) : (
            <button
              type="button"
              onClick={() => setPicking((open) => !open)}
              aria-label={`${sheet.sheetName} 아이콘 변경`}
              title="아이콘 변경"
              className="-m-1 rounded p-1 text-[19px] leading-none transition-colors hover:bg-ink-100"
            >
              {sheet.metadata.icon ?? autoIcon(sheet)}
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelect(sheet.sheetId)}
            className="min-w-0 flex-1 text-left"
          >
            <h3
              className="truncate text-[15px] font-semibold text-ink-900 group-hover:text-brand-800"
              title={sheet.sheetName}
            >
              {sheet.sheetName}
            </h3>
          </button>

          <span className="mt-1 shrink-0 text-2xs tabular-nums text-ink-300">
            {String(index + 1).padStart(2, '0')}
          </span>

          {picking && (
            <SheetIconPicker
              current={sheet.metadata.icon}
              onPick={(icon) => onSetIcon(sheet.sheetId, icon)}
              onClose={() => setPicking(false)}
            />
          )}
        </div>

        {summary && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-500">{summary}</p>
        )}

        <p className="mt-2 text-2xs tabular-nums text-ink-400">
          {empty
            ? '데이터 없음'
            : `${sheet.rows.toLocaleString('ko-KR')}행 · ${sheet.cols.toLocaleString('ko-KR')}열`}
          {sheet.metadata.hidden && ' · 원본에서 숨김'}
        </p>

        {/* The column names double as the card's tags: they say what kind of
            information this sheet holds without opening it. */}
        {columns.names.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-3">
            {columns.names.map((name) => (
              <span
                key={name}
                className="max-w-[140px] truncate rounded bg-ink-100 px-1.5 py-0.5 text-2xs text-ink-600"
              >
                {name}
              </span>
            ))}
            {columns.extra > 0 && (
              <span className="rounded px-1 py-0.5 text-2xs text-ink-400">+{columns.extra}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ListRow({ sheet, onSelect }: { sheet: Sheet; onSelect: (sheetId: string) => void }) {
  const empty = isSheetEmpty(sheet)
  return (
    <button
      type="button"
      onClick={() => onSelect(sheet.sheetId)}
      className="group flex w-full items-center gap-3 rounded-md px-3 py-3.5 text-left transition-colors hover:bg-ink-50"
    >
      <span className="shrink-0 text-[19px] leading-none">
        {sheet.metadata.icon ?? autoIcon(sheet)}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-[15px] text-ink-800 decoration-ink-300 underline-offset-4 group-hover:text-brand-800 group-hover:underline"
        title={sheet.sheetName}
      >
        {sheet.sheetName}
      </span>
      {sheet.metadata.hidden && (
        <Icon name="visibility_off" className="shrink-0 text-[15px] text-ink-400" />
      )}
      <span className="shrink-0 text-2xs tabular-nums text-ink-400">
        {empty ? '—' : `${sheet.rows.toLocaleString('ko-KR')}행`}
      </span>
    </button>
  )
}
