import { useEffect } from 'react'
import {
  clearSession,
  loadSession,
  pruneOldSessions,
  saveSession,
} from '@/lib/persistence/session-store'
import type { Workbook } from '@/lib/workbook/model'

/** Writes settle this long after the last change, so typing is not IO-bound. */
const SAVE_DELAY_MS = 600

interface PersistenceOptions {
  workbook: Workbook | null
  activeSheetId: string | null
  editCount: number
  /** Only a workbook the user owns is worth keeping; shares reload from the server. */
  enabled: boolean
  onRestore: (workbook: Workbook, activeSheetId: string | null, editCount: number) => void
  onRestoreSettled: () => void
}

/**
 * Restores the workbook this tab had open, and keeps it up to date.
 *
 * Both halves are deliberately silent: a reload should simply put the user back
 * where they were, and a save that fails should cost nothing but the restore.
 */
export function useSessionPersistence({
  workbook,
  activeSheetId,
  editCount,
  enabled,
  onRestore,
  onRestoreSettled,
}: PersistenceOptions) {
  useEffect(() => {
    let cancelled = false

    loadSession()
      .then((session) => {
        if (cancelled) return
        if (session) onRestore(session.workbook, session.activeSheetId, session.editCount)
        onRestoreSettled()
      })
      .catch(onRestoreSettled)
      .finally(() => void pruneOldSessions())

    return () => {
      cancelled = true
    }
    // Runs once per mount: this is the tab's own restore, not a subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!enabled || !workbook) return
    const timer = window.setTimeout(() => {
      void saveSession({ workbook, activeSheetId, editCount })
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [workbook, activeSheetId, editCount, enabled])
}

export { clearSession }
