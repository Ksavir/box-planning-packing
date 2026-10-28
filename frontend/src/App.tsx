import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Shell } from './components/Shell'
import { UploadModal } from './components/UploadModal'
import { Catalog } from './pages/Catalog'
import { Dashboard } from './pages/Dashboard'
import { OrderDetail } from './pages/OrderDetail'
import { Orders } from './pages/Orders'
import type { BoxType, DashboardData, OrderDetailData, OrderSummary, Page, Product } from './types'

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [boxes, setBoxes] = useState<BoxType[]>([])
  const [order, setOrder] = useState<OrderDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null)

  const notify = useCallback((message: string, error = false) => {
    setNotice({ message, error })
    window.setTimeout(() => setNotice(null), 4200)
  }, [])

  const loadOverview = useCallback(async () => {
    const [dashboardData, orderData] = await Promise.all([api.dashboard(), api.orders()])
    setDashboard(dashboardData)
    setOrders(orderData)
  }, [])

  const loadCatalog = useCallback(async () => {
    const [productData, boxData] = await Promise.all([api.products(), api.boxes()])
    setProducts(productData)
    setBoxes(boxData)
  }, [])

  useEffect(() => {
    Promise.all([loadOverview(), loadCatalog()])
      .catch((error) => notify(error instanceof Error ? error.message : 'No se pudo conectar con la API.', true))
      .finally(() => setLoading(false))
  }, [loadCatalog, loadOverview, notify])

  const openOrder = async (id: number) => {
    setLoading(true)
    try {
      setOrder(await api.order(id))
      setPage('order')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo abrir la orden.', true)
    } finally { setLoading(false) }
  }

  const refreshCurrentOrder = async () => {
    if (!order) return
    setOrder(await api.order(order.id))
    await loadOverview()
  }

  const navigate = (next: Page) => {
    if (next !== 'order') setPage(next)
  }

  return (
    <Shell activePage={page} onNavigate={navigate} onUpload={() => setUploadOpen(true)}>
      {loading && !dashboard ? (
        <div className="app-loader"><div className="loader-cube"><i /><i /><i /></div><LoaderCircle className="spin" /><span>Preparando centro de carga…</span></div>
      ) : (
        <>
          {page === 'dashboard' && dashboard && <Dashboard data={dashboard} onOpenOrder={openOrder} onUpload={() => setUploadOpen(true)} />}
          {page === 'orders' && <Orders orders={orders} onOpen={openOrder} />}
          {page === 'catalog' && <Catalog products={products} boxes={boxes} onRefresh={loadCatalog} notify={(message) => notify(message)} />}
          {page === 'order' && order && <OrderDetail order={order} onBack={() => setPage('orders')} onRefresh={refreshCurrentOrder} notify={(message) => notify(message)} />}
        </>
      )}
      {loading && dashboard && <div className="route-loader"><LoaderCircle className="spin" /></div>}
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onComplete={(created) => { setUploadOpen(false); setOrder(created); setPage('order'); window.scrollTo({ top: 0, behavior: 'smooth' }); loadOverview(); notify(created.source_type === 'manual' ? 'Orden registrada. Completa la revisión antes de calcular.' : 'PDF procesado. Revisa los datos extraídos.')}} />}
      {notice && <div className={`toast ${notice.error ? 'toast--error' : ''}`}>{notice.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{notice.message}</span><button onClick={() => setNotice(null)}><X size={15} /></button></div>}
    </Shell>
  )
}

export default App
