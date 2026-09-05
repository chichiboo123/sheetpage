/**
 * Spreadsheet parsing and writing, off the main thread.
 *
 * Keeping SheetJS here does two jobs at once: a large workbook never blocks the
 * UI while it is being decoded, and an untrusted file is decoded in a worker
 * realm that is thrown away afterwards rather than in the realm the app runs in.
 */
import { convertArrayBuffer, WorkbookParseError } from '@/lib/workbook/import/sheetjs'
import { workbookToXlsxArrayBuffer } from '@/lib/workbook/export/xlsx'
import type { Workbook, WorkbookSourceType } from '@/lib/workbook/model'

export type WorkerRequestBody =
  | { kind: 'parse'; buffer: ArrayBuffer; fileName: string; sourceType: WorkbookSourceType }
  | { kind: 'export'; workbook: Workbook }

export type WorkerRequest = WorkerRequestBody & { id: string }

export type WorkerResponse =
  | { id: string; kind: 'progress'; message: string }
  | { id: string; kind: 'parsed'; workbook: Workbook }
  | { id: string; kind: 'exported'; buffer: ArrayBuffer }
  | { id: string; kind: 'error'; message: string; code: string }

const post = (message: WorkerResponse, transfer?: Transferable[]) => {
  ;(self as unknown as Worker).postMessage(message, transfer ?? [])
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    if (request.kind === 'parse') {
      post({ id: request.id, kind: 'progress', message: '파일을 읽는 중…' })
      const workbook = convertArrayBuffer(request.buffer, {
        fileName: request.fileName,
        sourceType: request.sourceType,
        onSheet: (index, total, name) => {
          post({
            id: request.id,
            kind: 'progress',
            message: `시트 분석 중 (${index + 1}/${total}) · ${name}`,
          })
        },
      })
      post({ id: request.id, kind: 'parsed', workbook })
      return
    }

    const buffer = workbookToXlsxArrayBuffer(request.workbook)
    post({ id: request.id, kind: 'exported', buffer }, [buffer])
  } catch (error) {
    post({
      id: request.id,
      kind: 'error',
      message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      code: error instanceof WorkbookParseError ? error.code : 'unknown',
    })
  }
}
