import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { Shell } from './components/Shell'
import { DeleteOrdersDialog } from './components/DeleteOrdersDialog'
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
  const [connectionError, setConnectionError] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
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
      .catch((error) => { setConnectionError(true); notify(error instanceof Error ? error.message : 'Could not connect to the API.', true) })
      .finally(() => setLoading(false))
  }, [loadCatalog, loadOverview, notify])

  const openOrder = async (id: number) => {
    setLoading(true)
    try {
      setOrder(await api.order(id))
      setPage('order')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The order could not be opened.', true)
    } finally { setLoading(false) }
  }

  const refreshCurrentOrder = async () => {
    if (!order) return
    setOrder(await api.order(order.id))
    await loadOverview()
  }

  const finishPackingPlan = async () => {
    await loadOverview()
    setOrder(null)
    setPage('dashboard')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    notify('Packing plan and PDF saved. You’re back at the overview.')
  }

  const deleteOrders = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      const result = await api.deleteAllOrders()
      setOrder(null)
      await loadOverview()
      setDeleteOpen(false)
      setPage('dashboard')
      notify(`${result.deleted_orders} orders deleted.`)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Orders could not be deleted. Please try again.')
    } finally { setDeleting(false) }
  }

  const showDeleteOrders = () => { setDeleteError(''); setDeleteOpen(true) }

  const navigate = (next: Page) => {
    if (next !== 'order') setPage(next)
  }

  return (
    <Shell activePage={page} onNavigate={navigate} onUpload={() => setUploadOpen(true)}>
      {loading && !dashboard ? (
        <div className="app-loader"><div className="loader-cube"><i /><i /><i /></div><LoaderCircle className="spin" /><span>Preparing your workspace…</span></div>
      ) : (
        <>
          {page === 'dashboard' && !dashboard && connectionError && <div className="connection-error"><AlertCircle size={36} /><h1>We could not load your workspace</h1><p>Check that the server is available and try again.</p><button className="button button--accent" onClick={() => window.location.reload()}>Try again</button></div>}
          {page === 'dashboard' && dashboard && <Dashboard data={dashboard} onDeleteAll={showDeleteOrders} onOpenOrder={openOrder} onUpload={() => setUploadOpen(true)} />}
          {page === 'orders' && <Orders orders={orders} onDeleteAll={showDeleteOrders} onOpen={openOrder} />}
          {page === 'catalog' && <Catalog products={products} boxes={boxes} onRefresh={loadCatalog} notify={(message) => notify(message)} />}
          {page === 'order' && order && <OrderDetail order={order} onBack={() => setPage('orders')} onRefresh={refreshCurrentOrder} onSaved={finishPackingPlan} notify={notify} />}
        </>
      )}
      {loading && dashboard && <div className="route-loader"><LoaderCircle className="spin" /></div>}
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onComplete={(created) => { setUploadOpen(false); setOrder(created); setPage('order'); window.scrollTo({ top: 0, behavior: 'smooth' }); loadOverview().catch(() => notify('The order was created, but the overview could not be refreshed.', true)); notify(created.source_type === 'email' ? 'Email processed. Review the products and quantities before calculating.' : created.source_type === 'manual' ? 'Order created. Complete the review before calculating.' : 'PDF processed. Review the extracted details.')}} />}
      {deleteOpen && <DeleteOrdersDialog count={orders.length} busy={deleting} error={deleteError} onClose={() => setDeleteOpen(false)} onConfirm={deleteOrders} />}
      {notice && <div role={notice.error ? 'alert' : 'status'} className={`toast ${notice.error ? 'toast--error' : ''}`}>{notice.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{notice.message}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></div>}
    </Shell>
  )
}

export default App
