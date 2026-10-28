import { useEffect, useRef } from 'react'

/** Keep keyboard navigation inside an open dialog and restore the opener on close. */
export function useDialogFocus<T extends HTMLElement = HTMLElement>(onClose: () => void, busy = false, enabled = true) {
  const panelRef = useRef<T | null>(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  closeRef.current = onClose
  busyRef.current = busy

  useEffect(() => {
    if (!enabled) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href]') || []).filter(element => element.getClientRects().length > 0)
    focusable()[0]?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); return }
      const outside = !panelRef.current?.contains(document.activeElement)
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [enabled])
  return panelRef
}
