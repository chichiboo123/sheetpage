import { useCallback, useState } from 'react'
import { HomeScreen } from '@/components/home/HomeScreen'
import { LoadingState } from '@/components/states/LoadingState'
import { ErrorState } from '@/components/states/ErrorState'
import { WorkbookWorkspace } from '@/components/WorkbookWorkspace'
import { ChichibooFooter } from '@/components/ChichibooFooter'
import { toWorkbookError, useWorkbookStore } from '@/hooks/use-workbook-store'
import { importFile, SUPPORTED_EXTENSION_LABEL } from '@/lib/workbook/import/registry'
import { importGoogleSheet } from '@/lib/google/client'
import { clearSession, useSessionPersistence } from '@/hooks/use-session-persistence'
import { mayHaveStoredWorkbook } from '@/lib/persistence/session-store'

const GOOGLE_HINTS = [
  'Google Sheets에서 공유 > 일반 액세스를 "링크가 있는 모든 사용자"로 변경해주세요.',
  '링크가 https://docs.google.com/spreadsheets/d/... 형태인지 확인해주세요.',
  '비공개 문서는 아직 지원하지 않습니다.',
]

const FILE_HINTS = [`지원하는 형식: ${SUPPORTED_EXTENSION_LABEL}`]

/** Flow A and Flow B: open a spreadsheet, then work with it in place. */
export function HomePage() {
  const { state, activeSheet, actions, canUndo } = useWorkbookStore()
  // Reading the workbook back is asynchronous, so without this the start screen
  // would flash for a moment before the restored file replaced it.
  const [restoring, setRestoring] = useState(mayHaveStoredWorkbook)

  useSessionPersistence({
    workbook: state.workbook,
    activeSheetId: state.activeSheetId,
    editCount: state.editCount,
    enabled: state.status === 'ready' && !state.readOnly,
    onRestore: actions.restored,
    onRestoreSettled: () => setRestoring(false),
  })

  const reset = useCallback(() => {
    void clearSession()
    actions.reset()
  }, [actions])

  const openFile = useCallback(
    async (file: File) => {
      actions.startLoading('파일을 불러오는 중…')
      try {
        actions.loaded(await importFile(file, actions.reportProgress))
      } catch (error) {
        actions.failed(toWorkbookError(error))
      }
    },
    [actions],
  )

  const openGoogleSheet = useCallback(
    async (url: string) => {
      actions.startLoading('Google Sheets에서 문서를 가져오는 중…')
      try {
        actions.loaded(await importGoogleSheet(url, actions.reportProgress))
      } catch (error) {
        actions.failed(toWorkbookError(error))
      }
    },
    [actions],
  )

  if (restoring && state.status !== 'ready') {
    return (
      <Shell>
        <LoadingState message="이전에 보던 Workbook을 여는 중…" />
      </Shell>
    )
  }

  if (state.status === 'loading') {
    return (
      <Shell>
        <LoadingState message={state.progress} />
      </Shell>
    )
  }

  if (state.status === 'error' && state.error) {
    return (
      <Shell>
        <ErrorState
          title={state.error.title}
          detail={state.error.detail}
          hints={
            state.error.kind === 'google'
              ? GOOGLE_HINTS
              : state.error.kind === 'unsupported'
                ? FILE_HINTS
                : undefined
          }
          actionLabel="처음으로"
          onAction={reset}
        />
      </Shell>
    )
  }

  if (state.status === 'ready' && state.workbook) {
    return (
      <WorkbookWorkspace
        workbook={state.workbook}
        activeSheet={activeSheet}
        activeSheetId={state.activeSheetId}
        readOnly={state.readOnly}
        edited={state.editCount > 0}
        canUndo={canUndo}
        onSelectSheet={actions.selectSheet}
        onShowOverview={actions.showOverview}
        onSetSheetIcon={actions.setSheetIcon}
        onCommitCell={actions.setCell}
        onUndo={actions.undo}
        onRedo={actions.redo}
        onReset={reset}
      />
    )
  }

  return (
    <Shell>
      <HomeScreen onFile={(file) => void openFile(file)} onGoogleSheet={(url) => void openGoogleSheet(url)} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      {children}
      <ChichibooFooter />
    </div>
  )
}
