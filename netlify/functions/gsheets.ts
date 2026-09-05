/**
 * Google Sheets -> .xlsx proxy.
 *
 * Google's export endpoint sends no CORS headers and answers a request for a
 * document the caller cannot read by redirecting to a sign-in page, so the
 * browser cannot do this itself. This function fetches the export server-side
 * and hands back the raw .xlsx bytes plus the document title.
 *
 * Only documents that are public or shared with "anyone with the link" are
 * reachable — the request is unauthenticated by design. When private documents
 * are added later, this is the single place that gains an OAuth token; nothing
 * in the browser changes.
 */

/** Google ids are opaque, but they are always URL-safe base64-ish. */
const ID_PATTERN = /^[a-zA-Z0-9-_]{20,200}$/

const MAX_BYTES = 20 * 1024 * 1024
const TIMEOUT_MS = 20_000

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type ErrorCode = 'invalid-url' | 'not-found' | 'forbidden' | 'too-large' | 'network' | 'unknown'

function fail(status: number, code: ErrorCode, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return fail(405, 'unknown', 'GET 요청만 지원합니다.')
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id') ?? ''
  const kind = url.searchParams.get('kind') === 'published' ? 'published' : 'file'

  if (!ID_PATTERN.test(id)) {
    return fail(400, 'invalid-url', '올바른 Google Sheets 링크인지 확인해주세요.')
  }

  const exportUrl =
    kind === 'published'
      ? `https://docs.google.com/spreadsheets/d/e/${id}/pub?output=xlsx`
      : `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let upstream: Response
  try {
    upstream = await fetch(exportUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Without a browser-ish UA Google sometimes answers with an interstitial.
        'user-agent': 'Mozilla/5.0 (compatible; SheetPage/1.0; +https://github.com/chichiboo123/sheetpage)',
        accept: XLSX_MIME + ',application/octet-stream',
      },
    })
  } catch {
    clearTimeout(timer)
    return fail(504, 'network', '문서를 가져오는 데 시간이 너무 오래 걸립니다.')
  }
  clearTimeout(timer)

  if (upstream.status === 404) {
    return fail(404, 'not-found', '이 문서를 찾을 수 없습니다.')
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return fail(403, 'forbidden', '이 문서에 접근할 수 없습니다. 링크 공유 설정을 확인해주세요.')
  }
  if (!upstream.ok) {
    return fail(502, 'unknown', '문서를 불러오지 못했습니다.')
  }

  // A document that needs sign-in resolves to an HTML login page with a 200,
  // so the content type is what actually distinguishes success from denial.
  const contentType = upstream.headers.get('content-type') ?? ''
  if (contentType.includes('text/html')) {
    return fail(403, 'forbidden', '이 문서에 접근할 수 없습니다. 링크 공유 설정을 확인해주세요.')
  }

  const declared = Number(upstream.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) {
    return fail(413, 'too-large', '문서가 너무 커서 불러올 수 없습니다.')
  }

  const buffer = await upstream.arrayBuffer()
  if (buffer.byteLength > MAX_BYTES) {
    return fail(413, 'too-large', '문서가 너무 커서 불러올 수 없습니다.')
  }
  if (buffer.byteLength === 0) {
    return fail(502, 'unknown', '문서가 비어 있습니다.')
  }

  const title = titleFromDisposition(upstream.headers.get('content-disposition'))

  return new Response(buffer, {
    status: 200,
    headers: {
      'content-type': XLSX_MIME,
      'x-sheetpage-title': encodeURIComponent(title),
      'cache-control': 'no-store',
    },
  })
}

/** `attachment; filename="Plan.xlsx"; filename*=UTF-8''%ED%8F%89%EA%B0%80.xlsx` */
function titleFromDisposition(disposition: string | null): string {
  if (!disposition) return 'Google Sheets 문서'

  const extended = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (extended) {
    try {
      return stripExtension(decodeURIComponent(extended[1].trim()))
    } catch {
      // Fall through to the plain filename below.
    }
  }

  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  if (plain) return stripExtension(plain[1].trim())

  return 'Google Sheets 문서'
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name
}
