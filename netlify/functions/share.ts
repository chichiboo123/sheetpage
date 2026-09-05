/**
 * Share snapshots.
 *
 * A share is an immutable copy of the Workbook as it looked when the user
 * pressed 공유, stored in Netlify Blobs — the deployment already runs on
 * Netlify, so this needs no extra service, no schema and no credentials.
 *
 *   POST /api/share   { workbook }            -> { id, expiresAt }
 *   GET  /api/share?id=<id>                   -> { id, title, createdAt, workbook }
 *
 * Snapshots are read-only by design. An edit link, accounts and permissions
 * would each add a field to the stored record rather than change its shape.
 */
import { getStore } from '@netlify/blobs'

const STORE_NAME = 'sheetpage-shares'

/** Netlify caps a function request and response at 6 MB; stay clear of it. */
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024

const RETENTION_DAYS = 90

interface StoredShare {
  id: string
  title: string
  createdAt: string
  expiresAt: string
  /** Serialised Workbook, kept as a string so it is never re-parsed here. */
  workbook: string
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

/** URL-safe, non-sequential, ~62 bits of entropy. */
function newShareId(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(11)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export default async function handler(request: Request): Promise<Response> {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' })

  if (request.method === 'POST') return create(request, store)
  if (request.method === 'GET') return read(request, store)
  return json(405, { code: 'method-not-allowed', message: 'POST 또는 GET만 지원합니다.' })
}

type Store = ReturnType<typeof getStore>

async function create(request: Request, store: Store): Promise<Response> {
  let raw: string
  try {
    raw = await readBody(request)
  } catch {
    return json(400, { code: 'bad-request', message: '요청 본문을 읽을 수 없습니다.' })
  }

  if (raw.length > MAX_SNAPSHOT_BYTES) {
    return json(413, {
      code: 'too-large',
      message: 'Workbook이 너무 커서 공유 링크를 만들 수 없습니다. 파일을 직접 전달해주세요.',
    })
  }

  let payload: { workbook?: unknown }
  try {
    payload = JSON.parse(raw) as { workbook?: unknown }
  } catch {
    return json(400, { code: 'bad-request', message: '요청 형식이 올바르지 않습니다.' })
  }

  const workbook = payload.workbook as { title?: unknown; sheets?: unknown } | undefined
  if (!workbook || !Array.isArray(workbook.sheets)) {
    return json(400, { code: 'bad-request', message: '공유할 Workbook 데이터가 없습니다.' })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const record: StoredShare = {
    id: newShareId(),
    title: typeof workbook.title === 'string' ? workbook.title.slice(0, 200) : '제목 없는 Workbook',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    workbook: JSON.stringify(workbook),
  }

  try {
    await store.setJSON(record.id, record)
  } catch (error) {
    console.error('[share] store write failed', error)
    return json(500, { code: 'storage', message: '공유 링크를 저장하지 못했습니다.' })
  }

  return json(201, {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  })
}

async function read(request: Request, store: Store): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!/^[a-zA-Z0-9]{6,32}$/.test(id)) {
    return json(404, { code: 'not-found', message: '존재하지 않는 공유 링크입니다.' })
  }

  let record: StoredShare | null
  try {
    record = (await store.get(id, { type: 'json' })) as StoredShare | null
  } catch (error) {
    console.error('[share] store read failed', error)
    return json(500, { code: 'storage', message: '공유 링크를 불러오지 못했습니다.' })
  }

  if (!record) {
    return json(404, { code: 'not-found', message: '존재하지 않는 공유 링크입니다.' })
  }
  if (record.expiresAt && Date.parse(record.expiresAt) < Date.now()) {
    return json(410, { code: 'expired', message: '만료된 공유 링크입니다.' })
  }

  // `workbook` is stored as a string; splice it back in without re-parsing it.
  const body = `{"id":${JSON.stringify(record.id)},"title":${JSON.stringify(record.title)},"createdAt":${JSON.stringify(record.createdAt)},"expiresAt":${JSON.stringify(record.expiresAt)},"workbook":${record.workbook}}`

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Snapshots are immutable, so they can be cached hard.
      'cache-control': 'public, max-age=300',
    },
  })
}

/** Accepts a plain JSON body, or a gzip-compressed one for larger workbooks. */
async function readBody(request: Request): Promise<string> {
  const encoding = request.headers.get('x-sheetpage-encoding')
  if (encoding !== 'gzip' || !request.body) return request.text()

  const stream = request.body.pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).text()
}
