import { ArrowUpRight, FileSearch, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OrderSummary } from '../types'

export function Orders({ orders, onOpen, onDeleteAll }: { orders: OrderSummary[]; onOpen: (id: number) => void; onDeleteAll: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const filtered = useMemo(() => orders.filter((order) =>
    `${order.order_number} ${order.client}`.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || (status === 'packed' ? order.status === 'packed' : order.status !== 'packed')),
  ), [orders, query, status])
  return (
    <div className="page list-page">
      <header className="page-header">
        <div><span className="eyebrow">OPERATIONS / ORDERS</span><h1>Purchase orders</h1><p>Review extracted details, packing and shipment status.</p></div>
        <div className="orders-header-actions"><button className="button button--danger-ghost" disabled={!orders.length} onClick={onDeleteAll}><Trash2 size={16} /> Delete all orders</button><div className="summary-stamp"><b>{orders.length.toString().padStart(2, '0')}</b><span>DOCUMENTS<br />ON RECORD</span></div></div>
      </header>
      <p className="results-count" role="status">{filtered.length} of {orders.length} orders · Select an order to view its details</p>
      <section className="panel data-panel">
        <div className="table-tools">
          <label><Search size={17} /><input aria-label="Search orders by customer or number" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer or order number…" /></label>
          <div className="status-filter"><label htmlFor="order-status">Status</label><select id="order-status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All orders</option><option value="packed">Plan ready</option><option value="review">Awaiting a plan</option></select></div>
        </div>
        <div className="full-order-table">
          <div className="full-table-head"><span>ORDER</span><span>CUSTOMER</span><span>DATE</span><span>UNITS</span><span>BOXES</span><span>UTILIZATION</span><span>STATUS</span><span /></div>
          {filtered.map((order) => (
            <button key={order.id} onClick={() => onOpen(order.id)}>
              <span><FileSearch size={18} /><b>{order.order_number}</b></span>
              <span>{order.client}</span><span>{order.order_date}</span><span>{order.unit_count}</span><span>{order.box_count || '—'}</span>
              <span><i className="table-meter"><b style={{ width: `${order.average_utilization || 0}%` }} /></i>{order.average_utilization || 0}%</span>
              <span className={`status-pill status-pill--${order.status}`}><i />{order.status === 'packed' ? 'Plan ready' : order.status === 'ready' ? 'Validated' : 'Needs review'}</span>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {!filtered.length && <div className="empty-row">{orders.length ? 'No matches. Try a different search or change the status filter.' : 'No orders yet. Select “New order” to get started.'}</div>}
        </div>
      </section>
    </div>
  )
}

