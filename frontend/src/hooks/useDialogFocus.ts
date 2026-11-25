import { useEffect, useRef } from 'react'

/** Trap focus, isolate background content, and restore the opener when it still exists. */
export function useDialogFocus<T extends HTMLElement = HTMLElement>(onClose: () => void, busy = false, enabled = true, isolate = true) {
  const panelRef = useRef<T | null>(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  closeRef.current = onClose
  busyRef.current = busy

  useEffect(() => {
    const panel = panelRef.current
    if (!enabled || !panel) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const previousTabIndex = panel.getAttribute('tabindex')
    const isolated: {element: HTMLElement; inert: boolean}[] = []
    // Walk the ancestor path so this also works for an expanded viewer inside a page.
    // The mobile menu already isolates its main content through React's inert prop.
    if (isolate) {
      let branch: HTMLElement = panel.closest<HTMLElement>('[aria-modal="true"]') || panel
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling instanceof HTMLElement && sibling !== branch && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) {
            isolated.push({element: sibling, inert: sibling.inert})
            sibling.inert = true
          }
        }
        if (branch.parentElement === document.body) break
        branch = branch.parentElement
      }
    }
    document.body.style.overflow = 'hidden'
    panel.tabIndex = -1
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]',
    )).filter(element => element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
    const focusFirst = () => (focusable()[0] || panel).focus({preventScroll: true})
    focusFirst()
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) focusFirst()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busyRef.current) closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); panel.focus(); return }
      const outside = !panel.contains(document.activeElement) || document.activeElement === panel
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('focusin', containFocus)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('focusin', containFocus)
      document.removeEventListener('keydown', handleKey)
      isolated.forEach(({element, inert}) => { element.inert = inert })
      document.body.style.overflow = previousOverflow
      if (previousTabIndex === null) panel.removeAttribute('tabindex')
      else panel.setAttribute('tabindex', previousTabIndex)
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({preventScroll: true})
      else {
        const fallback = document.querySelector<HTMLElement>('main h1, main')
        if (fallback && !fallback.closest('[inert]')) { fallback.tabIndex = -1; fallback.focus({preventScroll: true}) }
      }
    }
  }, [enabled, isolate])
  return panelRef
}
