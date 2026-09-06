import { useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  columnLabel,
  displayValue,
  fillAt,
  getCell,
  inkOn,
  isNumericCell,
  type Sheet,
} from '@/lib/workbook/model'

interface SheetReaderProps {
  sheet: Sheet
  headerRow: boolean
}

/** Above this many columns a row reads better stacked than as a table row. */
const RECORD_VIEW_THRESHOLD = 8

/**
 * The "page" half of SheetPage.
 *
 * The same rows the grid shows, laid out for reading rather than for editing:
 * text wraps instead of being clipped, rows size to their content, and a wide
 * sheet becomes a stack of labelled records instead of a table nobody can read
 * without scrolling sideways. Read-only on purpose — editing lives in the grid,
 * where cell addresses are visible.
 */
export function SheetReader({ sheet, headerRow }: SheetReaderProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  const headers = useMemo(() => {
    return Array.from({ length: sheet.cols }, (_, c) => {
      const label = headerRow ? displayValue(getCell(sheet, 0, c)).trim() : ''
      return label || columnLabel(c)
    })
  }, [sheet, headerRow])

  const firstDataRow = headerRow ? 1 : 0
  const dataRowCount = Math.max(0, sheet.rows - firstDataRow)
  const asRecords = sheet.cols > RECORD_VIEW_THRESHOLD

  const virtualizer = useVirtualizer({
    count: dataRowCount,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => (asRecords ? 180 : 48),
    overscan: 6,
  })

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={scrollerRef} className="thin-scrollbar min-h-0 flex-1 overflow-auto bg-white">
      <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8">
        {!asRecords && (
          <div
            // Pinned for the same reason as in the grid: column titles that
            // scroll away make a long sheet unreadable after one screen.
            className="sticky top-0 z-10 mb-2 grid gap-x-4 border-b-2 border-ink-300 bg-white pb-2 pt-1"
            style={{ gridTemplateColumns: `repeat(${Math.max(sheet.cols, 1)}, minmax(0, 1fr))` }}
          >
            {headers.map((label, c) => (
              <div key={c} className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                {label}
              </div>
            ))}
          </div>
        )}

        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const r = firstDataRow + item.index
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                {asRecords ? (
                  <RecordRow sheet={sheet} r={r} headers={headers} index={item.index} />
                ) : (
                  <TableRow sheet={sheet} r={r} />
                )}
              </div>
            )
          })}
        </div>

        {dataRowCount === 0 && (
          <p className="py-10 text-center text-sm text-ink-500">표시할 행이 없습니다.</p>
        )}
      </div>
    </div>
  )
}

function TableRow({ sheet, r }: { sheet: Sheet; r: number }) {
  return (
    <div
      className="grid gap-x-4 border-b border-ink-200 py-2.5"
      style={{ gridTemplateColumns: `repeat(${Math.max(sheet.cols, 1)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: sheet.cols }, (_, c) => {
        const cell = getCell(sheet, r, c)
        const text = displayValue(cell)
        const fill = fillAt(sheet, cell, c)
        return (
          <div
            key={c}
            // Padded when filled so the colour reads as a band rather than as
            // text sitting on a stripe. Record mode deliberately drops fills:
            // once a row is broken into labelled fields it is no longer a table,
            // and a colour that meant "this column" no longer means anything.
            style={
              fill
                ? { backgroundColor: fill, color: inkOn(fill), padding: '2px 6px', borderRadius: 3 }
                : undefined
            }
            className={`whitespace-pre-wrap break-words text-[14px] leading-relaxed ${
              isNumericCell(cell) ? 'tabular-nums text-ink-700' : 'text-ink-800'
            }`}
          >
            {text}
          </div>
        )
      })}
    </div>
  )
}

function RecordRow({
  sheet,
  r,
  headers,
  index,
}: {
  sheet: Sheet
  r: number
  headers: string[]
  index: number
}) {
  const fields = Array.from({ length: sheet.cols }, (_, c) => ({
    label: headers[c],
    text: displayValue(getCell(sheet, r, c)),
    numeric: isNumericCell(getCell(sheet, r, c)),
  })).filter((field) => field.text !== '')

  return (
    <section className="border-b border-ink-200 py-4">
      <p className="mb-2 text-2xs font-medium tabular-nums text-ink-400">행 {index + 1}</p>
      {fields.length === 0 ? (
        <p className="text-sm text-ink-400">빈 행</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(96px,168px)_1fr]">
          {fields.map((field, i) => (
            <div key={i} className="contents">
              <dt className="pt-px text-[13px] font-medium text-ink-500">{field.label}</dt>
              <dd
                className={`whitespace-pre-wrap break-words text-[14px] leading-relaxed ${
                  field.numeric ? 'tabular-nums text-ink-700' : 'text-ink-800'
                }`}
              >
                {field.text}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
