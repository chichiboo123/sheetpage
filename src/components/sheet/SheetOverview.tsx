import { columnLabel, displayValue, getCell, isSheetEmpty, type Sheet, type Workbook } from '@/lib/workbook/model'
import { Icon } from '@/components/ui/Icon'

interface SheetOverviewProps {
  workbook: Workbook
  onSelect: (sheetId: string) => void
}

/** Rows and columns shown in a card's peek at the sheet's contents. */
const PEEK_ROWS = 4
const PEEK_COLS = 4

/**
 * The workbook's index page.
 *
 * A file with thirty tabs hides its own shape: the sidebar tells you the sheets
 * exist but not what is in them, and opening each one to find out is exactly
 * the chore SheetPage is meant to remove. This lays them out as a contents
 * page — name, size, and enough of the first rows to recognise the sheet — so
 * the structure of the whole document is visible at once.
 */
export function SheetOverview({ workbook, onSelect }: SheetOverviewProps) {
  return (
    <div className="thin-scrollbar min-h-0 flex-1 overflow-auto bg-canvas">
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8">
        <header className="mb-6">
          <h2 className="text-[20px] font-semibold tracking-tight text-ink-900">
            {workbook.title}
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-500">
            시트 {workbook.sheets.length}개 · 보려는 시트를 선택하세요.
          </p>
        </header>

        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {workbook.sheets.map((sheet, index) => (
            <li key={sheet.sheetId}>
              <SheetCard sheet={sheet} index={index} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SheetCard({
  sheet,
  index,
  onSelect,
}: {
  sheet: Sheet
  index: number
  onSelect: (sheetId: string) => void
}) {
  const empty = isSheetEmpty(sheet)
  const cols = Math.min(sheet.cols, PEEK_COLS)
  const rows = Math.min(sheet.rows, PEEK_ROWS)

  return (
    <button
      type="button"
      onClick={() => onSelect(sheet.sheetId)}
      className="group flex h-full w-full flex-col rounded-lg border border-ink-200 bg-white p-4 text-left transition-colors hover:border-brand-400"
    >
      <div className="flex items-baseline gap-2">
        <span className="text-2xs tabular-nums text-ink-400">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h3
          className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink-900 group-hover:text-brand-800"
          title={sheet.sheetName}
        >
          {sheet.sheetName}
        </h3>
        {sheet.metadata.hidden && (
          <Icon name="visibility_off" className="shrink-0 text-[15px] text-ink-400" />
        )}
      </div>

      <p className="mt-0.5 text-2xs tabular-nums text-ink-400">
        {empty
          ? '데이터 없음'
          : `${sheet.rows.toLocaleString('ko-KR')}행 · ${sheet.cols.toLocaleString('ko-KR')}열`}
      </p>

      <div className="mt-3 min-h-[76px] flex-1 overflow-hidden rounded border border-ink-100 bg-ink-50/50 p-2">
        {empty ? (
          <p className="pt-4 text-center text-2xs text-ink-400">비어 있는 시트</p>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => {
                    const text = displayValue(getCell(sheet, r, c))
                    return (
                      <td
                        key={c}
                        className={`truncate px-1 py-px text-2xs ${
                          r === 0 ? 'font-medium text-ink-700' : 'text-ink-500'
                        }`}
                      >
                        {text || (r === 0 ? columnLabel(c) : '')}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </button>
  )
}
