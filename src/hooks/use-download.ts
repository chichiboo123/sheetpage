import { useCallback, useState } from 'react'
import { downloadFileName } from '@/lib/workbook/export/xlsx'
import { exportWorkbookToXlsx } from '@/lib/workbook/worker-client'
import type { Workbook } from '@/lib/workbook/model'
import { showToast } from './use-toast'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Builds the .xlsx in the worker, then hands it to the browser as a download. */
export function useWorkbookDownload() {
  const [downloading, setDownloading] = useState(false)

  const download = useCallback(async (workbook: Workbook) => {
    setDownloading(true)
    let objectUrl: string | undefined
    try {
      const buffer = await exportWorkbookToXlsx(workbook)
      const blob = new Blob([buffer], { type: XLSX_MIME })
      objectUrl = URL.createObjectURL(blob)

      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = downloadFileName(workbook.title)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()

      showToast('xlsx 파일을 내려받았습니다.', 'success')
    } catch {
      showToast('다운로드에 실패했습니다. 잠시 후 다시 시도해주세요.', 'error')
    } finally {
      if (objectUrl) {
        const created = objectUrl
        setTimeout(() => URL.revokeObjectURL(created), 60_000)
      }
      setDownloading(false)
    }
  }, [])

  return { downloading, download }
}
