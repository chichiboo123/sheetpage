/**
 * Fetching a Google Sheets document.
 *
 * The browser cannot call Google's export endpoint directly — it answers
 * without CORS headers and redirects to a sign-in page for anything private —
 * so the request goes through the site's own function, which returns the
 * document as .xlsx bytes. Those bytes then take exactly the same path as an
 * uploaded file.
 */
import { parseSpreadsheet } from '../workbook/worker-client'
import type { Workbook } from '../workbook/model'
import { extractSpreadsheetRef, type GoogleSheetRef } from './url'

export type GoogleImportErrorCode =
  | 'invalid-url'
  | 'not-found'
  | 'forbidden'
  | 'too-large'
  | 'network'
  | 'unknown'

export class GoogleImportError extends Error {
  readonly code: GoogleImportErrorCode

  constructor(code: GoogleImportErrorCode, message: string) {
    super(message)
    this.name = 'GoogleImportError'
    this.code = code
  }
}

const MESSAGES: Record<GoogleImportErrorCode, string> = {
  'invalid-url': '올바른 Google Sheets 링크인지 확인해주세요.',
  'not-found': '이 문서를 찾을 수 없습니다. 링크가 정확한지 확인해주세요.',
  forbidden: '이 문서에 접근할 수 없습니다. 링크 공유 설정을 확인해주세요.',
  'too-large': '문서가 너무 커서 불러올 수 없습니다.',
  network: '네트워크 문제로 문서를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
  unknown: '문서를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
}

export function googleErrorMessage(code: GoogleImportErrorCode): string {
  return MESSAGES[code]
}

export async function importGoogleSheet(
  input: string,
  onProgress?: (message: string) => void,
): Promise<Workbook> {
  const ref = extractSpreadsheetRef(input)
  if (!ref) throw new GoogleImportError('invalid-url', MESSAGES['invalid-url'])

  onProgress?.('Google Sheets에서 문서를 가져오는 중…')
  const { buffer, title } = await fetchExport(ref)

  onProgress?.('Workbook으로 변환하는 중…')
  const workbook = await parseSpreadsheet(buffer, `${title}.xlsx`, 'google-sheets', onProgress)
  workbook.title = title
  workbook.sourceType = 'google-sheets'
  workbook.sourceName = input.trim()
  return workbook
}

async function fetchExport(ref: GoogleSheetRef): Promise<{ buffer: ArrayBuffer; title: string }> {
  let response: Response
  try {
    response = await fetch(
      `/api/gsheets?id=${encodeURIComponent(ref.id)}&kind=${ref.kind}`,
      { headers: { accept: 'application/octet-stream' } },
    )
  } catch {
    throw new GoogleImportError('network', MESSAGES.network)
  }

  if (!response.ok) {
    const code = await readErrorCode(response)
    throw new GoogleImportError(code, MESSAGES[code])
  }

  const buffer = await response.arrayBuffer()
  const header = response.headers.get('x-sheetpage-title')
  const title = header ? safeDecode(header) : 'Google Sheets 문서'
  return { buffer, title }
}

async function readErrorCode(response: Response): Promise<GoogleImportErrorCode> {
  try {
    const body = (await response.json()) as { code?: string }
    if (body.code && body.code in MESSAGES) return body.code as GoogleImportErrorCode
  } catch {
    // Fall through to the status-based mapping below.
  }
  if (response.status === 404) return 'not-found'
  if (response.status === 403 || response.status === 401) return 'forbidden'
  if (response.status === 413) return 'too-large'
  return 'unknown'
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
