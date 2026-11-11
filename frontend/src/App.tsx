import { Button } from './components/ui/button'
import { AlertCircle, CheckCircle2, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
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

  const focusedRoute = useRef('')
  useEffect(() => {
    if (loading) return
    const route = `${page}:${page === 'order' ? order?.id : ''}`
    if (focusedRoute.current === route) return
    focusedRoute.current = route
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('#main-content h1')
      if (heading) { heading.tabIndex = -1; heading.focus({preventScroll: true}) }
    })
    return () => cancelAnimationFrame(frame)
  }, [page, order?.id, loading])

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  const notify = useCallback((message: string, error = false) => {
    setNotice({ message, error })
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), error ? 9000 : 5000)
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
    notify('Overview refreshed.')
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
    <Shell orders={orders} onOpenOrder={openOrder} activePage={page} onNavigate={navigate} onUpload={() => setUploadOpen(true)}>
      {loading && !dashboard ? (
        <div className="app-loader" role="status"><div className="loader-cube"><i /><i /><i /></div><LoaderCircle className="spin" /><span>Preparing your workspace…</span></div>
      ) : (
        <>
          {page === 'dashboard' && !dashboard && connectionError && <div className="connection-error"><AlertCircle size={36} /><h1>We could not load your workspace</h1><p>Check that the server is available and try again.</p><Button className="button button--accent" onClick={() => window.location.reload()}>Try again</Button></div>}
          {page === 'dashboard' && dashboard && <Dashboard onViewOrders={() => navigate('orders')} data={dashboard} onOpenOrder={openOrder} onUpload={() => setUploadOpen(true)} />}
          {page === 'orders' && <Orders orders={orders} onDeleteAll={showDeleteOrders} onOpen={openOrder} />}
          {page === 'catalog' && <Catalog products={products} boxes={boxes} onRefresh={loadCatalog} notify={notify} />}
          {page === 'order' && order && <OrderDetail order={order} onBack={() => setPage('orders')} onRefresh={refreshCurrentOrder} onSaved={finishPackingPlan} notify={notify} />}
        </>
      )}
      {loading && dashboard && <div className="route-loader" role="status" aria-label="Loading order"><LoaderCircle className="spin" /></div>}
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onComplete={(created) => { setUploadOpen(false); setOrder(created); setPage('order'); window.scrollTo({ top: 0, behavior: 'smooth' }); loadOverview().catch(() => notify('The order was created, but the overview could not be refreshed.', true)); notify(created.source_type === 'email' ? 'Email processed. Review the products and quantities before calculating.' : created.source_type === 'manual' ? 'Order created. Complete the review before calculating.' : 'PDF processed. Review the extracted details.')}} />}
      {deleteOpen && <DeleteOrdersDialog count={orders.length} busy={deleting} error={deleteError} onClose={() => setDeleteOpen(false)} onConfirm={deleteOrders} />}
      {notice && <div role={notice.error ? 'alert' : 'status'} className={`toast ${notice.error ? 'toast--error' : ''}`}>{notice.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<span>{notice.message}</span><button aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={15} /></button></div>}
    </Shell>
  )
}

export default App
