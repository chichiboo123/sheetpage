import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  buildMergeLookup,
  cellAddress,
  cellKey,
  columnLabel,
  displayValue,
  editValue,
  fillAt,
  getCell,
  inkOn,
  isNumericCell,
  type Sheet,
} from '@/lib/workbook/model'
import {
  columnAt,
  computeGeometry,
  frozenRowCount,
  HEADER_HEIGHT,
  MAX_RESIZED_WIDTH,
  MIN_RESIZED_WIDTH,
  ROW_HEADER_WIDTH,
  ROW_HEIGHT,
} from '@/lib/workbook/grid-geometry'

/** Extra rows/columns rendered outside the viewport to cover fast scrolling. */
const ROW_OVERSCAN = 8
const COL_OVERSCAN = 3

export interface CellPosition {
  r: number
  c: number
}

interface SheetGridProps {
  sheet: Sheet
  readOnly: boolean
  headerRow: boolean
  selection: CellPosition | null
  onSelect: (position: CellPosition) => void
  onCommit: (r: number, c: number, input: string) => void
}

/**
 * The spreadsheet surface.
 *
 * Frozen header and row-number strips are separate scroll-synced layers rather
 * than sticky cells, which keeps them correct while the body is windowed. Only
 * the cells inside the viewport (plus a small overscan) exist in the DOM, so a
 * sheet with tens of thousands of rows costs the same as a short one.
 */
export function SheetGrid({
  sheet,
  readOnly,
  headerRow,
  selection,
  onSelect,
  onCommit,
}: SheetGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ top: 0, left: 0 })
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [editing, setEditing] = useState<{ r: number; c: number; draft: string } | null>(null)
  const [widths, setWidths] = useState<Record<number, number>>({})

  // Column widths depend on the sheet's shape, not on its current values, so an
  // edit must not force the whole geometry to be measured again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => computeGeometry(sheet, widths), [sheet.sheetId, sheet.cols, sheet.rows, widths])

  const frozenRows = useMemo(() => frozenRowCount(sheet, headerRow), [sheet, headerRow])
  const merges = useMemo(() => buildMergeLookup(sheet), [sheet.merges]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(node)
    setViewport({ width: node.clientWidth, height: node.clientHeight })
    return () => observer.disconnect()
  }, [])

  const handleScroll = useCallback(() => {
    const node = scrollerRef.current
    if (!node) return
    setScroll({ top: node.scrollTop, left: node.scrollLeft })
  }, [])

  const win = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT) - ROW_OVERSCAN)
    const endRow = Math.min(
      sheet.rows - 1,
      Math.ceil((scroll.top + Math.max(viewport.height, 1)) / ROW_HEIGHT) + ROW_OVERSCAN,
    )
    const startCol = Math.max(0, columnAt(geometry.colOffsets, scroll.left) - COL_OVERSCAN)
    const endCol = Math.min(
      sheet.cols - 1,
      columnAt(geometry.colOffsets, scroll.left + Math.max(viewport.width, 1)) + COL_OVERSCAN,
    )
    return { startRow, endRow, startCol, endCol }
  }, [scroll, viewport, geometry, sheet.rows, sheet.cols])

  const startResize = useCallback(
    (column: number, event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const startX = event.clientX
      const startWidth = geometry.colWidths[column] ?? 0

      const onMove = (move: MouseEvent) => {
        const next = Math.round(
          Math.min(
            MAX_RESIZED_WIDTH,
            Math.max(MIN_RESIZED_WIDTH, startWidth + (move.clientX - startX)),
          ),
        )
        setWidths((current) => (current[column] === next ? current : { ...current, [column]: next }))
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [geometry.colWidths],
  )

  /** Double-clicking the handle gives the column its computed width back. */
  const resetWidth = useCallback((column: number) => {
    setWidths((current) => {
      if (!(column in current)) return current
      const next = { ...current }
      delete next[column]
      return next
    })
  }, [])

  const scrollIntoView = useCallback(
    (r: number, c: number) => {
      const node = scrollerRef.current
      if (!node) return
      const top = r * ROW_HEIGHT
      const left = geometry.colOffsets[c] ?? 0
      const width = geometry.colWidths[c] ?? 0

      if (top < node.scrollTop) node.scrollTop = top
      else if (top + ROW_HEIGHT > node.scrollTop + node.clientHeight) {
        node.scrollTop = top + ROW_HEIGHT - node.clientHeight
      }
      if (left < node.scrollLeft) node.scrollLeft = left
      else if (left + width > node.scrollLeft + node.clientWidth) {
        node.scrollLeft = left + width - node.clientWidth
      }
    },
    [geometry],
  )

  const move = useCallback(
    (dr: number, dc: number) => {
      if (!selection) return
      const r = Math.min(Math.max(0, selection.r + dr), Math.max(0, sheet.rows - 1))
      const c = Math.min(Math.max(0, selection.c + dc), Math.max(0, sheet.cols - 1))
      onSelect({ r, c })
      scrollIntoView(r, c)
    },
    [selection, sheet.rows, sheet.cols, onSelect, scrollIntoView],
  )

  const beginEdit = useCallback(
    (r: number, c: number, seed?: string) => {
      if (readOnly) return
      setEditing({ r, c, draft: seed ?? editValue(getCell(sheet, r, c)) })
    },
    [readOnly, sheet],
  )

  const commitEdit = useCallback(
    (advance: 'down' | 'right' | 'none') => {
      // Committing notifies the parent store, so it has to happen in the event
      // handler itself — never inside a setState updater, which React may call
      // while another component is rendering.
      if (!editing) return
      const { r, c, draft } = editing
      setEditing(null)
      onCommit(r, c, draft)

      if (advance === 'down') {
        const next = Math.min(r + 1, Math.max(0, sheet.rows - 1))
        onSelect({ r: next, c })
        scrollIntoView(next, c)
      } else if (advance === 'right') {
        const next = Math.min(c + 1, Math.max(0, sheet.cols - 1))
        onSelect({ r, c: next })
        scrollIntoView(r, next)
      }
      frameRef.current?.focus({ preventScroll: true })
    },
    [editing, onCommit, onSelect, scrollIntoView, sheet.rows, sheet.cols],
  )

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editing || !selection) return
      const { key } = event

      const nav: Record<string, [number, number]> = {
        ArrowDown: [1, 0],
        ArrowUp: [-1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }
      if (nav[key]) {
        event.preventDefault()
        move(nav[key][0], nav[key][1])
        return
      }
      if (key === 'Tab') {
        event.preventDefault()
        move(0, event.shiftKey ? -1 : 1)
        return
      }
      if (key === 'PageDown' || key === 'PageUp') {
        event.preventDefault()
        const page = Math.max(1, Math.floor(viewport.height / ROW_HEIGHT) - 1)
        move(key === 'PageDown' ? page : -page, 0)
        return
      }
      if (key === 'Home') {
        event.preventDefault()
        onSelect({ r: selection.r, c: 0 })
        scrollIntoView(selection.r, 0)
        return
      }
      if (readOnly) return

      if (key === 'Enter' || key === 'F2') {
        event.preventDefault()
        beginEdit(selection.r, selection.c)
        return
      }
      if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault()
        onCommit(selection.r, selection.c, '')
        return
      }
      // A printable key starts an edit seeded with that character, as in Excel.
      if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        beginEdit(selection.r, selection.c, key)
      }
    },
    [
      editing,
      selection,
      move,
      viewport.height,
      readOnly,
      beginEdit,
      onCommit,
      onSelect,
      scrollIntoView,
    ],
  )

  /**
   * Merged ranges render as their own layer. A merge whose anchor has scrolled
   * past the top of the window still covers visible rows, so it is drawn from
   * the range rather than from the row loop.
   */
  const visibleMerges = useMemo(() => {
    const result: { key: string; r: number; c: number; width: number; height: number }[] = []
    for (const [key, range] of merges.anchors) {
      if (range.e.r < win.startRow || range.s.r > win.endRow) continue
      if (range.e.c < win.startCol || range.s.c > win.endCol) continue
      const left = geometry.colOffsets[range.s.c] ?? 0
      const right = geometry.colOffsets[Math.min(range.e.c + 1, sheet.cols)] ?? left
      result.push({
        key,
        r: range.s.r,
        c: range.s.c,
        width: Math.max(right - left, geometry.colWidths[range.s.c] ?? 0),
        height: (range.e.r - range.s.r + 1) * ROW_HEIGHT,
      })
    }
    return result
  }, [merges, win, geometry, sheet.cols])

  const cells = useMemo(() => {
    const nodes: {
      r: number
      c: number
      text: string
      numeric: boolean
      formula: boolean
      fill?: string
      ink?: string
    }[] = []
    for (let r = win.startRow; r <= win.endRow; r++) {
      for (let c = win.startCol; c <= win.endCol; c++) {
        const key = cellKey(r, c)
        if (merges.covered.has(key) || merges.anchors.has(key)) continue
        const cell = sheet.cells[key]
        const fill = fillAt(sheet, cell, c)
        nodes.push({
          r,
          c,
          text: displayValue(cell),
          numeric: isNumericCell(cell),
          formula: Boolean(cell?.f),
          fill,
          ink: inkOn(fill),
        })
      }
    }
    return nodes
  }, [win, sheet, merges])

  const selectionBox = useMemo(() => {
    if (!selection) return null
    const anchorKey = merges.covered.get(cellKey(selection.r, selection.c))
    const range = anchorKey
      ? merges.anchors.get(anchorKey)
      : merges.anchors.get(cellKey(selection.r, selection.c))

    const s = range ? range.s : selection
    const e = range ? range.e : selection
    const left = geometry.colOffsets[s.c] ?? 0
    const right = geometry.colOffsets[Math.min(e.c + 1, sheet.cols)] ?? left
    return {
      left,
      top: s.r * ROW_HEIGHT,
      width: Math.max(right - left, geometry.colWidths[s.c] ?? 0),
      height: (e.r - s.r + 1) * ROW_HEIGHT,
    }
  }, [selection, merges, geometry, sheet.cols])

  return (
    <div
      ref={frameRef}
      tabIndex={0}
      role="grid"
      aria-label={`${sheet.sheetName} 시트`}
      aria-rowcount={sheet.rows}
      aria-colcount={sheet.cols}
      aria-readonly={readOnly || undefined}
      onKeyDown={onKeyDown}
      className="relative min-h-0 flex-1 bg-white focus:outline-none"
    >
      <div
        className="absolute left-0 top-0 z-30 border-b border-r border-ink-200 bg-ink-50"
        style={{ width: ROW_HEADER_WIDTH, height: HEADER_HEIGHT }}
      />

      <div
        className="absolute top-0 z-20 overflow-hidden border-b border-ink-200 bg-ink-50"
        style={{ left: ROW_HEADER_WIDTH, right: 0, height: HEADER_HEIGHT }}
      >
        <div
          className="relative h-full"
          style={{ width: geometry.totalWidth, transform: `translateX(${-scroll.left}px)` }}
        >
          {range(win.startCol, win.endCol).map((c) => (
            <div
              key={c}
              className={`absolute top-0 flex h-full items-center justify-center border-r border-ink-200 text-2xs font-medium ${
                selection?.c === c ? 'bg-brand-100 text-brand-800' : 'text-ink-500'
              }`}
              style={{ left: geometry.colOffsets[c], width: geometry.colWidths[c] }}
            >
              {columnLabel(c)}
              <span
                role="separator"
                aria-orientation="vertical"
                aria-label={`${columnLabel(c)}열 너비 조절`}
                onMouseDown={(event) => startResize(c, event)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  resetWidth(c)
                }}
                title="드래그해서 열 너비 조절 · 더블클릭하면 원래 너비로"
                className="absolute right-0 top-0 z-10 h-full w-[7px] translate-x-[3px] cursor-col-resize hover:bg-brand-400/60"
              />
            </div>
          ))}
        </div>
      </div>

      <div
        className="absolute left-0 z-20 overflow-hidden border-r border-ink-200 bg-ink-50"
        style={{ top: HEADER_HEIGHT, bottom: 0, width: ROW_HEADER_WIDTH }}
      >
        <div
          className="relative"
          style={{ height: geometry.totalHeight, transform: `translateY(${-scroll.top}px)` }}
        >
          {range(win.startRow, win.endRow).map((r) => (
            <div
              key={r}
              className={`absolute left-0 flex w-full items-center justify-end border-b border-ink-200 pr-2 text-2xs tabular-nums ${
                selection?.r === r ? 'bg-brand-100 font-medium text-brand-800' : 'text-ink-400'
              }`}
              style={{ top: r * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              {r + 1}
            </div>
          ))}
        </div>

        {/* The gutter numbers for the pinned rows, so a frozen row 1 is not
            labelled with whatever row happens to be scrolled underneath it. */}
        {frozenRows > 0 && scroll.top > 0 && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 border-b border-ink-300 bg-ink-50"
            style={{ height: frozenRows * ROW_HEIGHT }}
          >
            {range(0, frozenRows - 1).map((r) => (
              <div
                key={r}
                className="absolute left-0 flex w-full items-center justify-end border-b border-ink-200 pr-2 text-2xs tabular-nums text-ink-400"
                style={{ top: r * ROW_HEIGHT, height: ROW_HEIGHT }}
              >
                {r + 1}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* The pinned heading rows. Purely a reading aid — it is not interactive,
          so selecting or editing always happens on the real row underneath and
          there is no second copy of a cell to keep in sync. */}
      {frozenRows > 0 && scroll.top > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-[18] overflow-hidden border-b border-ink-300 bg-white"
          style={{
            left: ROW_HEADER_WIDTH,
            right: 0,
            top: HEADER_HEIGHT,
            height: frozenRows * ROW_HEIGHT,
          }}
        >
          <div
            className="relative h-full"
            style={{ width: geometry.totalWidth, transform: `translateX(${-scroll.left}px)` }}
          >
            {range(win.startCol, win.endCol).map((c) =>
              range(0, frozenRows - 1).map((r) => {
                const cell = getCell(sheet, r, c)
                const fill = fillAt(sheet, cell, c)
                return (
                  <div
                    key={`${r}:${c}`}
                    className={`absolute flex items-center overflow-hidden border-b border-r border-ink-200 px-2 text-[13px] leading-tight ${
                      headerRow && r === 0 ? 'bg-ink-50 font-semibold text-ink-900' : 'bg-white text-ink-800'
                    } ${isNumericCell(cell) ? 'justify-end tabular-nums' : ''}`}
                    style={{
                      left: geometry.colOffsets[c],
                      top: r * ROW_HEIGHT,
                      width: geometry.colWidths[c],
                      height: ROW_HEIGHT,
                      backgroundColor: fill,
                      color: inkOn(fill),
                    }}
                  >
                    <span className="truncate">{displayValue(cell)}</span>
                  </div>
                )
              }),
            )}
          </div>
        </div>
      )}

      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="thin-scrollbar absolute bottom-0 right-0 overflow-auto"
        style={{ left: ROW_HEADER_WIDTH, top: HEADER_HEIGHT }}
      >
        <div
          className="relative"
          style={{ width: geometry.totalWidth, height: geometry.totalHeight }}
        >
          {cells.map((cell) => (
            <GridCell
              key={`${cell.r}:${cell.c}`}
              r={cell.r}
              c={cell.c}
              text={cell.text}
              numeric={cell.numeric}
              formula={cell.formula}
              fill={cell.fill}
              ink={cell.ink}
              isHeader={headerRow && cell.r === 0}
              selected={selection?.r === cell.r && selection?.c === cell.c}
              left={geometry.colOffsets[cell.c]}
              width={geometry.colWidths[cell.c]}
              onSelect={onSelect}
              onEdit={beginEdit}
            />
          ))}

          {visibleMerges.map((merge) => {
            const cell = getCell(sheet, merge.r, merge.c)
            const fill = fillAt(sheet, cell, merge.c)
            return (
              <GridCell
                key={`m-${merge.key}`}
                r={merge.r}
                c={merge.c}
                text={displayValue(cell)}
                numeric={isNumericCell(cell)}
                formula={Boolean(cell?.f)}
                fill={fill}
                ink={inkOn(fill)}
                isHeader={headerRow && merge.r === 0}
                selected={selection?.r === merge.r && selection?.c === merge.c}
                left={geometry.colOffsets[merge.c]}
                width={merge.width}
                height={merge.height}
                merged
                onSelect={onSelect}
                onEdit={beginEdit}
              />
            )
          })}

          {selectionBox && !editing && (
            <div
              className="pointer-events-none absolute z-[15] border-2 border-brand-600"
              style={selectionBox}
            />
          )}

          {editing && (
            <CellInput
              key={`${editing.r}:${editing.c}`}
              value={editing.draft}
              label={`${cellAddress(editing.r, editing.c)} 셀 편집`}
              style={{
                left: geometry.colOffsets[editing.c],
                top: editing.r * ROW_HEIGHT,
                width: Math.max(geometry.colWidths[editing.c], 200),
                minHeight: ROW_HEIGHT,
              }}
              onChange={(draft) => setEditing((cur) => (cur ? { ...cur, draft } : cur))}
              onCommit={commitEdit}
              onCancel={() => {
                setEditing(null)
                frameRef.current?.focus({ preventScroll: true })
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function range(start: number, end: number): number[] {
  if (end < start) return []
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

interface GridCellProps {
  r: number
  c: number
  text: string
  numeric: boolean
  formula: boolean
  /** `#rrggbb` the source painted behind this cell, if any. */
  fill?: string
  /** Text colour that survives that fill; undefined keeps the normal ink. */
  ink?: string
  isHeader: boolean
  selected: boolean
  left: number
  width: number
  height?: number
  merged?: boolean
  onSelect: (position: CellPosition) => void
  onEdit: (r: number, c: number) => void
}

const GridCell = memo(function GridCell({
  r,
  c,
  text,
  numeric,
  formula,
  fill,
  ink,
  isHeader,
  selected,
  left,
  width,
  height,
  merged,
  onSelect,
  onEdit,
}: GridCellProps) {
  return (
    <div
      role="gridcell"
      aria-rowindex={r + 1}
      aria-colindex={c + 1}
      aria-selected={selected || undefined}
      title={text.length > 24 ? text : undefined}
      onMouseDown={() => onSelect({ r, c })}
      onDoubleClick={() => onEdit(r, c)}
      className={`absolute flex select-none items-center overflow-hidden border-b border-r border-ink-200 px-2 text-[13px] leading-tight transition-colors hover:bg-brand-50/60 ${
        merged ? 'z-[5] justify-center bg-white text-center' : ''
      } ${isHeader ? 'bg-ink-50 font-semibold text-ink-900' : 'text-ink-800'} ${
        numeric && !merged ? 'justify-end tabular-nums' : ''
      } ${formula ? 'text-brand-800' : ''}`}
      // The file's own colouring is a layer above the grid's defaults: an
      // inline background beats the header and merge classes below it, which is
      // the right precedence — those are SheetPage's guesses, this is the
      // author's decision.
      style={{
        left,
        top: r * ROW_HEIGHT,
        width,
        height: height ?? ROW_HEIGHT,
        backgroundColor: fill,
        color: ink,
      }}
    >
      <span className="truncate">{text}</span>
    </div>
  )
})

interface CellInputProps {
  value: string
  style: CSSProperties
  label: string
  onChange: (value: string) => void
  onCommit: (advance: 'down' | 'right' | 'none') => void
  onCancel: () => void
}

function CellInput({ value, style, label, onChange, onCommit, onCancel }: CellInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])

  return (
    <textarea
      ref={ref}
      aria-label={label}
      value={value}
      rows={1}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onCommit('none')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onCommit('down')
        } else if (event.key === 'Tab') {
          event.preventDefault()
          onCommit('right')
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className="absolute z-20 resize-none rounded-sm border-2 border-brand-600 bg-white px-2 py-[6px] text-[13px] leading-tight text-ink-900 shadow-pop focus:outline-none focus-visible:ring-0"
      style={style}
    />
  )
}
