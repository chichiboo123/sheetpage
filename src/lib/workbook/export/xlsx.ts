/**
 * SheetPage -> .xlsx.
 *
 * Runs in the parse worker alongside the importer so SheetJS stays in a single
 * lazily loaded chunk.
 *
 * What survives the round trip: sheet names, sheet order (including an order the
 * user rearranged here), cell values and their types, number formats, formulas,
 * merged ranges and column widths. Decoration does not: fonts, borders,
 * conditional formatting, charts, images, pivot tables and macros are not in the
 * model at all, and background fills — which the model does carry, so that a
 * shaded sheet reads here the way it does in Excel — are display-only, because
 * the bundled SheetJS build writes no cell styles. Content and structure are
 * preserved exactly; appearance is not.
 */
import * as XLSX from 'xlsx'
import { parseCellKey, type Sheet, type Workbook } from '../model'

/** Excel rejects these in a sheet name, and caps the name at 31 characters. */
const ILLEGAL_SHEET_NAME = /[[\]:*?/\\]/g

export function workbookToXlsxArrayBuffer(workbook: Workbook): ArrayBuffer {
  const out: XLSX.WorkBook = {
    SheetNames: [],
    Sheets: {},
    Workbook: { Sheets: [] },
  }

  const used = new Set<string>()
  for (const sheet of workbook.sheets) {
    const name = uniqueSheetName(sheet.sheetName, used)
    out.SheetNames.push(name)
    out.Sheets[name] = buildWorksheet(sheet)
    out.Workbook!.Sheets!.push({ name, Hidden: sheet.metadata.hidden ? 1 : 0 })
  }

  const written = XLSX.write(out, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: false,
    compression: true,
  }) as ArrayBuffer

  return written
}

function buildWorksheet(sheet: Sheet): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {}

  for (const key in sheet.cells) {
    if (!Object.hasOwn(sheet.cells, key)) continue
    const cell = sheet.cells[key]
    const { r, c } = parseCellKey(key)
    const address = XLSX.utils.encode_cell({ r, c })

    const target: XLSX.CellObject = { t: 's', v: '' }

    if (cell.f) {
      target.f = cell.f
      target.t = (cell.t as XLSX.ExcelDataType) ?? 'n'
      if (cell.v == null) {
        // SheetJS emits <f> with no cached <v> when the value is absent, and
        // that is precisely what makes Excel recalculate the formula on open.
        delete (target as { v?: unknown }).v
      } else {
        target.v = cell.v
      }
    } else if (typeof cell.v === 'number') {
      target.t = 'n'
      target.v = cell.v
    } else if (typeof cell.v === 'boolean') {
      target.t = 'b'
      target.v = cell.v
    } else if (cell.v == null) {
      continue
    } else {
      target.t = 's'
      target.v = cell.v
    }

    if (cell.z) target.z = cell.z
    ws[address] = target
  }

  const lastRow = Math.max(sheet.rows - 1, 0)
  const lastCol = Math.max(sheet.cols - 1, 0)
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: lastCol } })

  if (sheet.merges.length > 0) {
    ws['!merges'] = sheet.merges.map((m) => ({
      s: { r: m.s.r, c: m.s.c },
      e: { r: m.e.r, c: m.e.c },
    }))
  }

  const widths = sheet.metadata.colWidths
  if (widths?.length) {
    ws['!cols'] = widths.map((wch) => (wch > 0 ? { wch } : {}))
  }

  return ws
}

function uniqueSheetName(name: string, used: Set<string>): string {
  let base = (name || 'Sheet').replace(ILLEGAL_SHEET_NAME, ' ').trim().slice(0, 31)
  if (base === '') base = 'Sheet'

  let candidate = base
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
    n++
  }
  used.add(candidate.toLowerCase())
  return candidate
}

/** `2026 평가계획.xlsx`, with characters a file system will accept. */
export function downloadFileName(title: string): string {
  const safe = (title || 'sheetpage').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80)
  return `${safe || 'sheetpage'}.xlsx`
}
