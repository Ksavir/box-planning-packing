import { ArrowUpRight, Box, CheckCircle2, Clock3, PackageCheck, Scale, TrendingUp, Trash2 } from 'lucide-react'
import type { DashboardData, OrderSummary } from '../types'

interface DashboardProps {
  data: DashboardData
  onOpenOrder: (id: number) => void
  onUpload: () => void
  onDeleteAll: () => void
}

function statusLabel(status: string) {
  if (status === 'packed') return 'Plan ready'
  if (status === 'attention') return 'Review'
  if (status === 'ready') return 'Validated'
  return 'Awaiting validation'
}

function UtilizationChart({ series }: { series: DashboardData['utilization_series'] }) {
  const values = series.length ? series : [{ label: '—', value: 0 }]
  const points = values.map((item, index) => {
    const x = values.length === 1 ? 50 : 4 + (index / (values.length - 1)) * 92
    const y = 92 - (item.value / 100) * 72
    return `${x},${y}`
  }).join(' ')
  const area = `4,92 ${points} 96,92`
  return (
    <div className="chart-wrap">
      <div className="chart-y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Utilization by order: ${values.map(item => `${item.label}: ${item.value}%`).join(', ')}`}>
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#087e97" stopOpacity=".13" />
            <stop offset="1" stopColor="#087e97" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 38, 56, 74, 92].map((y) => <line key={y} x1="4" y1={y} x2="96" y2={y} className="grid-line" />)}
        <line x1="4" y1="30.8" x2="96" y2="30.8" stroke="var(--orange)" strokeWidth=".5" strokeDasharray="2 2" />
        <polygon points={area} fill="url(#chartFill)" />
        <polyline points={points} className="chart-line" />
        {values.map((item, index) => {
          const [x, y] = points.split(' ')[index].split(',')
          return <circle key={item.label} cx={x} cy={y} r="1.4" className="chart-dot" />
        })}
      </svg>
      <div className="chart-labels">
        {values.map((item) => <span key={item.label}>{item.label.replace('PO-', '#')}</span>)}
      </div>
    </div>
  )
}

function OrderRow({ order, onOpen }: { order: OrderSummary; onOpen: () => void }) {
  return (
    <button className="order-row" onClick={onOpen}>
      <span className="order-id-cell"><b>{order.order_number}</b><small>{order.order_date}</small></span>
      <span className="client-cell"><i>{order.client.slice(0, 2).toUpperCase()}</i><b>{order.client}</b></span>
      <span>{order.unit_count} units</span>
      <span>{order.box_count || '—'} {order.box_count === 1 ? 'box' : 'boxes'}</span>
      <span className="mini-meter"><i><b style={{ width: `${order.average_utilization || 0}%` }} /></i><em>{order.average_utilization || 0}%</em></span>
      <span className={`status-pill status-pill--${order.status}`}><i />{statusLabel(order.status)}</span>
      <ArrowUpRight size={17} />
    </button>
  )
}

export function Dashboard({ data, onOpenOrder, onUpload, onDeleteAll }: DashboardProps) {
  const latest = data.orders[0]
  const targetGap = Math.max(0, 85 - data.kpis.average_utilization).toFixed(1)
  return (
    <div className="page dashboard-page">
      <header className="page-header reveal-1">
        <div>
          <span className="eyebrow">OPERATIONS / OVERVIEW</span>
          <h1>Every shipment, well prepared.</h1>
          <p>Organize your orders and make the most of every box. You have <b>{data.kpis.ready} orders</b> with a packing plan ready.</p>
        </div>
        <div className="header-date"><span>TODAY</span><b>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}</b><i /></div>
      </header>

      <section className="kpi-grid reveal-2">
        <article className="kpi-card kpi-card--primary">
          <div className="kpi-top"><span>AVERAGE UTILIZATION</span><TrendingUp size={18} /></div>
          <strong>{data.kpis.average_utilization}<small>%</small></strong>
          <div className="kpi-foot"><span>Volume used</span><em>across calculated plans</em></div>
          <div className="kpi-stripe"><i style={{ width: `${data.kpis.average_utilization}%` }} /></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-top"><span>ORDERS ANALYZED</span><PackageCheck size={18} /></div>
          <strong>{data.kpis.orders}<small> orders</small></strong>
          <div className="kpi-foot"><span className="positive">{data.kpis.ready} ready</span><em>{data.kpis.orders - data.kpis.ready} awaiting review</em></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-top"><span>BOXES ASSIGNED</span><Box size={18} /></div>
          <strong>{data.kpis.boxes}<small> boxes</small></strong>
          <div className="kpi-foot"><span>{data.kpis.orders ? (data.kpis.boxes / data.kpis.orders).toFixed(1) : '0'}</span><em>average per order</em></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-top"><span>PLANNED WEIGHT</span><Scale size={18} /></div>
          <strong>{data.kpis.total_weight_kg}<small> kg</small></strong>
          <div className="kpi-foot"><span className="neutral">TOTAL WEIGHT</span><em>across calculated plans</em></div>
        </article>
      </section>

      <section className="analytics-grid reveal-3">
        <article className="panel chart-panel">
          <header className="panel-header">
            <div><span className="panel-index">01</span><div><h2>Packing efficiency</h2><p>Volume utilization per order</p></div></div>
            <span className="period-control">{data.utilization_series.length} recorded orders</span>
          </header>
          <UtilizationChart series={data.utilization_series} />
          <div className="chart-summary">
            <span><i className="cyan-dot" /> ACTUAL UTILIZATION</span>
            <span><i className="dash-dot" /> TARGET 85%</span>
            <strong>{targetGap}% <small>to target</small></strong>
          </div>
        </article>

        <article className="panel pulse-panel">
          <header className="panel-header">
            <div><span className="panel-index">02</span><div><h2>Order status</h2><p>Planning summary</p></div></div>
            <span className="live-dot">SUMMARY</span>
          </header>
          <div className="radial-meter" style={{ '--value': `${data.kpis.average_utilization * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{data.kpis.average_utilization}%</strong><span>EFFICIENCY</span></div>
          </div>
          <div className="pulse-stats">
            <span><i><CheckCircle2 size={15} /></i><b>{data.kpis.ready}</b><small>Ready</small></span>
            <span><i><Clock3 size={15} /></i><b>{data.kpis.orders - data.kpis.ready}</b><small>Review</small></span>
          </div>
        </article>
      </section>

      <section className="dashboard-bottom reveal-4">
        <article className="panel queue-panel">
          <header className="panel-header">
            <div><span className="panel-index">03</span><div><h2>Recent orders</h2><p>Latest activity</p></div></div>
            <div className="queue-actions">{latest && <button className="text-link" onClick={() => onOpenOrder(latest.id)}>Open latest <ArrowUpRight size={14} /></button>}<button className="text-link danger-link" disabled={!data.orders.length} onClick={onDeleteAll}><Trash2 size={14} /> Delete all orders</button></div>
          </header>
          <div className="order-table-head"><span>ORDER / DATE</span><span>CUSTOMER</span><span>UNITS</span><span>PACKING</span><span>UTILIZATION</span><span>STATUS</span><span /></div>
          <div className="order-rows">
            {!data.orders.length && <div className="empty-row"><p>Your next shipment starts here. Create an order to plan its packing.</p><button className="button button--accent" onClick={onUpload}>Create your first order</button></div>}
            {data.orders.slice(0, 5).map((order) => <OrderRow key={order.id} order={order} onOpen={() => onOpenOrder(order.id)} />)}
          </div>
        </article>

        <article className="action-panel">
          <span className="eyebrow">CONTINUE YOUR WORK</span>
          <div className="action-number">{latest?.order_number.replace('PO-', '') || '—'}</div>
          <h2>{latest?.client || 'New order'}</h2>
          <p>{latest ? `${latest.unit_count} units · ${latest.box_count ? `${latest.box_count} proposed ${latest.box_count === 1 ? 'box' : 'boxes'}` : 'Awaiting calculation'}` : 'Upload an order to get started.'}</p>
          <div className="action-rule" />
          <div className="action-metric"><span>UTILIZATION</span><strong>{latest?.average_utilization || 0}%</strong></div>
          <button onClick={() => latest ? onOpenOrder(latest.id) : onUpload()}>
            {latest ? 'Review order and packing' : 'Create your first order'} <ArrowUpRight size={17} />
          </button>
        </article>
      </section>
    </div>
  )
}

