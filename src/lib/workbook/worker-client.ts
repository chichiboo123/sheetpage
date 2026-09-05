/**
 * Thin promise wrapper around the spreadsheet worker.
 *
 * A worker is spawned per operation and terminated when it settles, so a file
 * that manages to corrupt its realm cannot affect the next one.
 */
import type { WorkerRequestBody, WorkerResponse } from '@/workers/spreadsheet.worker'
import type { Workbook, WorkbookSourceType } from './model'

function spawn(): Worker {
  return new Worker(new URL('../../workers/spreadsheet.worker.ts', import.meta.url), {
    type: 'module',
  })
}

function run<T>(
  request: WorkerRequestBody,
  transfer: Transferable[],
  onProgress: ((message: string) => void) | undefined,
  select: (response: WorkerResponse) => T | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = spawn()
    const id = Math.random().toString(36).slice(2)
    const finish = (fn: () => void) => {
      worker.terminate()
      fn()
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      if (response.id !== id) return
      if (response.kind === 'progress') {
        onProgress?.(response.message)
        return
      }
      if (response.kind === 'error') {
        finish(() => reject(new SpreadsheetWorkerError(response.message, response.code)))
        return
      }
      const value = select(response)
      if (value !== undefined) finish(() => resolve(value))
    }

    worker.onerror = (event) => {
      finish(() => reject(new SpreadsheetWorkerError(event.message || '작업에 실패했습니다.', 'worker')))
    }

    worker.postMessage({ ...request, id }, transfer)
  })
}

export class SpreadsheetWorkerError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'SpreadsheetWorkerError'
    this.code = code
  }
}

export function parseSpreadsheet(
  buffer: ArrayBuffer,
  fileName: string,
  sourceType: WorkbookSourceType,
  onProgress?: (message: string) => void,
): Promise<Workbook> {
  return run<Workbook>(
    { kind: 'parse', buffer, fileName, sourceType },
    [buffer],
    onProgress,
    (response) => (response.kind === 'parsed' ? response.workbook : undefined),
  )
}

export function exportWorkbookToXlsx(workbook: Workbook): Promise<ArrayBuffer> {
  return run<ArrayBuffer>(
    { kind: 'export', workbook },
    [],
    undefined,
    (response) => (response.kind === 'exported' ? response.buffer : undefined),
  )
}
