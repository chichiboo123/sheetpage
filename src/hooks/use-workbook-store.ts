/**
 * The single source of truth for the open Workbook.
 *
 * Edits go through a reducer so every change is one place, and every change
 * records enough to be undone. Structural sharing keeps a sheet switch and a
 * cell edit from re-cloning the whole workbook: only the sheet that actually
 * changed gets a new object identity, which is what lets the grid skip work.
 */
import { useMemo, useReducer } from 'react'
import {
  cellFromInput,
  cellKey,
  type Cell,
  type Sheet,
  type Workbook,
} from '@/lib/workbook/model'

export type LoadStatus = 'empty' | 'loading' | 'ready' | 'error'

export interface WorkbookError {
  title: string
  detail?: string
  /** Distinguishes the error screens from one another. */
  kind: 'unsupported' | 'too-large' | 'parse' | 'google' | 'share' | 'unknown'
}

interface EditEntry {
  sheetId: string
  key: string
  before: Cell | undefined
  after: Cell | undefined
  beforeRows: number
  beforeCols: number
}

export interface WorkbookState {
  workbook: Workbook | null
  activeSheetId: string | null
  status: LoadStatus
  progress: string
  error: WorkbookError | null
  /** True when the workbook came from a share link and must not be edited. */
  readOnly: boolean
  editCount: number
  undoStack: EditEntry[]
  redoStack: EditEntry[]
}

type Action =
  | { type: 'loading'; message: string }
  | { type: 'progress'; message: string }
  | { type: 'loaded'; workbook: Workbook; readOnly: boolean }
  | { type: 'restored'; workbook: Workbook; activeSheetId: string | null; editCount: number }
  | { type: 'failed'; error: WorkbookError }
  | { type: 'reset' }
  | { type: 'selectSheet'; sheetId: string }
  | { type: 'showOverview' }
  | { type: 'setCell'; sheetId: string; r: number; c: number; input: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'rename'; title: string }

export const initialWorkbookState: WorkbookState = {
  workbook: null,
  activeSheetId: null,
  status: 'empty',
  progress: '',
  error: null,
  readOnly: false,
  editCount: 0,
  undoStack: [],
  redoStack: [],
}

/** Replace one sheet, leaving every other sheet's identity untouched. */
function replaceSheet(workbook: Workbook, sheet: Sheet): Workbook {
  return {
    ...workbook,
    sheets: workbook.sheets.map((s) => (s.sheetId === sheet.sheetId ? sheet : s)),
  }
}

function withCell(sheet: Sheet, key: string, cell: Cell | undefined, r: number, c: number): Sheet {
  const cells = { ...sheet.cells }
  if (cell === undefined) delete cells[key]
  else cells[key] = cell
  return {
    ...sheet,
    cells,
    rows: Math.max(sheet.rows, r + 1),
    cols: Math.max(sheet.cols, c + 1),
  }
}

function applyEntry(state: WorkbookState, entry: EditEntry, direction: 'undo' | 'redo'): WorkbookState {
  if (!state.workbook) return state
  const sheet = state.workbook.sheets.find((s) => s.sheetId === entry.sheetId)
  if (!sheet) return state

  const [r, c] = entry.key.split(':').map(Number)
  const target = direction === 'undo' ? entry.before : entry.after

  let next = withCell(sheet, entry.key, target, r, c)
  if (direction === 'undo') {
    next = { ...next, rows: entry.beforeRows, cols: entry.beforeCols }
  }

  return {
    ...state,
    workbook: replaceSheet(state.workbook, next),
    activeSheetId: entry.sheetId,
    editCount: direction === 'undo' ? Math.max(0, state.editCount - 1) : state.editCount + 1,
    undoStack: direction === 'undo' ? state.undoStack.slice(0, -1) : [...state.undoStack, entry],
    redoStack: direction === 'undo' ? [...state.redoStack, entry] : state.redoStack.slice(0, -1),
  }
}

const UNDO_LIMIT = 200

function reducer(state: WorkbookState, action: Action): WorkbookState {
  switch (action.type) {
    case 'loading':
      return { ...initialWorkbookState, status: 'loading', progress: action.message }

    case 'progress':
      return state.status === 'loading' ? { ...state, progress: action.message } : state

    case 'loaded': {
      const first = action.workbook.sheets[0]
      return {
        ...initialWorkbookState,
        workbook: action.workbook,
        activeSheetId: first ? first.sheetId : null,
        status: 'ready',
        readOnly: action.readOnly,
      }
    }

    // A restore differs from a load in one way: it returns to the sheet the
    // user was reading, not to the first one.
    case 'restored': {
      const known = action.workbook.sheets.some((s) => s.sheetId === action.activeSheetId)
      return {
        ...initialWorkbookState,
        workbook: action.workbook,
        activeSheetId: known ? action.activeSheetId : (action.workbook.sheets[0]?.sheetId ?? null),
        status: 'ready',
        // Undo history is not carried across a reload, but the fact that the
        // workbook was edited is.
        editCount: action.editCount,
      }
    }

    case 'failed':
      return { ...initialWorkbookState, status: 'error', error: action.error }

    case 'reset':
      return initialWorkbookState

    case 'selectSheet':
      return state.activeSheetId === action.sheetId
        ? state
        : { ...state, activeSheetId: action.sheetId }

    // A null active sheet is the workbook's own index page, not an error state.
    case 'showOverview':
      return state.activeSheetId === null ? state : { ...state, activeSheetId: null }

    case 'setCell': {
      if (!state.workbook || state.readOnly) return state
      const sheet = state.workbook.sheets.find((s) => s.sheetId === action.sheetId)
      if (!sheet) return state

      const key = cellKey(action.r, action.c)
      const before = sheet.cells[key]
      const after = cellFromInput(action.input, before)

      // A no-op edit should not dirty the workbook or grow the undo stack.
      if (sameCell(before, after)) return state

      const entry: EditEntry = {
        sheetId: action.sheetId,
        key,
        before,
        after,
        beforeRows: sheet.rows,
        beforeCols: sheet.cols,
      }

      return {
        ...state,
        workbook: replaceSheet(state.workbook, withCell(sheet, key, after, action.r, action.c)),
        editCount: state.editCount + 1,
        undoStack: [...state.undoStack, entry].slice(-UNDO_LIMIT),
        redoStack: [],
      }
    }

    case 'undo': {
      const entry = state.undoStack.at(-1)
      return entry ? applyEntry(state, entry, 'undo') : state
    }

    case 'redo': {
      const entry = state.redoStack.at(-1)
      return entry ? applyEntry(state, entry, 'redo') : state
    }

    case 'rename':
      return state.workbook ? { ...state, workbook: { ...state.workbook, title: action.title } } : state

    default:
      return state
  }
}

function sameCell(a: Cell | undefined, b: Cell | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  return a.v === b.v && a.f === b.f && a.t === b.t
}

export function useWorkbookStore() {
  const [state, dispatch] = useReducer(reducer, initialWorkbookState)

  const activeSheet = useMemo(() => {
    if (!state.workbook || !state.activeSheetId) return null
    return state.workbook.sheets.find((s) => s.sheetId === state.activeSheetId) ?? null
  }, [state.workbook, state.activeSheetId])

  const actions = useMemo(
    () => ({
      startLoading: (message: string) => dispatch({ type: 'loading', message }),
      reportProgress: (message: string) => dispatch({ type: 'progress', message }),
      loaded: (workbook: Workbook, readOnly = false) =>
        dispatch({ type: 'loaded', workbook, readOnly }),
      restored: (workbook: Workbook, activeSheetId: string | null, editCount: number) =>
        dispatch({ type: 'restored', workbook, activeSheetId, editCount }),
      failed: (error: WorkbookError) => dispatch({ type: 'failed', error }),
      reset: () => dispatch({ type: 'reset' }),
      selectSheet: (sheetId: string) => dispatch({ type: 'selectSheet', sheetId }),
      showOverview: () => dispatch({ type: 'showOverview' }),
      setCell: (sheetId: string, r: number, c: number, input: string) =>
        dispatch({ type: 'setCell', sheetId, r, c, input }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      rename: (title: string) => dispatch({ type: 'rename', title }),
    }),
    [],
  )

  const canUndo = state.undoStack.length > 0
  const canRedo = state.redoStack.length > 0

  return { state, activeSheet, actions, canUndo, canRedo }
}

export type WorkbookActions = ReturnType<typeof useWorkbookStore>['actions']

/** Turns any thrown importer/loader error into a screen the user can act on. */
export function toWorkbookError(error: unknown): WorkbookError {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const named = error as { name: string; message: string; code?: string }
    if (named.name === 'UnsupportedFileError') {
      return { kind: 'unsupported', title: '지원하지 않는 파일 형식입니다.', detail: named.message }
    }
    if (named.name === 'FileTooLargeError') {
      return {
        kind: 'too-large',
        title: '파일이 너무 큽니다.',
        detail: '25MB 이하의 파일을 열 수 있습니다.',
      }
    }
    if (named.name === 'GoogleImportError') {
      return { kind: 'google', title: named.message }
    }
    if (named.name === 'ShareError') {
      return { kind: 'share', title: named.message }
    }
    if (named.name === 'SpreadsheetWorkerError') {
      return {
        kind: 'parse',
        title: '파일을 분석하지 못했습니다.',
        detail: '파일이 손상되었거나 암호로 보호되어 있을 수 있습니다.',
      }
    }
  }
  return {
    kind: 'unknown',
    title: '문제가 발생했습니다.',
    detail: error instanceof Error ? error.message : undefined,
  }
}
