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

/** Mirrors the server's cap, so an oversized workbook fails before uploading. */
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024

export async function createShare(workbook: Workbook): Promise<ShareResult> {
  const json = JSON.stringify({ workbook })
  if (json.length > MAX_SNAPSHOT_BYTES) {
    throw new ShareError('too-large', MESSAGES['too-large'])
  }

  const encoded = await encodeBody(json)

  let response = await post(encoded)
  // If the server could not read the compressed form, one plain retry is
  // cheaper than failing the user outright.
  if (response.status === 400 && encoded !== json) {
    response = await post(json)
  }

  if (!response.ok) throw new ShareError(...(await readError(response)))

  const result = (await response.json()) as { id: string; expiresAt: string }
  return {
    id: result.id,
    url: `${window.location.origin}/s/${result.id}`,
    expiresAt: result.expiresAt,
  }
}

async function post(body: string): Promise<Response> {
  try {
    return await fetch('/api/share', {
      method: 'POST',
      // Plain text both ways: the server tells JSON from base64 gzip by looking
      // at the first character, and no hop has to handle a binary body.
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body,
    })
  } catch {
    throw new ShareError('network', MESSAGES.network)
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
 * Gzip the payload when the browser can, encoded as base64 so the request body
 * stays plain text. Anything that fails falls back to sending the JSON as-is.
 */
async function encodeBody(json: string): Promise<string> {
  if (typeof CompressionStream === 'undefined' || json.length < 64 * 1024) return json

  try {
    const compressed = await new Response(
      new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer()
    return toBase64(new Uint8Array(compressed))
  } catch {
    return json
  }
}

function toBase64(bytes: Uint8Array): string {
  // Chunked because spreading a multi-megabyte array into fromCharCode
  // overflows the call stack.
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function readError(response: Response): Promise<[ShareErrorCode, string]> {
  // The server explains itself; showing that beats a generic failure notice.
  let detail: string | undefined
  try {
    const body = (await response.json()) as { code?: string; message?: string }
    if (typeof body.message === 'string' && body.message !== '') detail = body.message
    if (body.code && body.code in MESSAGES) {
      return [body.code as ShareErrorCode, detail ?? MESSAGES[body.code as ShareErrorCode]]
    }
  } catch {
    // Fall through to the status-based mapping below.
  }
  if (response.status === 404) return ['not-found', detail ?? MESSAGES['not-found']]
  if (response.status === 410) return ['expired', detail ?? MESSAGES.expired]
  if (response.status === 413) return ['too-large', detail ?? MESSAGES['too-large']]
  return ['unknown', detail ?? MESSAGES.unknown]
}
