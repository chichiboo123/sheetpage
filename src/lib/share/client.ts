/**
 * Creating and reading share snapshots.
 *
 * The snapshot is the Workbook model itself, so a shared link opens in exactly
 * the same viewer as a local file — only the edit affordances are withheld.
 */
import type { Workbook } from '../workbook/model'

export type ShareErrorCode = 'too-large' | 'not-found' | 'expired' | 'network' | 'storage' | 'unknown'

export class ShareError extends Error {
  readonly code: ShareErrorCode

  constructor(code: ShareErrorCode, message: string) {
    super(message)
    this.name = 'ShareError'
    this.code = code
  }
}

const MESSAGES: Record<ShareErrorCode, string> = {
  'too-large': 'Workbook이 너무 커서 공유 링크를 만들 수 없습니다. 파일을 직접 전달해주세요.',
  'not-found': '존재하지 않는 공유 링크입니다.',
  expired: '만료된 공유 링크입니다.',
  network: '네트워크 문제로 요청을 완료하지 못했습니다.',
  storage: '공유 데이터를 처리하지 못했습니다.',
  unknown: '요청을 완료하지 못했습니다.',
}

export interface ShareResult {
  id: string
  url: string
  expiresAt: string
}

export interface SharedSnapshot {
  id: string
  title: string
  createdAt: string
  expiresAt: string
  workbook: Workbook
}

export async function createShare(workbook: Workbook): Promise<ShareResult> {
  const body = JSON.stringify({ workbook })

  let response: Response
  try {
    response = await fetch('/api/share', await buildRequestInit(body))
  } catch {
    throw new ShareError('network', MESSAGES.network)
  }

  if (!response.ok) throw new ShareError(...(await readError(response)))

  const result = (await response.json()) as { id: string; expiresAt: string }
  return {
    id: result.id,
    url: `${window.location.origin}/s/${result.id}`,
    expiresAt: result.expiresAt,
  }
}

export async function fetchShare(id: string): Promise<SharedSnapshot> {
  let response: Response
  try {
    response = await fetch(`/api/share?id=${encodeURIComponent(id)}`)
  } catch {
    throw new ShareError('network', MESSAGES.network)
  }

  if (!response.ok) throw new ShareError(...(await readError(response)))
  return (await response.json()) as SharedSnapshot
}

/**
 * Gzip the payload when the browser can, which keeps a large workbook well
 * under the platform's request size limit. Browsers without CompressionStream
 * simply send the JSON as-is.
 */
async function buildRequestInit(body: string): Promise<RequestInit> {
  if (typeof CompressionStream === 'undefined') {
    return {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }
  }

  const compressed = await new Response(
    new Blob([body]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer()

  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sheetpage-encoding': 'gzip',
    },
    body: compressed,
  }
}

async function readError(response: Response): Promise<[ShareErrorCode, string]> {
  try {
    const body = (await response.json()) as { code?: string; message?: string }
    if (body.code && body.code in MESSAGES) {
      return [body.code as ShareErrorCode, body.message || MESSAGES[body.code as ShareErrorCode]]
    }
  } catch {
    // Fall through to the status-based mapping below.
  }
  if (response.status === 404) return ['not-found', MESSAGES['not-found']]
  if (response.status === 410) return ['expired', MESSAGES.expired]
  if (response.status === 413) return ['too-large', MESSAGES['too-large']]
  return ['unknown', MESSAGES.unknown]
}
