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

export function computeGeometry(sheet: Sheet): GridGeometry {
  const widths: number[] = new Array(sheet.cols)
  const declared = sheet.metadata.colWidths

  for (let c = 0; c < sheet.cols; c++) {
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
