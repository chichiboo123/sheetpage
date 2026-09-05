/**
 * Minimal toast store.
 *
 * Deliberately not `alert()` — every transient message in SheetPage surfaces
 * inside the interface, where it can be styled, dismissed and read by a screen
 * reader without stealing focus.
 */
import { useSyncExternalStore } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function showToast(message: string, tone: ToastTone = 'info', durationMs = 4000) {
  const toast: Toast = { id: nextId++, tone, message }
  toasts = [...toasts, toast]
  emit()
  window.setTimeout(() => dismissToast(toast.id), durationMs)
  return toast.id
}

export function dismissToast(id: number) {
  const next = toasts.filter((t) => t.id !== id)
  if (next.length === toasts.length) return
  toasts = next
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    subscribe,
    () => toasts,
    () => toasts,
  )
}
