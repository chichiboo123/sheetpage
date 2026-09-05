import { Logo } from '@/components/Logo'

/** Shown while a workbook is being fetched, decoded and converted. */
export function LoadingState({ message }: { message: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-16" aria-busy="true">
      <Logo className="mb-8" />
      <div
        className="h-6 w-6 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600"
        role="status"
        aria-label="불러오는 중"
      />
      <p className="mt-4 text-[14px] text-ink-600">{message || 'Workbook을 분석하는 중…'}</p>
      <p className="mt-1 text-2xs text-ink-400">파일은 브라우저 안에서 처리됩니다.</p>
    </main>
  )
}
