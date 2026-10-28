import { ArrowUpRight, FileSearch, Filter, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { OrderSummary } from '../types'

export function Orders({ orders, onOpen }: { orders: OrderSummary[]; onOpen: (id: number) => void }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => orders.filter((order) =>
    `${order.order_number} ${order.client}`.toLowerCase().includes(query.toLowerCase()),
  ), [orders, query])
  return (
    <div className="page list-page">
      <header className="page-header">
        <div><span className="eyebrow">OPERACIONES / ÓRDENES</span><h1>Órdenes de compra</h1><p>Revisa la extracción, el empaque y el estado de cada envío.</p></div>
        <div className="summary-stamp"><b>{orders.length.toString().padStart(2, '0')}</b><span>DOCUMENTOS<br />EN REGISTRO</span></div>
      </header>
      <section className="panel data-panel">
        <div className="table-tools">
          <label><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente o número…" /></label>
          <button><Filter size={16} /> Filtros</button>
        </div>
        <div className="full-order-table">
          <div className="full-table-head"><span>ORDEN</span><span>CLIENTE</span><span>FECHA</span><span>UNIDADES</span><span>CAJAS</span><span>OCUPACIÓN</span><span>ESTADO</span><span /></div>
          {filtered.map((order) => (
            <button key={order.id} onClick={() => onOpen(order.id)}>
              <span><FileSearch size={18} /><b>{order.order_number}</b></span>
              <span>{order.client}</span><span>{order.order_date}</span><span>{order.unit_count}</span><span>{order.box_count || '—'}</span>
              <span><i className="table-meter"><b style={{ width: `${order.average_utilization || 0}%` }} /></i>{order.average_utilization || 0}%</span>
              <span className={`status-pill status-pill--${order.status}`}><i />{order.status === 'packed' ? 'Plan listo' : 'Revisar'}</span>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {!filtered.length && <div className="empty-row">No hay órdenes que coincidan con la búsqueda.</div>}
        </div>
      </section>
    </div>
  )
}

