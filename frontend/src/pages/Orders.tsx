import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { ArrowUpRight, FileSearch, Search, Trash2 } from 'lucide-react'
import { sortOrders, statusLabel } from '../workflow'
import { useMemo, useState } from 'react'
import type { OrderSummary } from '../types'

export function Orders({ orders, onOpen, onDeleteAll }: { orders: OrderSummary[]; onOpen: (id: number) => void; onDeleteAll: () => void }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('date')
  const [status, setStatus] = useState('all')
  const filtered = useMemo(() => sortOrders(orders.filter((order) =>
    `${order.order_number} ${order.client}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || order.status === status),
  ), sort), [orders, query, status, sort])
  return (
    <div className="page list-page">
      <header className="page-header">
        <div><span className="eyebrow">OPERATIONS / ORDERS</span><h1>Purchase orders</h1><p>Review extracted details, packing and shipment status.</p></div>
        <div className="orders-header-actions"><div className="summary-stamp"><b>{orders.length.toString().padStart(2, '0')}</b><span>DOCUMENTS<br />ON RECORD</span></div></div>
      </header>
      <p className="results-count" role="status">{filtered.length} of {orders.length} orders · Select an order to view its details</p>
      <section className="panel data-panel">
        <div className="table-tools">
          <label><Search size={17} /><Input aria-label="Search orders by customer or number" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer or order number…" /></label>
          <div className="status-filter"><label htmlFor="order-status">Status</label><select id="order-status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All orders</option><option value="needs_review">Needs review</option><option value="ready">Validated</option><option value="packed">Packing ready</option><option value="attention">Needs attention</option></select></div><label className="sort-control">Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="date">Newest date</option><option value="number">Order number</option><option value="customer">Customer</option><option value="utilization">Utilization</option></select></label>
        </div>
        <div className="full-order-table" role="region" aria-label="Orders list" tabIndex={0}>
          <div className="full-table-head"><span>ORDER</span><span>CUSTOMER</span><span>DATE</span><span>UNITS</span><span>BOXES</span><span>UTILIZATION</span><span>STATUS</span><span /></div>
          {filtered.map((order) => (
            <button key={order.id} onClick={() => onOpen(order.id)}>
              <span><FileSearch size={18} /><b>{order.order_number}</b></span>
              <span>{order.client}</span><span>{order.order_date}</span><span>{order.unit_count}</span><span>{order.box_count || '—'}</span>
              <span><i className="table-meter"><b style={{ width: `${order.average_utilization || 0}%` }} /></i>{order.box_count ? `${order.average_utilization || 0}%` : '—'}</span>
              <Badge className={`status-pill status-pill--${order.status}`}><i />{statusLabel(order.status)}</Badge>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {!filtered.length && <div className="empty-row">{orders.length ? 'No matches. Try a different search or change the status filter.' : 'No orders yet. Select “New order” to get started.'}</div>}
        </div>
      </section>
      <details className="order-maintenance"><summary>Order history management</summary><p>Deleting history removes all orders, plans and PDF reports. Product and box catalogs are kept.</p><Button className="button button--danger-ghost" disabled={!orders.length} onClick={onDeleteAll}><Trash2 size={16}/> Delete all orders</Button></details>
    </div>
  )
}

