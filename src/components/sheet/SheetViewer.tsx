import { useMemo, useState } from 'react'
import {
  cellAddress,
  detectHeaderRow,
  editValue,
  getCell,
  isSheetEmpty,
  type Sheet,
} from '@/lib/workbook/model'
import { Icon } from '@/components/ui/Icon'
import { SheetGrid, type CellPosition } from './SheetGrid'
import { SheetReader } from './SheetReader'

export type ViewMode = 'grid' | 'reader'

export interface SheetNeighbour {
  sheetId: string
  sheetName: string
}

interface SheetViewerProps {
  sheet: Sheet
  readOnly: boolean
  onCommit: (r: number, c: number, input: string) => void
  /** Position in the workbook, shown as "3 / 10" in the breadcrumb. */
  position: { index: number; total: number }
  previous: SheetNeighbour | null
  next: SheetNeighbour | null
  onNavigate: (sheetId: string) => void
  onShowOverview: () => void
}

/**
 * One sheet, in whichever of the two readings the user wants: the grid for
 * working with cells, the reader for reading the content as a page.
 */
export function SheetViewer({
  sheet,
  readOnly,
  onCommit,
  position,
  previous,
  next,
  onNavigate,
  onShowOverview,
}: SheetViewerProps) {
  const [mode, setMode] = useState<ViewMode>('grid')
  const [selection, setSelection] = useState<CellPosition | null>({ r: 0, c: 0 })
  const [valueDraft, setValueDraft] = useState<string | null>(null)

  const headerRow = useMemo(() => detectHeaderRow(sheet), [sheet.sheetId, sheet.rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const empty = isSheetEmpty(sheet)

  const selectedCell = selection ? getCell(sheet, selection.r, selection.c) : undefined
  const barValue = valueDraft ?? editValue(selectedCell)

  const commitBar = () => {
    if (valueDraft === null || !selection || readOnly) return
    onCommit(selection.r, selection.c, valueDraft)
    setValueDraft(null)
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-3 sm:px-4">
        <nav aria-label="현재 위치" className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onShowOverview}
            className="shrink-0 rounded px-1 py-0.5 text-[12.5px] text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
          >
            전체 시트
          </button>
          <Icon name="chevron_right" className="shrink-0 text-[15px] text-ink-300" />
          <h2
            className="truncate text-[13.5px] font-semibold text-ink-900"
            title={sheet.sheetName}
            aria-current="page"
          >
            {sheet.sheetName}
          </h2>
        </nav>

        <span className="hidden shrink-0 text-2xs tabular-nums text-ink-400 lg:inline">
          {sheet.rows.toLocaleString('ko-KR')}행 · {sheet.cols.toLocaleString('ko-KR')}열
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={!previous}
            onClick={() => previous && onNavigate(previous.sheetId)}
            aria-label={previous ? `이전 시트: ${previous.sheetName}` : '이전 시트 없음'}
            title={previous ? `이전 시트 · ${previous.sheetName}` : '첫 번째 시트입니다'}
            className="grid h-7 w-7 place-items-center rounded text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
          >
            <Icon name="chevron_left" className="text-[19px]" />
          </button>
          <span className="select-none text-2xs tabular-nums text-ink-400">
            {position.index + 1} / {position.total}
          </span>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && onNavigate(next.sheetId)}
            aria-label={next ? `다음 시트: ${next.sheetName}` : '다음 시트 없음'}
            title={next ? `다음 시트 · ${next.sheetName}` : '마지막 시트입니다'}
            className="grid h-7 w-7 place-items-center rounded text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-300 disabled:hover:bg-transparent"
          >
            <Icon name="chevron_right" className="text-[19px]" />
          </button>
        </div>

        <div className="flex shrink-0 items-center rounded-md border border-ink-200 p-0.5">
          <ModeButton
            active={mode === 'grid'}
            onClick={() => setMode('grid')}
            icon="grid_on"
            label="표 보기"
          />
          <ModeButton
            active={mode === 'reader'}
            onClick={() => setMode('reader')}
            icon="article"
            label="읽기 보기"
          />
        </div>
      </div>

      {mode === 'grid' && !empty && (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-ink-200 bg-ink-50/60 px-3 sm:px-4">
          <span className="w-14 shrink-0 text-2xs font-medium tabular-nums text-ink-500">
            {selection ? cellAddress(selection.r, selection.c) : '—'}
          </span>
          <div className="h-4 w-px shrink-0 bg-ink-200" />
          <input
            type="text"
            value={barValue}
            readOnly={readOnly || !selection}
            aria-label={
              selection ? `${cellAddress(selection.r, selection.c)} 셀 내용` : '선택된 셀 없음'
            }
            placeholder={readOnly ? '' : '셀 내용을 입력하세요'}
            onChange={(event) => setValueDraft(event.target.value)}
            onBlur={commitBar}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitBar()
                event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setValueDraft(null)
                event.currentTarget.blur()
              }
            }}
            className="h-7 min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-ink-800 placeholder:font-sans placeholder:text-ink-400 focus:outline-none read-only:text-ink-600"
          />
          {selectedCell?.f && (
            <span className="hidden shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-2xs font-medium text-brand-800 sm:inline">
              수식
            </span>
          )}
        </div>
      )}

      {empty ? (
        <EmptySheet name={sheet.sheetName} />
      ) : mode === 'grid' ? (
        <SheetGrid
          sheet={sheet}
          readOnly={readOnly}
          headerRow={headerRow}
          selection={selection}
          onSelect={(position) => {
            setSelection(position)
            setValueDraft(null)
          }}
          onCommit={onCommit}
        />
      ) : (
        <SheetReader sheet={sheet} headerRow={headerRow} />
      )}
    </section>
  )
}

function ModeButton({
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
      title={label}
      className={`flex h-7 items-center gap-1 rounded px-2 text-2xs font-medium transition-colors ${
        active ? 'bg-brand-100 text-brand-800' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
      }`}
    >
      <Icon name={icon} className="text-[16px]" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  )
}

function EmptySheet({ name }: { name: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <Icon name="article" className="text-[36px] text-ink-300" />
        <p className="mt-3 text-[15px] font-medium text-ink-800">비어 있는 시트입니다</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500">
          &lsquo;{name}&rsquo; 시트에는 데이터가 없습니다. 왼쪽 목록에서 다른 시트를 선택해보세요.
        </p>
      </div>
    </div>
  )
}
