/**
 * Verifies the two serverless functions without a Netlify runtime.
 *
 * Netlify Blobs is swapped for an in-memory store and `fetch` is stubbed, so
 * what is exercised here is the handlers' own logic: id validation, the
 * difference between "not found" and "no access", body decoding, size limits
 * and expiry.
 */
import shareHandler from '../netlify/functions/share'
import gsheetsHandler from '../netlify/functions/gsheets'
import { __store } from '@netlify/blobs'

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n        got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`),
  )
}

const workbook = {
  id: 'wb1',
  title: '2026학년도 평가계획',
  sourceType: 'xlsx',
  createdAt: new Date().toISOString(),
  sheets: [
    { sheetId: 's1', sheetName: '개요', rows: 2, cols: 2, cells: { '0:0': { v: '항목' } }, merges: [], metadata: {} },
  ],
}

async function shareTests() {
  console.log('\n-- /api/share --')

  const created = await shareHandler(
    new Request('https://sheetpage.test/api/share', {
      method: 'POST',
      body: JSON.stringify({ workbook }),
    }),
  )
  check('create returns 201', created.status, 201)
  const createdBody = (await created.json()) as { id: string; title: string; expiresAt: string }
  check('id is unguessable-length', createdBody.id.length, 11)
  check('title stored', createdBody.title, '2026학년도 평가계획')
  check('expiry is in the future', Date.parse(createdBody.expiresAt) > Date.now(), true)

  const read = await shareHandler(
    new Request(`https://sheetpage.test/api/share?id=${createdBody.id}`),
  )
  check('read returns 200', read.status, 200)
  const snapshot = (await read.json()) as { title: string; workbook: typeof workbook }
  check('workbook survives the round trip', snapshot.workbook.sheets[0].cells['0:0'], { v: '항목' })
  check('sheet name survives', snapshot.workbook.sheets[0].sheetName, '개요')

  // Two links for the same workbook must not collide.
  const second = await shareHandler(
    new Request('https://sheetpage.test/api/share', {
      method: 'POST',
      body: JSON.stringify({ workbook }),
    }),
  )
  const secondBody = (await second.json()) as { id: string }
  check('ids are distinct', secondBody.id !== createdBody.id, true)

  // Larger workbooks are sent gzip-compressed, which is what keeps a big
  // snapshot inside the platform's request size limit.
  const bigWorkbook = {
    ...workbook,
    sheets: [
      {
        ...workbook.sheets[0],
        rows: 2000,
        cells: Object.fromEntries(
          Array.from({ length: 2000 }, (_, r) => [`${r}:0`, { v: `항목 ${r}`, t: 's' }]),
        ),
      },
    ],
  }
  const json = JSON.stringify({ workbook: bigWorkbook })
  const gzip = await new Response(
    new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')),
  ).arrayBuffer()
  const compressed = await shareHandler(
    new Request('https://sheetpage.test/api/share', {
      method: 'POST',
      headers: { 'x-sheetpage-encoding': 'gzip' },
      body: gzip,
    }),
  )
  check('gzip body accepted', compressed.status, 201)
  check('gzip shrinks a real snapshot by >5x', gzip.byteLength * 5 < json.length, true)

  const compressedId = ((await compressed.json()) as { id: string }).id
  const decompressed = await shareHandler(
    new Request(`https://sheetpage.test/api/share?id=${compressedId}`),
  )
  const bigSnapshot = (await decompressed.json()) as { workbook: { sheets: { cells: Record<string, unknown> }[] } }
  check('gzip round trip keeps every cell', Object.keys(bigSnapshot.workbook.sheets[0].cells).length, 2000)
  check('gzip round trip keeps korean values', bigSnapshot.workbook.sheets[0].cells['1999:0'], { v: '항목 1999', t: 's' })

  const missing = await shareHandler(new Request('https://sheetpage.test/api/share?id=zzzzzzzzzzz'))
  check('unknown id returns 404', missing.status, 404)
  check('unknown id message', ((await missing.json()) as { code: string }).code, 'not-found')

  const malformedId = await shareHandler(new Request('https://sheetpage.test/api/share?id=../etc'))
  check('malformed id returns 404', malformedId.status, 404)

  // Expiry is enforced on read, not by the store.
  const expiredId = 'expiredlink'
  __store.set(expiredId, {
    id: expiredId,
    title: '오래된 문서',
    createdAt: '2020-01-01T00:00:00.000Z',
    expiresAt: '2020-04-01T00:00:00.000Z',
    workbook: JSON.stringify(workbook),
  })
  const expired = await shareHandler(new Request(`https://sheetpage.test/api/share?id=${expiredId}`))
  check('expired link returns 410', expired.status, 410)
  check('expired link code', ((await expired.json()) as { code: string }).code, 'expired')

  const noSheets = await shareHandler(
    new Request('https://sheetpage.test/api/share', { method: 'POST', body: '{"workbook":{}}' }),
  )
  check('workbook without sheets rejected', noSheets.status, 400)

  const notJson = await shareHandler(
    new Request('https://sheetpage.test/api/share', { method: 'POST', body: 'not json' }),
  )
  check('non-json body rejected', notJson.status, 400)

  const huge = await shareHandler(
    new Request('https://sheetpage.test/api/share', {
      method: 'POST',
      body: JSON.stringify({ workbook, padding: 'x'.repeat(6 * 1024 * 1024) }),
    }),
  )
  check('oversized snapshot returns 413', huge.status, 413)
  check('oversized snapshot code', ((await huge.json()) as { code: string }).code, 'too-large')

  const wrongMethod = await shareHandler(
    new Request('https://sheetpage.test/api/share', { method: 'DELETE' }),
  )
  check('unsupported method returns 405', wrongMethod.status, 405)
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'

function stubFetch(response: Response | (() => Response)) {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input))
    return typeof response === 'function' ? response() : response
  }) as typeof fetch
  return calls
}

async function gsheetsTests() {
  console.log('\n-- /api/gsheets --')

  let calls = stubFetch(
    () =>
      new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), {
        headers: {
          'content-type': XLSX_MIME,
          'content-disposition': 'attachment; filename="Plan.xlsx"; filename*=UTF-8\'\'%ED%8F%89%EA%B0%80%EA%B3%84%ED%9A%8D.xlsx',
        },
      }),
  )
  let response = await gsheetsHandler(new Request(`https://sheetpage.test/api/gsheets?id=${ID}`))
  check('public sheet returns 200', response.status, 200)
  check('export url', calls[0], `https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx`)
  check('title from the utf-8 filename', decodeURIComponent(response.headers.get('x-sheetpage-title') ?? ''), '평가계획')
  check('bytes passed through', (await response.arrayBuffer()).byteLength, 7)

  calls = stubFetch(
    () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': XLSX_MIME, 'content-disposition': 'attachment; filename="Budget.xlsx"' },
      }),
  )
  response = await gsheetsHandler(
    new Request(`https://sheetpage.test/api/gsheets?id=${ID}&kind=published`),
  )
  check('published export url', calls[0], `https://docs.google.com/spreadsheets/d/e/${ID}/pub?output=xlsx`)
  check('title from the plain filename', decodeURIComponent(response.headers.get('x-sheetpage-title') ?? ''), 'Budget')

  // Google answers a request for a private document with a sign-in page — a 200
  // carrying HTML — so the status alone would look like success.
  stubFetch(() => new Response('<html>sign in</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }))
  response = await gsheetsHandler(new Request(`https://sheetpage.test/api/gsheets?id=${ID}`))
  check('login page treated as no access', response.status, 403)
  check('no-access code', ((await response.json()) as { code: string }).code, 'forbidden')

  stubFetch(() => new Response('', { status: 404 }))
  response = await gsheetsHandler(new Request(`https://sheetpage.test/api/gsheets?id=${ID}`))
  check('missing document returns 404', response.status, 404)
  check('missing document code', ((await response.json()) as { code: string }).code, 'not-found')

  stubFetch(() => new Response('', { status: 403 }))
  response = await gsheetsHandler(new Request(`https://sheetpage.test/api/gsheets?id=${ID}`))
  check('upstream 403 maps to forbidden', ((await response.json()) as { code: string }).code, 'forbidden')

  stubFetch(
    () =>
      new Response(new Uint8Array([1]), {
        headers: { 'content-type': XLSX_MIME, 'content-length': String(50 * 1024 * 1024) },
      }),
  )
  response = await gsheetsHandler(new Request(`https://sheetpage.test/api/gsheets?id=${ID}`))
  check('oversized document returns 413', response.status, 413)

  stubFetch(() => new Response(new Uint8Array(), { headers: { 'content-type': XLSX_MIME } }))
  response = await gsheetsHandler(new Request(`https://sheetpage.test/api/gsheets?id=${ID}`))
  check('empty document rejected', response.status, 502)

  response = await gsheetsHandler(new Request('https://sheetpage.test/api/gsheets?id=short'))
  check('malformed id returns 400', response.status, 400)
  check('malformed id code', ((await response.json()) as { code: string }).code, 'invalid-url')

  response = await gsheetsHandler(new Request('https://sheetpage.test/api/gsheets', { method: 'POST' }))
  check('unsupported method returns 405', response.status, 405)

  stubFetch(() => {
    throw new Error('network down')
  })
  response = await gsheetsHandler(new Request(`https://sheetpage.test/api/gsheets?id=${ID}`))
  check('upstream failure returns 504', response.status, 504)
}

await shareTests()
await gsheetsTests()

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
