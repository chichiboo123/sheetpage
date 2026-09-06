/**
 * SheetPage's internal Workbook model.
 *
 * Every import path (xlsx, xls, csv, Google Sheets, a shared snapshot) converts
 * into this one shape, and every consumer — the viewer, the editor, the xlsx
 * exporter, the share storage — reads only this shape. Nothing downstream of an
 * importer needs to know where the data came from.
 *
 * The model is plain JSON so it can be posted to the share function and stored
 * as-is, with no serialisation step in between.
 */

export type CellValue = string | number | boolean | null

/** SheetJS-compatible cell type tag: number, string, boolean, date, error. */
export type CellType = 'n' | 's' | 'b' | 'd' | 'e'

export interface Cell {
  /** The typed value. `null` for a formula whose cached result is unknown. */
  v: CellValue
  /** Formula source without the leading `=`, preserved verbatim from the file. */
  f?: string
  /** Value type, kept so numbers stay numbers on the round trip. */
  t?: CellType
  /** Number format string (e.g. `0.00%`), preserved for export. */
  z?: string
  /** Pre-formatted text as the source rendered it. Used for display only. */
  w?: string
  /**
   * Index into `Sheet.fills` — the background colour the source painted on this
   * cell. Stored as an index rather than a colour because a shaded table repeats
   * the same handful of colours across thousands of cells.
   */
  bg?: number
}

export interface CellRange {
  s: { r: number; c: number }
  e: { r: number; c: number }
}

export interface SheetMetadata {
  /** Column widths in character units, as reported by the source file. */
  colWidths?: number[]
  /** Frozen pane origin, used as a hint for sticky headers. */
  frozen?: { r: number; c: number }
  /** True when the source marked the sheet hidden. Still navigable here. */
  hidden?: boolean
  /**
   * Emoji the user picked for this sheet. SheetPage's own layer: a .xlsx has
   * nowhere to put it, so the exporter ignores it, while the session store and
   * share snapshots carry it because they keep the whole model.
   */
  icon?: string
  /**
   * Background fill index per column, for a column the file colours as a whole
   * rather than cell by cell. `null` where the column carries no fill.
   */
  colFills?: (number | null)[]
}

export interface Sheet {
  sheetId: string
  sheetName: string
  /** Row count of the used range. */
  rows: number
  /** Column count of the used range. */
  cols: number
  /** Sparse cell map keyed by `cellKey(r, c)`. Absent key means an empty cell. */
  cells: Record<string, Cell>
  merges: CellRange[]
  metadata: SheetMetadata
  /**
   * The distinct background colours this sheet uses, as `#rrggbb`. Cells and
   * columns point in by index; absent when the sheet has no colouring at all.
   */
  fills?: string[]
}

export type WorkbookSourceType = 'xlsx' | 'xls' | 'csv' | 'google-sheets' | 'shared'

export interface Workbook {
  id: string
  title: string
  sourceType: WorkbookSourceType
  /** Original file name or Google Sheets URL, shown in the toolbar. */
  sourceName?: string
  createdAt: string
  sheets: Sheet[]
}

/* ------------------------------------------------------------------ */
/* Cell addressing                                                     */
/* ------------------------------------------------------------------ */

/** Sparse-map key for a cell. Kept short — a big sheet stores many of these. */
export function cellKey(r: number, c: number): string {
  return `${r}:${c}`
}

export function parseCellKey(key: string): { r: number; c: number } {
  const [r, c] = key.split(':')
  return { r: Number(r), c: Number(c) }
}

/** 0 -> A, 25 -> Z, 26 -> AA */
export function columnLabel(c: number): string {
  let label = ''
  let n = c
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

/** `A1` style address, for tooltips and the value bar. */
export function cellAddress(r: number, c: number): string {
  return `${columnLabel(c)}${r + 1}`
}

export function getCell(sheet: Sheet, r: number, c: number): Cell | undefined {
  return sheet.cells[cellKey(r, c)]
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

/** What the grid renders for a cell. Prefers the source's formatted text. */
export function displayValue(cell: Cell | undefined): string {
  if (!cell) return ''
  if (cell.w != null && cell.w !== '') return cell.w
  const { v } = cell
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

/** What an editor should show — the formula when there is one, else the value. */
export function editValue(cell: Cell | undefined): string {
  if (!cell) return ''
  if (cell.f) return `=${cell.f}`
  const { v } = cell
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

export function isNumericCell(cell: Cell | undefined): boolean {
  return cell?.t === 'n' || typeof cell?.v === 'number'
}

/* ------------------------------------------------------------------ */
/* Fills                                                              */
/* ------------------------------------------------------------------ */

/**
 * The background colour to paint behind a cell, or nothing when the source
 * left it plain.
 *
 * A column-level fill only reaches the gaps: a position the file has no cell
 * for at all. Where a cell exists, its own fill is the answer even when that
 * answer is "none" — colouring a column in Excel stamps the colour onto the
 * cells as well, so a cell that arrives without one was deliberately left
 * plain, and inheriting the column's colour there would paint over the author.
 */
export function fillAt(sheet: Sheet, cell: Cell | undefined, c: number): string | undefined {
  const palette = sheet.fills
  if (!palette || palette.length === 0) return undefined
  const index = cell ? (cell.bg ?? null) : (sheet.metadata.colFills?.[c] ?? null)
  return index == null ? undefined : palette[index]
}

/**
 * Text colour that stays readable on `hex`, or nothing when the cell's normal
 * ink already works. A dark header fill is common enough — a green or navy
 * title row — that leaving near-black text on it would make the row unreadable.
 */
export function inkOn(hex: string | undefined): string | undefined {
  if (!hex) return undefined
  const n = Number.parseInt(hex.slice(1), 16)
  if (!Number.isFinite(n)) return undefined
  // Rec. 601 luma is close enough for a legibility switch and needs no gamma.
  const luma = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 255000
  return luma < 0.55 ? '#ffffff' : undefined
}

/**
 * Turn raw editor text back into a cell. A leading `=` is stored as a formula
 * with no cached value, which makes Excel recalculate it when the file is
 * reopened. Everything else is typed as number, boolean or string.
 */
export function cellFromInput(input: string, previous?: Cell): Cell | undefined {
  const text = input.trim()
  if (text === '') return undefined

  if (text.startsWith('=') && text.length > 1) {
    return { v: null, f: text.slice(1), t: 'n', z: previous?.z }
  }

  const upper = text.toUpperCase()
  if (upper === 'TRUE' || upper === 'FALSE') {
    return { v: upper === 'TRUE', t: 'b', z: previous?.z }
  }

  // Only treat it as a number when the whole string is one — "1-2" stays text.
  if (/^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) {
    const n = Number(text)
    if (Number.isFinite(n)) return { v: n, t: 'n', z: previous?.z }
  }

  return { v: input, t: 's', z: previous?.z }
}

/* ------------------------------------------------------------------ */
/* Merges                                                              */
/* ------------------------------------------------------------------ */

export interface MergeLookup {
  /** Anchor cell key -> the range it spans. */
  anchors: Map<string, CellRange>
  /** Any covered (non-anchor) cell key -> the anchor's key. */
  covered: Map<string, string>
}

export function buildMergeLookup(sheet: Sheet): MergeLookup {
  const anchors = new Map<string, CellRange>()
  const covered = new Map<string, string>()
  for (const range of sheet.merges) {
    const anchor = cellKey(range.s.r, range.s.c)
    anchors.set(anchor, range)
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (r === range.s.r && c === range.s.c) continue
        covered.set(cellKey(r, c), anchor)
      }
    }
  }
  return { anchors, covered }
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                       */
/* ------------------------------------------------------------------ */

export function isSheetEmpty(sheet: Sheet): boolean {
  return Object.keys(sheet.cells).length === 0
}

export function countCells(workbook: Workbook): number {
  return workbook.sheets.reduce((sum, s) => sum + Object.keys(s.cells).length, 0)
}

/**
 * Decide whether row 0 reads as a header: mostly non-empty, mostly text, and
 * followed by at least one more row. Drives the sticky header styling and the
 * reader view; it never changes the stored data.
 */
export function detectHeaderRow(sheet: Sheet): boolean {
  if (sheet.rows < 2 || sheet.cols === 0) return false
  let filled = 0
  let textual = 0
  for (let c = 0; c < sheet.cols; c++) {
    const cell = getCell(sheet, 0, c)
    if (!cell || displayValue(cell) === '') continue
    filled++
    if (!isNumericCell(cell)) textual++
  }
  if (filled < Math.max(2, Math.ceil(sheet.cols * 0.5))) return false
  return textual / filled >= 0.7
}

/**
 * Column names from the header row, for the overview's chips.
 *
 * Returns nothing when no header row was detected — inventing labels like "A"
 * and "B" would fill the card with noise that says nothing about the sheet.
 */
export function columnNames(
  sheet: Sheet,
  headerRow: boolean,
  limit = 4,
): { names: string[]; extra: number } {
  if (!headerRow) return { names: [], extra: 0 }

  // A cell merged across several columns on the header row is a document title
  // ("2026학년도 평가계획"), not a column name. Listing it as one would put the
  // sheet's title in the middle of its column tags.
  const spanning = new Set<number>()
  for (const range of sheet.merges) {
    if (range.s.r !== 0 || range.e.c === range.s.c) continue
    for (let c = range.s.c; c <= range.e.c; c++) spanning.add(c)
  }

  const all: string[] = []
  for (let c = 0; c < sheet.cols; c++) {
    if (spanning.has(c)) continue
    const label = displayValue(getCell(sheet, 0, c)).trim()
    if (label !== '') all.push(label)
  }
  return { names: all.slice(0, limit), extra: Math.max(0, all.length - limit) }
}

/** Roughly how much of the first data row fits on a card's summary line. */
const SUMMARY_BUDGET = 44

/** A one-line taste of the sheet's contents, taken from its first data row. */
export function sheetSummary(sheet: Sheet, headerRow: boolean): string {
  const row = headerRow ? 1 : 0
  if (row >= sheet.rows) return ''

  const parts: string[] = []
  let length = 0
  for (let c = 0; c < sheet.cols && length < SUMMARY_BUDGET; c++) {
    const text = displayValue(getCell(sheet, row, c)).trim()
    if (text === '') continue
    parts.push(text)
    length += text.length + 3
  }
  return parts.join(' · ')
}

export function createEmptySheet(name: string, id: string): Sheet {
  return {
    sheetId: id,
    sheetName: name,
    rows: 0,
    cols: 0,
    cells: {},
    merges: [],
    metadata: {},
  }
}

/** Collision-resistant id used for sheets and workbooks. */
export function randomId(bytes = 8): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}
