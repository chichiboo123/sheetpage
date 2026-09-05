/**
 * Which files SheetPage accepts, and how a file becomes a Workbook.
 *
 * Adding a format means adding one entry here plus a branch in the worker's
 * converter — nothing in the UI needs to change.
 */
import { parseSpreadsheet } from '../worker-client'
import type { Workbook, WorkbookSourceType } from '../model'

export interface FormatDescriptor {
  sourceType: Exclude<WorkbookSourceType, 'google-sheets' | 'shared'>
  label: string
  extensions: string[]
  mimeTypes: string[]
}

export const SUPPORTED_FORMATS: FormatDescriptor[] = [
  {
    sourceType: 'xlsx',
    label: 'Excel 통합 문서',
    extensions: ['.xlsx', '.xlsm'],
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
    ],
  },
  {
    sourceType: 'xls',
    label: 'Excel 97-2003 문서',
    extensions: ['.xls'],
    mimeTypes: ['application/vnd.ms-excel'],
  },
  {
    sourceType: 'csv',
    label: 'CSV / TSV',
    extensions: ['.csv', '.tsv', '.txt'],
    mimeTypes: ['text/csv', 'text/tab-separated-values', 'text/plain'],
  },
]

/** `accept` attribute for the file input. */
export const FILE_ACCEPT = SUPPORTED_FORMATS.flatMap((f) => [...f.extensions, ...f.mimeTypes]).join(',')

export const SUPPORTED_EXTENSION_LABEL = SUPPORTED_FORMATS.flatMap((f) => f.extensions).join(', ')

/** Above this a browser tab starts to struggle, so refuse it with an explanation. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export class UnsupportedFileError extends Error {
  readonly fileName: string

  constructor(fileName: string) {
    super(`지원하지 않는 파일 형식입니다: ${fileName}`)
    this.name = 'UnsupportedFileError'
    this.fileName = fileName
  }
}

export class FileTooLargeError extends Error {
  readonly size: number

  constructor(size: number) {
    super('파일이 너무 큽니다.')
    this.name = 'FileTooLargeError'
    this.size = size
  }
}

export function detectSourceType(file: { name: string; type?: string }): FormatDescriptor | null {
  const lower = file.name.toLowerCase()
  const byExtension = SUPPORTED_FORMATS.find((f) => f.extensions.some((ext) => lower.endsWith(ext)))
  if (byExtension) return byExtension
  if (file.type) {
    const byMime = SUPPORTED_FORMATS.find((f) => f.mimeTypes.includes(file.type as string))
    if (byMime) return byMime
  }
  return null
}

export async function importFile(
  file: File,
  onProgress?: (message: string) => void,
): Promise<Workbook> {
  const format = detectSourceType(file)
  if (!format) throw new UnsupportedFileError(file.name)
  if (file.size > MAX_FILE_BYTES) throw new FileTooLargeError(file.size)

  onProgress?.('파일을 불러오는 중…')
  const buffer = await file.arrayBuffer()
  return parseSpreadsheet(buffer, file.name, format.sourceType, onProgress)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
