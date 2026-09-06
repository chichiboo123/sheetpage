/**
 * Keeping the open workbook across a reload.
 *
 * A workbook lives only in memory, so refreshing the page used to throw the
 * file and every edit away. This stores it in IndexedDB rather than
 * localStorage: a real spreadsheet is megabytes, localStorage is a synchronous
 * string store that would block the UI to write it, and IndexedDB keeps the
 * object as-is with no serialisation step.
 *
 * The record is keyed per browser tab. Two tabs holding different files would
 * otherwise overwrite each other, and refreshing one would surprise you with
 * the other's document. A reload keeps the tab's sessionStorage, so the key
 * survives exactly as long as the tab does; records left behind by closed tabs
 * are pruned by age.
 *
 * Everything here is best-effort. Private windows, disabled storage and quota
 * limits all make persistence fail, and none of those should stop the app from
 * working — a failed save just means a reload starts fresh.
 */
import type { Workbook } from '@/lib/workbook/model'

const DB_NAME = 'sheetpage'
const DB_VERSION = 1
const STORE = 'sessions'

const TAB_KEY = 'sheetpage.tab'
/** Lets the very first render know a restore is coming, without waiting on IO. */
const MARKER_KEY = 'sheetpage.has-workbook'

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface StoredSession {
  workbook: Workbook
  activeSheetId: string | null
  /**
   * Carried across the reload so the toolbar keeps saying 수정됨. A restored
   * workbook still differs from the file on disk, and hiding that invites
   * someone to close the tab believing nothing was changed.
   */
  editCount: number
}

interface SessionRow extends StoredSession {
  tabId: string
  savedAt: number
}

function tabId(): string {
  try {
    let id = sessionStorage.getItem(TAB_KEY)
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(TAB_KEY, id)
    }
    return id
  } catch {
    return 'default'
  }
}

/**
 * Synchronous hint for the first paint: true when this tab had a workbook open.
 * Without it the start screen would flash before the restore lands.
 */
export function mayHaveStoredWorkbook(): boolean {
  try {
    return sessionStorage.getItem(MARKER_KEY) === '1'
  } catch {
    return false
  }
}

function setMarker(present: boolean) {
  try {
    if (present) sessionStorage.setItem(MARKER_KEY, '1')
    else sessionStorage.removeItem(MARKER_KEY)
  } catch {
    // Storage can be unavailable; the app still works without the hint.
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)

    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      return resolve(null)
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'tabId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | null,
): Promise<T | null> {
  return openDatabase().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        let request: IDBRequest<T> | null
        try {
          request = work(db.transaction(STORE, mode).objectStore(STORE))
        } catch {
          db.close()
          return resolve(null)
        }
        if (!request) {
          db.close()
          return resolve(null)
        }
        request.onsuccess = () => {
          resolve(request.result)
          db.close()
        }
        request.onerror = () => {
          resolve(null)
          db.close()
        }
      }),
  )
}

export async function saveSession(session: StoredSession): Promise<void> {
  const row: SessionRow = { ...session, tabId: tabId(), savedAt: Date.now() }
  const stored = await runTransaction('readwrite', (store) => store.put(row) as IDBRequest<unknown>)
  // Only claim a workbook is stored if the write actually landed; a quota
  // failure otherwise leaves the next reload waiting for a restore that never
  // arrives.
  setMarker(stored !== null)
}

export async function loadSession(): Promise<StoredSession | null> {
  const row = await runTransaction<SessionRow | undefined>(
    'readonly',
    (store) => store.get(tabId()) as IDBRequest<SessionRow | undefined>,
  )
  if (!row || !row.workbook || !Array.isArray(row.workbook.sheets)) {
    setMarker(false)
    return null
  }
  return {
    workbook: row.workbook,
    activeSheetId: row.activeSheetId,
    editCount: typeof row.editCount === 'number' ? row.editCount : 0,
  }
}

export async function clearSession(): Promise<void> {
  setMarker(false)
  await runTransaction('readwrite', (store) => store.delete(tabId()) as IDBRequest<undefined>)
}

/** Drops records whose tab is long gone, so storage does not grow forever. */
export async function pruneOldSessions(): Promise<void> {
  const db = await openDatabase()
  if (!db) return
  try {
    const store = db.transaction(STORE, 'readwrite').objectStore(STORE)
    const cutoff = Date.now() - MAX_AGE_MS
    const current = tabId()
    const cursorRequest = store.openCursor()
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (!cursor) return db.close()
      const row = cursor.value as SessionRow
      if (row.tabId !== current && row.savedAt < cutoff) cursor.delete()
      cursor.continue()
    }
    cursorRequest.onerror = () => db.close()
  } catch {
    db.close()
  }
}
