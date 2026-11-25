import { ArrowRight, Bell, Box, Boxes, ChevronDown, FileStack, Home, HelpCircle, Layers3, Menu, Plus, Search, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { Button } from './ui/button'
import { Input } from './ui/input'
import type { OrderSummary, Page } from '../types'

interface ShellProps {
  activePage: Page
  onNavigate: (page: Page) => void
  onUpload: () => void
  orders: OrderSummary[]
  onOpenOrder: (id: number) => void
  children: ReactNode
}

const navigation = [
  { id: 'dashboard' as const, label: 'Overview', icon: Home },
  { id: 'orders' as const, label: 'Purchase orders', icon: FileStack },
  { id: 'catalog' as const, label: 'Products and boxes', icon: Boxes },
]

export function Shell({ activePage, onNavigate, onUpload, orders, onOpenOrder, children }: ShellProps) {
  const [query, setQuery] = useState('')
  const matches = query.trim() ? orders.filter(order => `${order.order_number} ${order.client}`.toLowerCase().includes(query.toLowerCase())).slice(0,5) : []
  const pendingCount = orders.filter(order => order.status !== 'packed').length
  const [mobileOpen, setMobileOpen] = useState(false)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 820px)').matches)
  const menuRef = useDialogFocus<HTMLElement>(() => setMobileOpen(false), false, mobileOpen, false)
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
      <a inert={mobileOpen} className="skip-link" href="#main-content">Skip to content</a>
      <aside role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined} aria-label="Workspace navigation" ref={menuRef} inert={compact && !mobileOpen} id="workspace-navigation" className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="brand-block">
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19} /></button>
          <Layers3 className="brand-symbol" size={37} strokeWidth={1.5} aria-hidden="true"/>
          <div><strong>PackFlow<span style={{ color: 'var(--brand-orange)' }}>.</span></strong><small>by Thought3D</small></div>
        </div>
        <div className="facility-label"><span>Workspace</span><strong><Boxes size={17}/> Packing planner <ChevronDown size={16}/></strong></div>
        <nav className="main-nav" aria-label="Main navigation">

          {navigation.map(({ id, label, icon: Icon }) => {
            const active = activePage === id || (id === 'orders' && activePage === 'order')
            return <button key={id} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={() => select(id)}><Icon size={19} strokeWidth={1.8} /><span>{label}</span></button>
          })}
        </nav>

        <div className="quick-actions"><p>Quick actions</p><Button variant="ghost" onClick={() => { setMobileOpen(false); onUpload() }}><Plus size={18}/> New order</Button><Button variant="ghost" onClick={() => select('catalog')}><Box size={18}/> Manage products & boxes</Button></div>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><Boxes size={52} strokeWidth={1}/><strong>From order to box</strong><p>Upload, review and find the right fit for every shipment.</p><Button variant="default" size="icon" aria-label="Create a new order" onClick={() => {setMobileOpen(false); onUpload()}}><ArrowRight size={18}/></Button></div>
          <details className="sidebar-help"><summary><HelpCircle size={18} /> How to plan an order</summary><p>1. Upload a PDF or create an order.<br />2. Review products and dimensions.<br />3. Calculate your packing plan.</p></details>
          <small className="sidebar-signature">Thought3D · Smarter packing</small>
        </div>
      </aside>
      {mobileOpen && <button className="mobile-scrim" tabIndex={-1} aria-hidden="true" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
      <main inert={mobileOpen} id="main-content" className="main-canvas" tabIndex={-1}>
        <div className="mobile-bar">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen} aria-controls="workspace-navigation"><Menu /></button>
          <span>PackFlow.</span>
          <button onClick={onUpload} aria-label="New order"><Plus /></button>
        </div>
        <div className="workspace-bar"><span>Workspace <i aria-hidden="true">/</i> <b>{currentLabel}</b></span><div className="workspace-tools"><div className="workspace-search"><Search size={18}/><Input aria-label="Search orders" placeholder="Search orders, customers…" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setQuery('')}}/>{query && <div className="search-results"><p role="status">{matches.length ? 'Matching orders' : 'No matching orders'}</p>{matches.map(order=><button key={order.id} onClick={()=>{setQuery('');onOpenOrder(order.id)}}><b>{order.order_number}</b><span>{order.client}</span></button>)}<Button variant="ghost" onClick={()=>setQuery('')}>Close search</Button></div>}</div><Button variant="secondary" size="icon" aria-label={`View orders: ${pendingCount} need attention`} onClick={()=>select('orders')} className="notification-button"><Bell size={19}/>{pendingCount>0 && <i/>}</Button><Button onClick={onUpload}><Plus size={16}/><span>New order</span></Button></div></div>
        {children}
      </main>
    </div>
  )
}
