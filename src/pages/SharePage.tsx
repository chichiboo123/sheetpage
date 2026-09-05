import { useCallback, useEffect } from 'react'
import { useLocation } from 'wouter'
import { LoadingState } from '@/components/states/LoadingState'
import { ErrorState } from '@/components/states/ErrorState'
import { WorkbookWorkspace } from '@/components/WorkbookWorkspace'
import { ChichibooFooter } from '@/components/ChichibooFooter'
import { toWorkbookError, useWorkbookStore } from '@/hooks/use-workbook-store'
import { fetchShare } from '@/lib/share/client'

/** Flow C: someone else's snapshot, opened in the same viewer, read-only. */
export function SharePage({ shareId }: { shareId: string }) {
  const { state, activeSheet, actions } = useWorkbookStore()
  const [, navigate] = useLocation()

  const load = useCallback(async () => {
    actions.startLoading('공유된 Workbook을 불러오는 중…')
    try {
      const snapshot = await fetchShare(shareId)
      actions.loaded({ ...snapshot.workbook, title: snapshot.title }, true)
    } catch (error) {
      actions.failed(toWorkbookError(error))
    }
  }, [actions, shareId])

  useEffect(() => {
    void load()
    // Re-running on `load` identity would refetch on every render of the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareId])

  if (state.status === 'error' && state.error) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas">
        <ErrorState
          title={state.error.title}
          detail="링크가 잘못되었거나, 만료되어 더 이상 볼 수 없는 Workbook입니다."
          hints={['공유한 사람에게 새 링크를 요청해주세요.']}
          actionLabel="SheetPage 시작하기"
          onAction={() => navigate('/')}
        />
        <ChichibooFooter />
      </div>
    )
  }

  if (state.status !== 'ready' || !state.workbook) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas">
        <LoadingState message={state.progress} />
        <ChichibooFooter />
      </div>
    )
  }

  return (
    <WorkbookWorkspace
      workbook={state.workbook}
      activeSheet={activeSheet}
      activeSheetId={state.activeSheetId}
      readOnly
      edited={false}
      canUndo={false}
      onSelectSheet={actions.selectSheet}
      onCommitCell={() => undefined}
      onUndo={() => undefined}
      onRedo={() => undefined}
      onReset={() => navigate('/')}
    />
  )
}
