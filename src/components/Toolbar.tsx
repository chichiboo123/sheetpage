import { Logo } from './Logo'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import type { Workbook } from '@/lib/workbook/model'

const SOURCE_LABEL: Record<Workbook['sourceType'], string> = {
  xlsx: 'Excel',
  xls: 'Excel 97-2003',
  csv: 'CSV',
  'google-sheets': 'Google Sheets',
  shared: '공유 링크',
}

interface ToolbarProps {
  workbook: Workbook
  readOnly: boolean
  edited: boolean
  canUndo: boolean
  downloading: boolean
  onOpenSheetList: () => void
  onDownload: () => void
  onShare: () => void
  onUndo: () => void
  /** Closes the workbook and returns to the start screen. */
  onReset: () => void
}

export function Toolbar({
  workbook,
  readOnly,
  edited,
  canUndo,
  downloading,
  onOpenSheetList,
  onDownload,
  onShare,
  onUndo,
  onReset,
}: ToolbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-3 sm:px-4">
      <button
        type="button"
        onClick={onOpenSheetList}
        aria-label="시트 목록 열기"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-600 transition-colors hover:bg-ink-100 md:hidden"
      >
        <Icon name="menu" className="text-[21px]" />
      </button>

      <button
        type="button"
        onClick={onReset}
        aria-label="SheetPage 처음 화면으로"
        title="처음 화면으로"
        className="shrink-0 rounded-md px-1 py-1 transition-colors hover:bg-ink-100"
      >
        <Logo markOnly className="sm:hidden" />
        <Logo className="hidden sm:inline-flex" />
      </button>

      <div className="mx-1 hidden h-5 w-px shrink-0 bg-ink-200 sm:block" />

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[14px] font-medium text-ink-900" title={workbook.title}>
          {workbook.title}
        </h1>
        <p className="flex items-center gap-1.5 truncate text-2xs text-ink-400">
          <span>{SOURCE_LABEL[workbook.sourceType]}</span>
          <span aria-hidden="true">·</span>
          <span>시트 {workbook.sheets.length}개</span>
          {readOnly && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-ink-500">읽기 전용</span>
            </>
          )}
          {edited && !readOnly && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-medium text-brand-700">수정됨</span>
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={onReset}
        aria-label="초기화"
        title="초기화 — 현재 파일을 닫고 처음 화면으로"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <Icon name="restart_alt" className="text-[20px]" />
      </button>

      {!readOnly && canUndo && (
        <button
          type="button"
          onClick={onUndo}
          aria-label="실행 취소"
          title="실행 취소 (Ctrl+Z)"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <Icon name="undo" className="text-[20px]" />
        </button>
      )}

      <Button onClick={onShare} size="md" className="shrink-0">
        <Icon name="link" className="text-[18px]" />
        <span className="hidden sm:inline">공유</span>
        <span className="sr-only sm:hidden">공유</span>
      </Button>

      <Button variant="primary" size="md" onClick={onDownload} disabled={downloading} className="shrink-0">
        <Icon name={downloading ? 'hourglass_empty' : 'download'} className="text-[18px]" />
        <span className="hidden sm:inline">{downloading ? '준비 중…' : '다운로드'}</span>
        <span className="sr-only sm:hidden">xlsx 다운로드</span>
      </Button>
    </header>
  )
}
