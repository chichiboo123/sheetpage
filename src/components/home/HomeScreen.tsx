import { useCallback, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Logo } from '@/components/Logo'
import { FILE_ACCEPT, SUPPORTED_EXTENSION_LABEL } from '@/lib/workbook/import/registry'
import { isGoogleSheetsUrl } from '@/lib/google/url'

interface HomeScreenProps {
  onFile: (file: File) => void
  onGoogleSheet: (url: string) => void
}

/**
 * The first screen: one message and two ways in. Everything else — recent
 * files, tips, feature grids — would get in the way of the only two things a
 * visitor came here to do.
 */
export function HomeScreen({ onFile, onGoogleSheet }: HomeScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer.files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  const submitUrl = (event: FormEvent) => {
    event.preventDefault()
    const value = url.trim()
    if (value === '') {
      setUrlError('Google Sheets 링크를 입력해주세요.')
      return
    }
    if (!isGoogleSheetsUrl(value) && !/^[a-zA-Z0-9-_]{25,}$/.test(value)) {
      setUrlError('올바른 Google Sheets 링크인지 확인해주세요.')
      return
    }
    setUrlError(null)
    onGoogleSheet(value)
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-5 py-12 sm:py-16">
      <div className="w-full max-w-xl">
        <Logo className="mb-8" />

        <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-ink-900 sm:text-[38px]">
          Spreadsheet를 Page처럼.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-500 sm:text-base">
          복잡한 Excel과 Google Sheets를 웹페이지처럼 편하게 탐색하세요.
        </p>

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`mt-8 rounded-lg border border-dashed px-6 py-9 text-center transition-colors ${
            dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-300 bg-white'
          }`}
        >
          <Icon
            name="upload_file"
            className={`text-[30px] ${dragging ? 'text-brand-600' : 'text-ink-400'}`}
          />
          <p className="mt-2 text-[14px] text-ink-600">
            파일을 여기에 끌어다 놓거나 아래 버튼을 눌러주세요.
          </p>
          <Button
            variant="primary"
            size="lg"
            className="mt-4"
            onClick={() => inputRef.current?.click()}
          >
            Excel 파일 열기
          </Button>
          <p className="mt-3 text-2xs text-ink-400">{SUPPORTED_EXTENSION_LABEL}</p>
          <input
            ref={inputRef}
            type="file"
            accept={FILE_ACCEPT}
            className="sr-only"
            aria-label="Excel 파일 선택"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onFile(file)
              event.target.value = ''
            }}
          />
        </div>

        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-ink-200" />
          <span className="text-2xs text-ink-400">또는</span>
          <span className="h-px flex-1 bg-ink-200" />
        </div>

        <form onSubmit={submitUrl} noValidate>
          <label htmlFor="gs-url" className="mb-1.5 block text-[13px] font-medium text-ink-700">
            Google Sheets 열기
          </label>
          <div className="flex gap-2">
            <input
              id="gs-url"
              type="text"
              inputMode="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                if (urlError) setUrlError(null)
              }}
              placeholder="Google Sheets 링크 붙여넣기"
              aria-invalid={urlError ? true : undefined}
              aria-describedby={urlError ? 'gs-url-error' : 'gs-url-hint'}
              className="h-11 min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-3 text-[14px] text-ink-900 placeholder:text-ink-400 focus:border-brand-400"
            />
            <Button type="submit" size="lg">
              불러오기
            </Button>
          </div>
          {urlError ? (
            <p id="gs-url-error" role="alert" className="mt-1.5 text-[13px] text-danger-600">
              {urlError}
            </p>
          ) : (
            <p id="gs-url-hint" className="mt-1.5 text-2xs text-ink-400">
              링크가 있는 모든 사용자에게 공개된 문서를 불러올 수 있습니다.
            </p>
          )}
        </form>
      </div>
    </main>
  )
}
