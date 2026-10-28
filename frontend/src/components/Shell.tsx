import { Boxes, FileStack, Gauge, HelpCircle, Menu, Plus, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'
import type { Page } from '../types'

interface ShellProps {
  activePage: Page
  onNavigate: (page: Page) => void
  onUpload: () => void
  children: ReactNode
}

const navigation = [
  { id: 'dashboard' as const, label: 'Overview', icon: Gauge },
  { id: 'orders' as const, label: 'Purchase orders', icon: FileStack },
  { id: 'catalog' as const, label: 'Products and boxes', icon: Boxes },
]

export function Shell({ activePage, onNavigate, onUpload, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 820px)').matches)
  const menuRef = useDialogFocus<HTMLElement>(() => setMobileOpen(false), false, mobileOpen)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 820px)')
    const update = () => { setCompact(media.matches); if (!media.matches) setMobileOpen(false) }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!mobileOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [mobileOpen])

  const select = (page: Page) => {
    onNavigate(page)
    setMobileOpen(false)
  }
  const currentLabel = activePage === 'order' ? 'Order details' : navigation.find(({ id }) => id === activePage)?.label

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside ref={menuRef} inert={compact && !mobileOpen} id="workspace-navigation" className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="brand-block">
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19} /></button>
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>PackFlow<span style={{ color: 'var(--brand-orange)' }}>.</span></strong><small>by Thought3D</small></div>
        </div>
        <div className="facility-label"><span>Your workspace</span><strong>Packing planner</strong></div>
        <nav className="main-nav" aria-label="Main navigation">
          <p>WORKSPACE</p>
          {navigation.map(({ id, label, icon: Icon }) => {
            const active = activePage === id || (id === 'orders' && activePage === 'order')
            return <button key={id} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => select(id)}><Icon size={19} strokeWidth={1.8} /><span>{label}</span></button>
          })}
        </nav>
        <button className="sidebar-new" onClick={() => { setMobileOpen(false); onUpload() }}><Plus size={18} /> New order</button>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><HelpCircle size={21} /><strong>From order to box</strong><p>1. Upload a PDF or create an order.<br />2. Review products and dimensions.<br />3. Calculate your packing plan.</p></div>
          <small className="sidebar-signature">Thought3D · Smarter packing</small>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
      <main inert={mobileOpen} id="main-content" className="main-canvas" tabIndex={-1}>
        <div className="mobile-bar">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen} aria-controls="workspace-navigation"><Menu /></button>
          <span>PackFlow.</span>
          <button onClick={onUpload} aria-label="New order"><Plus /></button>
        </div>
        <div className="workspace-bar"><span>Workspace <i>/</i> <b>{currentLabel}</b></span><button className="button button--accent" onClick={onUpload}><Plus size={17} /> New order</button></div>
        {children}
      </main>
    </div>
  )
}
