import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { showToast } from '@/hooks/use-toast'
import { createShare, ShareError, type ShareResult } from '@/lib/share/client'
import type { Workbook } from '@/lib/workbook/model'

interface ShareDialogProps {
  workbook: Workbook
  onClose: () => void
}

type Phase = 'idle' | 'creating' | 'done' | 'error'

/**
 * Creating a share link.
 *
 * A share is a snapshot, not a live document: whoever opens the link sees the
 * workbook exactly as it was when the link was made, read-only. Saying so here
 * is cheaper than having someone discover it later.
 */
export function ShareDialog({ workbook, onClose }: ShareDialogProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<ShareResult | null>(null)
  const [error, setError] = useState<string>('')
  const linkRef = useRef<HTMLInputElement>(null)

  const create = async () => {
    setPhase('creating')
    try {
      const created = await createShare(workbook)
      setResult(created)
      setPhase('done')
    } catch (caught) {
      setError(caught instanceof ShareError ? caught.message : '공유 링크를 만들지 못했습니다.')
      setPhase('error')
    }
  }

  const copy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.url)
      showToast('공유 링크를 복사했습니다.', 'success')
    } catch {
      // Clipboard access can be denied; select the text so it can be copied by hand.
      linkRef.current?.select()
      showToast('링크를 직접 복사해주세요.', 'info')
    }
  }

  return (
    <Modal open title="공유" onClose={onClose}>
      {phase === 'done' && result ? (
        <div>
          <p className="text-[13.5px] leading-relaxed text-ink-600">
            링크를 받은 사람은 SheetPage에서 이 Workbook을 열어 시트를 탐색하고 xlsx로 내려받을 수
            있습니다.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              ref={linkRef}
              readOnly
              value={result.url}
              aria-label="공유 링크"
              onFocus={(event) => event.target.select()}
              className="h-10 min-w-0 flex-1 rounded-md border border-ink-200 bg-ink-50 px-3 font-mono text-[13px] text-ink-800"
            />
            <Button variant="primary" onClick={copy}>
              <Icon name="content_copy" className="text-[17px]" />
              복사
            </Button>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-400">
            <Icon name="lock" className="mt-px shrink-0 text-[14px]" />
            <span>
              공유받은 사람은 읽기 전용으로 볼 수 있습니다. 링크는{' '}
              {new Date(result.expiresAt).toLocaleDateString('ko-KR')}까지 유효합니다.
            </span>
          </p>
        </div>
      ) : phase === 'error' ? (
        <div>
          <p className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2.5 text-[13.5px] leading-relaxed text-ink-700">
            <Icon name="error_outline" className="mt-px shrink-0 text-[17px] text-danger-600" />
            {error}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={onClose}>닫기</Button>
            <Button variant="primary" onClick={create}>
              다시 시도
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-[13.5px] leading-relaxed text-ink-600">
            지금 화면의 Workbook을 그대로 저장해 링크를 만듭니다. 수정한 내용도 함께 포함됩니다.
          </p>
          <ul className="mt-3 space-y-1.5 rounded-md bg-ink-50 px-4 py-3 text-[13px] text-ink-600">
            <li className="flex gap-2">
              <Icon name="check" className="mt-px shrink-0 text-[15px] text-brand-600" />
              시트 탐색 · 검색 · xlsx 다운로드 가능
            </li>
            <li className="flex gap-2">
              <Icon name="check" className="mt-px shrink-0 text-[15px] text-brand-600" />
              공유받은 사람은 읽기 전용
            </li>
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={onClose}>취소</Button>
            <Button variant="primary" onClick={create} disabled={phase === 'creating'}>
              {phase === 'creating' ? '만드는 중…' : '공유 링크 만들기'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
