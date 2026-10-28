import {
  Boxes,
  FileStack,
  Gauge,
  HelpCircle,
  Menu,
  PackageSearch,
  PanelLeftClose,
  Settings,
  Upload,
  X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Page } from '../types'

interface ShellProps {
  activePage: Page
  onNavigate: (page: Page) => void
  onUpload: () => void
  children: ReactNode
}

const navigation = [
  { id: 'dashboard' as const, label: 'Control', icon: Gauge },
  { id: 'orders' as const, label: 'Órdenes', icon: FileStack },
  { id: 'catalog' as const, label: 'Catálogo', icon: Boxes },
]

export function Shell({ activePage, onNavigate, onUpload, children }: ShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const select = (page: Page) => {
    onNavigate(page)
    setMobileOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="brand-block">
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
            <X size={19} />
          </button>
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>PACKFLOW</strong>
            <small>PACKING INTELLIGENCE</small>
          </div>
        </div>

        <div className="facility-label">
          <span>Centro operativo</span>
          <strong>MLA / BIRKIRKARA</strong>
          <i />
        </div>

        <nav className="main-nav" aria-label="Navegación principal">
          <p>ESPACIO DE TRABAJO</p>
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={activePage === id || (id === 'orders' && activePage === 'order') ? 'active' : ''}
              onClick={() => select(id)}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{label}</span>
              {id === 'orders' && <em>03</em>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button><Settings size={18} /> Configuración</button>
          <button><HelpCircle size={18} /> Centro de ayuda</button>
          <div className="operator-card">
            <div className="operator-avatar">KR</div>
            <div><strong>Kevin R.</strong><span>Operador</span></div>
            <PanelLeftClose size={17} />
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}

      <main className="main-canvas">
        <div className="mobile-bar">
          <button onClick={() => setMobileOpen(true)} aria-label="Abrir menú"><Menu /></button>
          <span>PACKFLOW</span>
          <button onClick={onUpload} aria-label="Nueva orden"><Upload /></button>
        </div>
        {children}
      </main>

      <button className="quick-scan" onClick={onUpload}>
        <PackageSearch size={19} />
        <span>NUEVO ANÁLISIS</span>
      </button>
    </div>
  )
}

