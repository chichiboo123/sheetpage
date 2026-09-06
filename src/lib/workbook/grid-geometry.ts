/**
 * Pixel geometry for the sheet grid.
 *
 * Row height is fixed and column widths are computed once per sheet, which is
 * what makes windowing cheap: any cell's position is arithmetic, so the grid
 * never has to measure the DOM.
 */
import { columnLabel, displayValue, getCell, type Sheet } from './model'

export const ROW_HEIGHT = 32
export const HEADER_HEIGHT = 34
export const ROW_HEADER_WIDTH = 56

const MIN_COL_WIDTH = 72
const MAX_COL_WIDTH = 420

/** Bounds for a column the user drags; wider than the automatic range. */
export const MIN_RESIZED_WIDTH = 48
export const MAX_RESIZED_WIDTH = 900

/** Frozen rows are capped so a file cannot pin away the whole viewport. */
export const MAX_FROZEN_ROWS = 3
const DEFAULT_COL_WIDTH = 128

/** Rows sampled when guessing a column width for a file that carries none. */
const SAMPLE_ROWS = 40

export interface GridGeometry {
  colWidths: number[]
  /** `colOffsets[i]` is the x position of column `i`; the array has cols+1 entries. */
  colOffsets: number[]
  totalWidth: number
  totalHeight: number
}

export function computeGeometry(
  sheet: Sheet,
  /** Widths the user set by dragging, which override the file's own. */
  overrides: Record<number, number> = {},
): GridGeometry {
  const widths: number[] = new Array(sheet.cols)
  const declared = sheet.metadata.colWidths

  for (let c = 0; c < sheet.cols; c++) {
    const override = overrides[c]
    if (override && override > 0) {
      widths[c] = override
      continue
    }
    const wch = declared?.[c]
    widths[c] =
      wch && wch > 0
        ? clamp(Math.round(wch * 7.2 + 14))
        : clamp(estimateColumnWidth(sheet, c))
  }

  const offsets: number[] = new Array(sheet.cols + 1)
  offsets[0] = 0
  for (let c = 0; c < sheet.cols; c++) offsets[c + 1] = offsets[c] + widths[c]

  return {
    colWidths: widths,
    colOffsets: offsets,
    totalWidth: offsets[sheet.cols] ?? 0,
    totalHeight: sheet.rows * ROW_HEIGHT,
  }
}

function estimateColumnWidth(sheet: Sheet, c: number): number {
  const rows = Math.min(sheet.rows, SAMPLE_ROWS)
  let longest = columnLabel(c).length
  for (let r = 0; r < rows; r++) {
    const text = displayValue(getCell(sheet, r, c))
    if (text.length > longest) longest = text.length
  }
  // Korean text is roughly twice as wide per character as the Latin average,
  // so bias the per-character estimate upward rather than under-sizing columns.
  return longest * 9 + 24
}

function clamp(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_COL_WIDTH
  return Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, width))
}

/**
 * How many leading rows stay pinned while the body scrolls.
 *
 * The file's own freeze setting wins when it has one — that is the author
 * saying which rows are headings. Otherwise a detected header row is pinned,
 * because losing the column titles after one screen of scrolling is the fastest
 * way to make a wide sheet unreadable.
 */
export function frozenRowCount(sheet: Sheet, headerRow: boolean): number {
  const declared = sheet.metadata.frozen?.r ?? 0
  const rows = declared > 0 ? declared : headerRow ? 1 : 0
  return Math.min(rows, MAX_FROZEN_ROWS, Math.max(sheet.rows - 1, 0))
}

/** First column whose span contains `x`, via binary search on the offsets. */
export function columnAt(offsets: number[], x: number): number {
  let lo = 0
  let hi = offsets.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= x) lo = mid
    else hi = mid - 1
  }
  return lo
}
