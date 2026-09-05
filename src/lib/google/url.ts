/**
 * Pulling a spreadsheet id out of whatever the user pasted.
 *
 * Google hands out several link shapes for the same document, and people paste
 * them with tracking suffixes, `/u/0/` account prefixes or no scheme at all.
 * Two id spaces exist: normal document ids (`/d/{id}/edit`) and
 * publish-to-web ids (`/d/e/{id}/pubhtml`), which need a different export URL.
 */

export type GoogleSheetKind = 'file' | 'published'

export interface GoogleSheetRef {
  id: string
  kind: GoogleSheetKind
  /** Sheet gid from the fragment or query, when the link pointed at one tab. */
  gid?: string
}

const PUBLISHED_ID = /\/spreadsheets\/(?:u\/\d+\/)?d\/e\/([a-zA-Z0-9-_]{20,})/
const FILE_ID = /\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]{20,})/
const BARE_ID = /^[a-zA-Z0-9-_]{25,}$/

export function extractSpreadsheetRef(input: string): GoogleSheetRef | null {
  const text = input.trim()
  if (text === '') return null

  if (BARE_ID.test(text)) return { id: text, kind: 'file' }

  const published = PUBLISHED_ID.exec(text)
  if (published) return { id: published[1], kind: 'published', gid: extractGid(text) }

  const file = FILE_ID.exec(text)
  if (file) return { id: file[1], kind: 'file', gid: extractGid(text) }

  return null
}

function extractGid(text: string): string | undefined {
  const match = /[#&?]gid=(\d+)/.exec(text)
  return match ? match[1] : undefined
}

export function isGoogleSheetsUrl(input: string): boolean {
  return /docs\.google\.com\/spreadsheets/.test(input)
}
