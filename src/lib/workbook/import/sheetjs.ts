/**
 * SheetJS -> SheetPage conversion.
 *
 * This module is only ever imported from the parse worker. Two reasons:
 * the SheetJS bundle is large and stays out of the main chunk, and parsing an
 * untrusted spreadsheet happens in a throwaway realm rather than the realm the
 * UI runs in.
 */
import * as XLSX from 'xlsx'
import {
  cellKey,
  createEmptySheet,
  randomId,
  type Cell,
  type CellRange,
  type CellType,
  type Sheet,
  type Workbook,
  type WorkbookSourceType,
} from '../model'

export interface ConvertOptions {
  fileName: string
  sourceType: WorkbookSourceType
  /** Called between sheets so the worker can post progress to the UI. */
  onSheet?: (index: number, total: number, name: string) => void
}

/** Cells beyond this per sheet are dropped rather than locking up the browser. */
export const MAX_CELLS_PER_SHEET = 400_000

export type WorkbookParseErrorCode = 'unsupported' | 'corrupt' | 'empty' | 'too-large'

export class WorkbookParseError extends Error {
  readonly code: WorkbookParseErrorCode

  constructor(message: string, code: WorkbookParseErrorCode) {
    super(message)
    this.name = 'WorkbookParseError'
    this.code = code
  }
}

function readWorkbook(data: ArrayBuffer, sourceType: WorkbookSourceType): XLSX.WorkBook {
  const common = {
    // Keep dates as serial numbers so `v` stays JSON-safe and the number
    // format in `z` still round-trips to Excel exactly as it arrived.
    cellDates: false,
    cellFormula: true,
    cellNF: true,
    cellText: true,
    // SheetJS only parses the <cols> element when style parsing is on, so
    // without this the file's own column widths are silently discarded. The
    // extra work is why parsing runs in a worker.
    cellStyles: true,
    // A formula whose result was never cached is written as <f> with no <v>,
    // and SheetJS drops those unless stubs are kept. That is exactly the shape
    // SheetPage itself exports, so without this a second round trip would lose
    // every formula the user typed here.
    sheetStubs: true,
  } as const

  if (sourceType === 'csv') {
    return XLSX.read(decodeText(data), { type: 'string', ...common })
  }
  return XLSX.read(new Uint8Array(data), { type: 'array', ...common })
}

/**
 * Decode a delimited-text file. Korean CSV exports are still commonly CP949,
 * so a UTF-8 decode that produces replacement characters falls back to EUC-KR.
 */
function decodeText(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  if (!utf8.includes('�')) return utf8
  try {
    const legacy = new TextDecoder('euc-kr').decode(bytes)
    if (!legacy.includes('�')) return legacy
  } catch {
    // TextDecoder without the legacy encoding — keep the UTF-8 attempt.
  }
  return utf8
}

export function convertArrayBuffer(data: ArrayBuffer, options: ConvertOptions): Workbook {
  let raw: XLSX.WorkBook
  try {
    raw = readWorkbook(data, options.sourceType)
  } catch (error) {
    throw new WorkbookParseError(
      error instanceof Error ? error.message : '파일을 읽을 수 없습니다.',
      'corrupt',
    )
  }

  const names = raw.SheetNames ?? []
  if (names.length === 0) {
    throw new WorkbookParseError('시트가 하나도 없는 파일입니다.', 'empty')
  }

  const sheets: Sheet[] = []
  names.forEach((name, index) => {
    options.onSheet?.(index, names.length, name)
    const ws = raw.Sheets[name]
    const hidden = raw.Workbook?.Sheets?.[index]?.Hidden
    sheets.push(convertSheet(ws, name, hidden === 1 || hidden === 2, raw))
  })

  return {
    id: randomId(),
    title: stripExtension(options.fileName),
    sourceType: options.sourceType,
    sourceName: options.fileName,
    createdAt: new Date().toISOString(),
    sheets,
  }
}

function convertSheet(
  ws: XLSX.WorkSheet | undefined,
  name: string,
  hidden: boolean,
  raw: XLSX.WorkBook,
): Sheet {
  const sheet = createEmptySheet(name, randomId(6))
  sheet.metadata.hidden = hidden || undefined
  if (!ws) return sheet

  const palette = new Palette()
  const cells: Record<string, Cell> = {}
  let maxR = -1
  let maxC = -1
  let kept = 0

  // Walk the cells SheetJS actually stored rather than the declared `!ref`.
  // A sheet whose range claims a million rows still costs only its real cells.
  for (const key in ws) {
    if (key.charCodeAt(0) === 33 /* '!' */) continue
    if (!Object.hasOwn(ws, key)) continue
    if (kept >= MAX_CELLS_PER_SHEET) break

    const address = XLSX.utils.decode_cell(key)
    if (!Number.isFinite(address.r) || !Number.isFinite(address.c)) continue

    const converted = convertCell(ws[key] as XLSX.CellObject, palette)
    if (!converted) continue

    cells[cellKey(address.r, address.c)] = converted
    if (address.r > maxR) maxR = address.r
    if (address.c > maxC) maxC = address.c
    kept++
  }

  const merges: CellRange[] = (ws['!merges'] ?? []).map((m) => ({
    s: { r: m.s.r, c: m.s.c },
    e: { r: m.e.r, c: m.e.c },
  }))
  for (const m of merges) {
    if (m.e.r > maxR) maxR = m.e.r
    if (m.e.c > maxC) maxC = m.e.c
  }

  sheet.cells = cells
  sheet.merges = merges
  sheet.rows = maxR + 1
  sheet.cols = maxC + 1

  const cols = ws['!cols']
  if (cols?.length) {
    sheet.metadata.colWidths = cols.map((col) => col?.wch ?? col?.width ?? 0)
    const colFills = cols.map((col) => palette.index(columnFill(col, raw)))
    if (colFills.some((index) => index !== null)) sheet.metadata.colFills = colFills
  }

  const frozen = ws['!freeze']
  if (typeof frozen === 'string') {
    try {
      const at = XLSX.utils.decode_cell(frozen)
      sheet.metadata.frozen = { r: at.r, c: at.c }
    } catch {
      // A malformed freeze reference is not worth failing the import over.
    }
  }

  if (palette.colours.length > 0) sheet.fills = palette.colours

  return sheet
}

function convertCell(source: XLSX.CellObject | undefined, palette: Palette): Cell | undefined {
  if (!source) return undefined

  const rawType = source.t as string | undefined
  const formula = typeof source.f === 'string' && source.f !== '' ? source.f : undefined

  // `z` is SheetJS's stub type. Its `v` is a placeholder, not data, so the cell
  // is worth keeping only for the formula it carries.
  const isStub = rawType === 'z'

  let value: Cell['v'] = null
  if (!isStub) {
    if (source.v instanceof Date) value = source.v.toISOString()
    else if (
      typeof source.v === 'string' ||
      typeof source.v === 'number' ||
      typeof source.v === 'boolean'
    ) {
      value = source.v
    }
  }

  const bg = palette.index(solidFill(source.s))

  // An empty cell that carries a fill is not nothing: it is a coloured band in
  // a table, part of how the sheet reads. It is kept for the colour alone.
  if (value === null && !formula && bg === null) return undefined

  const cell: Cell = { v: value }
  if (bg !== null) cell.bg = bg
  if (formula) cell.f = formula
  if (rawType && !isStub) cell.t = rawType as CellType
  else if (formula) cell.t = 'n'
  // Style parsing tags every cell "General"; storing that on each of them would
  // bloat the model and the share snapshot for no gain.
  if (typeof source.z === 'string' && source.z !== 'General') cell.z = source.z
  if (!isStub && typeof source.w === 'string' && source.w !== '') cell.w = source.w
  return cell
}

function stripExtension(fileName: string): string {
  const trimmed = fileName.replace(/\.[^./\\]+$/, '')
  return trimmed || fileName || '제목 없는 Workbook'
}

/* ------------------------------------------------------------------ */
/* Fills                                                              */
/* ------------------------------------------------------------------ */

/**
 * The colours one sheet uses, interned.
 *
 * A shaded table paints the same few colours over thousands of cells, so cells
 * store an index and the sheet stores the list. The cap is there so a file that
 * gives every cell its own shade cannot turn the palette into a second copy of
 * the sheet.
 */
const MAX_FILLS_PER_SHEET = 256

class Palette {
  readonly colours: string[] = []
  private readonly seen = new Map<string, number>()

  index(hex: string | undefined): number | null {
    if (!hex) return null
    const known = this.seen.get(hex)
    if (known !== undefined) return known
    if (this.colours.length >= MAX_FILLS_PER_SHEET) return null
    const next = this.colours.push(hex) - 1
    this.seen.set(hex, next)
    return next
  }
}

interface SheetJsFill {
  patternType?: string
  fgColor?: { rgb?: string; theme?: number; tint?: number }
}

/**
 * `#rrggbb` for a solid fill, or nothing.
 *
 * SheetJS resolves a theme colour and its tint into `rgb` for us, so both a
 * hand-picked colour and one of Excel's theme shades arrive the same way. The
 * one form it drops is the legacy `indexed` palette, which it hands back as an
 * empty colour — those cells stay uncoloured rather than being guessed at.
 */
function solidFill(style: unknown): string | undefined {
  const fill = style as SheetJsFill | undefined
  if (!fill || fill.patternType !== 'solid') return undefined
  const rgb = fill.fgColor?.rgb
  if (typeof rgb !== 'string') return undefined

  // Excel writes ARGB; the alpha is always opaque in a fill and is dropped.
  const hex = (rgb.length === 8 ? rgb.slice(2) : rgb).toLowerCase()
  if (!/^[0-9a-f]{6}$/.test(hex)) return undefined
  // White is the grid's own background — recording it would grow the model
  // without changing a single pixel.
  if (hex === 'ffffff') return undefined
  return `#${hex}`
}

interface SheetJsStyles {
  CellXf?: { fillId?: number }[]
  Fills?: unknown[]
}

/** The fill a `<col>` applies to its whole column, resolved through cellXfs. */
function columnFill(col: XLSX.ColInfo | undefined, raw: XLSX.WorkBook): string | undefined {
  const style = (col as { style?: string | number } | undefined)?.style
  if (style == null) return undefined
  const styles = (raw as { Styles?: SheetJsStyles }).Styles
  const fillId = styles?.CellXf?.[Number(style)]?.fillId
  if (fillId == null) return undefined
  return solidFill(styles?.Fills?.[fillId])
}
