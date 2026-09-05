import * as XLSX from 'xlsx'
import { convertArrayBuffer } from '../src/lib/workbook/import/sheetjs'
import { workbookToXlsxArrayBuffer } from '../src/lib/workbook/export/xlsx'
import {
  cellFromInput,
  cellKey,
  displayValue,
  detectHeaderRow,
  getCell,
} from '../src/lib/workbook/model'
import { extractSpreadsheetRef } from '../src/lib/google/url'

let failures = 0
function normalizeRange(range: { s: { r: number; c: number }; e: { r: number; c: number } }) {
  return { sr: range.s.r, sc: range.s.c, er: range.e.r, ec: range.e.c }
}

/** Pulls one worksheet's XML back out of a written workbook, for exact checks. */
function readSheetXml(bytes: ArrayBuffer, sheetNumber: number): string {
  const container = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' })
  const index = container.FullPaths.findIndex((path) =>
    path.endsWith(`sheet${sheetNumber}.xml`),
  )
  const content = container.FileIndex[index]?.content
  return content ? Buffer.from(content as Uint8Array).toString('utf8') : ''
}

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`)
}

// ---- 1. Build a realistic multi-sheet source file -------------------------
const overview = XLSX.utils.aoa_to_sheet([
  ['2026학년도 평가계획', null, null],
  ['항목', '담당', '비율'],
  ['지필평가', '김교사', 0.4],
  ['수행평가', '이교사', 0.6],
])
overview['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]
overview['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 8 }]
overview['C3'].z = '0%'
overview['C4'].z = '0%'

const grade1 = XLSX.utils.aoa_to_sheet([
  ['단원', '차시', '점수'],
  ['1. 수와 연산', 12, 88],
  ['2. 도형', 9, 91],
  ['합계', null, null],
])
grade1['B4'] = { t: 'n', f: 'SUM(B2:B3)', v: 21 }
grade1['C4'] = { t: 'n', f: 'AVERAGE(C2:C3)', v: 89.5 }

const empty = XLSX.utils.aoa_to_sheet([[]])

const source: XLSX.WorkBook = {
  SheetNames: ['개요', '1학년', '빈 시트'],
  Sheets: { '개요': overview, '1학년': grade1, '빈 시트': empty },
}
const sourceBytes = XLSX.write(source, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer

// ---- 2. Import -----------------------------------------------------------
const wb = convertArrayBuffer(sourceBytes, { fileName: '평가계획.xlsx', sourceType: 'xlsx' })

check('sheet count', wb.sheets.length, 3)
check('sheet names/order', wb.sheets.map((s) => s.sheetName), ['개요', '1학년', '빈 시트'])
check('title from file name', wb.title, '평가계획')

const s0 = wb.sheets[0]
check('overview dimensions', [s0.rows, s0.cols], [4, 3])
check('merge preserved', s0.merges, [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }])
check('korean text cell', getCell(s0, 2, 0)?.v, '지필평가')
check('numeric cell value', getCell(s0, 2, 2)?.v, 0.4)
check('number format kept', getCell(s0, 2, 2)?.z, '0%')
check('formatted text used for display', displayValue(getCell(s0, 2, 2)), '40%')
check('column widths kept', s0.metadata.colWidths, [18, 12, 8])
check('header row detected (row 0 is a merged title)', detectHeaderRow(s0), false)

const s1 = wb.sheets[1]
check('formula preserved', getCell(s1, 3, 1)?.f, 'SUM(B2:B3)')
check('cached formula value preserved', getCell(s1, 3, 1)?.v, 21)
check('second formula', getCell(s1, 3, 2)?.f, 'AVERAGE(C2:C3)')
check('grade1 header detected', detectHeaderRow(s1), true)

const s2 = wb.sheets[2]
check('empty sheet has no cells', Object.keys(s2.cells).length, 0)

// ---- 3. Edit like the UI does -------------------------------------------
s0.cells[cellKey(2, 1)] = cellFromInput('박교사')!
s1.cells[cellKey(1, 2)] = cellFromInput('95')!
s1.cells[cellKey(4, 0)] = cellFromInput('=SUM(C2:C3)')!   // brand new formula
s1.rows = Math.max(s1.rows, 5)

check('edited text typed as string', s0.cells[cellKey(2, 1)], { v: '박교사', t: 's' })
check('edited number typed as number', s1.cells[cellKey(1, 2)].v, 95)
check('typed formula stored without cached value', s1.cells[cellKey(4, 0)], {
  v: null,
  f: 'SUM(C2:C3)',
  t: 'n',
})

// ---- 4. Export, then re-import through SheetPage's own importer ----------
// This is the round trip that matters: a file SheetPage wrote, opened again by
// SheetPage, must still carry every value, formula, merge and width.
const outBytes = workbookToXlsxArrayBuffer(wb)
check('export produced a real file', outBytes.byteLength > 2000, true)

const back = convertArrayBuffer(outBytes, { fileName: '평가계획.xlsx', sourceType: 'xlsx' })

check('re-imported sheet order', back.sheets.map((s) => s.sheetName), ['개요', '1학년', '빈 시트'])

const b0 = back.sheets[0]
const b1 = back.sheets[1]

check('re-imported merge', b0.merges.map(normalizeRange), [
  { sr: 0, sc: 0, er: 0, ec: 2 },
])
check('re-imported edited text', getCell(b0, 2, 1)?.v, '박교사')
check('re-imported korean text', getCell(b0, 2, 0)?.v, '지필평가')
check('re-imported number', getCell(b0, 2, 2)?.v, 0.4)
check('re-imported number format', getCell(b0, 2, 2)?.z, '0%')
check('re-imported column widths', b0.metadata.colWidths, [18, 12, 8])

check('re-imported original formula', getCell(b1, 3, 1)?.f, 'SUM(B2:B3)')
check('re-imported cached value', getCell(b1, 3, 1)?.v, 21)
check('re-imported edited number', getCell(b1, 1, 2)?.v, 95)
check('re-imported user-typed formula', getCell(b1, 4, 0)?.f, 'SUM(C2:C3)')
check('user-typed formula still has no cached value', getCell(b1, 4, 0)?.v, null)

// Excel decides whether to recalculate from the absence of a cached <v>.
const sheetXml = readSheetXml(outBytes, 2)
check('formula written without a stale cached value', /<c r="A5"><f>SUM\(C2:C3\)<\/f><\/c>/.test(sheetXml), true)

// ---- 5. CSV path, including a CP949-encoded file -------------------------
const csvUtf8 = new TextEncoder().encode('이름,점수\n홍길동,90\n김철수,85\n')
const csvWb = convertArrayBuffer(csvUtf8.buffer as ArrayBuffer, {
  fileName: '성적.csv',
  sourceType: 'csv',
})
check('csv sheet count', csvWb.sheets.length, 1)
check('csv dimensions', [csvWb.sheets[0].rows, csvWb.sheets[0].cols], [3, 2])
check('csv korean value', getCell(csvWb.sheets[0], 1, 0)?.v, '홍길동')
check('csv numeric value', getCell(csvWb.sheets[0], 1, 1)?.v, 90)

// Korean CSV exports are still commonly CP949 rather than UTF-8.
const csvCp949 = new Uint8Array([
  0xc0, 0xcc, 0xb8, 0xa7, 0x2c, 0xc1, 0xa1, 0xbc, 0xf6, 0x0a, // 이름,점수
  0xc8, 0xab, 0xb1, 0xe6, 0xb5, 0xbf, 0x2c, 0x39, 0x30, 0x0a, // 홍길동,90
])
const cp949Wb = convertArrayBuffer(csvCp949.buffer as ArrayBuffer, {
  fileName: '성적_cp949.csv',
  sourceType: 'csv',
})
check('cp949 header decoded', getCell(cp949Wb.sheets[0], 0, 0)?.v, '이름')
check('cp949 value decoded', getCell(cp949Wb.sheets[0], 1, 0)?.v, '홍길동')

// ---- 6. Google Sheets link shapes ---------------------------------------
const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
check('standard edit link', extractSpreadsheetRef(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`), {
  id: ID,
  kind: 'file',
  gid: '0',
})
check('account-prefixed link', extractSpreadsheetRef(`https://docs.google.com/spreadsheets/u/2/d/${ID}/edit?usp=sharing`), {
  id: ID,
  kind: 'file',
  gid: undefined,
})
check('link with no trailing path', extractSpreadsheetRef(`https://docs.google.com/spreadsheets/d/${ID}`), {
  id: ID,
  kind: 'file',
  gid: undefined,
})
check('gid in the query string', extractSpreadsheetRef(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1893`)?.gid, '1893')
check('published-to-web link', extractSpreadsheetRef('https://docs.google.com/spreadsheets/d/e/2PACX-1vQx9abcdefghijklmnop/pubhtml')?.kind, 'published')
check('bare id', extractSpreadsheetRef(ID)?.id, ID)
check('not a spreadsheet link', extractSpreadsheetRef('https://example.com/hello'), null)
check('empty input', extractSpreadsheetRef('   '), null)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
