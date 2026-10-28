import { ArrowUpRight, Box, CheckCircle2, Clock3, PackageCheck, Scale, TrendingUp } from 'lucide-react'
import type { DashboardData, OrderSummary } from '../types'

interface DashboardProps {
  data: DashboardData
  onOpenOrder: (id: number) => void
  onUpload: () => void
}

function statusLabel(status: string) {
  if (status === 'packed') return 'Plan listo'
  if (status === 'attention') return 'Revisar'
  if (status === 'ready') return 'Validada'
  return 'Por validar'
}

function UtilizationChart({ series }: { series: DashboardData['utilization_series'] }) {
  const values = series.length ? series : [{ label: '—', value: 0 }]
  const points = values.map((item, index) => {
    const x = values.length === 1 ? 50 : 4 + (index / (values.length - 1)) * 92
    const y = 88 - (item.value / 100) * 72
    return `${x},${y}`
  }).join(' ')
  const area = `4,92 ${points} 96,92`
  return (
    <div className="chart-wrap">
      <div className="chart-y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Ocupación por orden">
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#19d3f3" stopOpacity=".34" />
            <stop offset="1" stopColor="#19d3f3" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 38, 56, 74, 92].map((y) => <line key={y} x1="4" y1={y} x2="96" y2={y} className="grid-line" />)}
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
      <span>{order.unit_count} uds.</span>
      <span>{order.box_count || '—'} cajas</span>
      <span className="mini-meter"><i><b style={{ width: `${order.average_utilization || 0}%` }} /></i><em>{order.average_utilization || 0}%</em></span>
      <span className={`status-pill status-pill--${order.status}`}><i />{statusLabel(order.status)}</span>
      <ArrowUpRight size={17} />
    </button>
  )
}

export function Dashboard({ data, onOpenOrder, onUpload }: DashboardProps) {
  const latest = data.orders[0]
  const targetGap = Math.max(0, 85 - data.kpis.average_utilization).toFixed(1)
  return (
    <div className="page dashboard-page">
      <header className="page-header reveal-1">
        <div>
          <span className="eyebrow">OPERACIONES / VISTA GENERAL</span>
          <h1>Buenos días, Kevin.</h1>
          <p>El centro de empaque está operativo. Hay <b>{data.kpis.ready} órdenes</b> listas para despacho.</p>
        </div>
        <div className="header-date"><span>HOY</span><b>27 OCT 2026</b><i /></div>
      </header>

      <section className="kpi-grid reveal-2">
        <article className="kpi-card kpi-card--primary">
          <div className="kpi-top"><span>OCUPACIÓN MEDIA</span><TrendingUp size={18} /></div>
          <strong>{data.kpis.average_utilization}<small>%</small></strong>
          <div className="kpi-foot"><span className="positive">+4.8%</span><em>vs. periodo anterior</em></div>
          <div className="kpi-stripe"><i style={{ width: `${data.kpis.average_utilization}%` }} /></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-top"><span>ÓRDENES ANALIZADAS</span><PackageCheck size={18} /></div>
          <strong>{data.kpis.orders}<small> órdenes</small></strong>
          <div className="kpi-foot"><span className="positive">{data.kpis.ready} listas</span><em>{data.kpis.orders - data.kpis.ready} en revisión</em></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-top"><span>CAJAS ASIGNADAS</span><Box size={18} /></div>
          <strong>{data.kpis.boxes}<small> cajas</small></strong>
          <div className="kpi-foot"><span>1.8</span><em>promedio por orden</em></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-top"><span>PESO PLANIFICADO</span><Scale size={18} /></div>
          <strong>{data.kpis.total_weight_kg}<small> kg</small></strong>
          <div className="kpi-foot"><span className="neutral">EN RANGO</span><em>capacidad operativa</em></div>
        </article>
      </section>

      <section className="analytics-grid reveal-3">
        <article className="panel chart-panel">
          <header className="panel-header">
            <div><span className="panel-index">01</span><div><h2>Eficiencia de carga</h2><p>Ocupación de volumen por orden</p></div></div>
            <button className="period-control">ÚLTIMAS 8 ÓRDENES <span>⌄</span></button>
          </header>
          <UtilizationChart series={data.utilization_series} />
          <div className="chart-summary">
            <span><i className="cyan-dot" /> OCUPACIÓN REAL</span>
            <span><i className="dash-dot" /> OBJETIVO 85%</span>
            <strong>{targetGap}% <small>hasta objetivo</small></strong>
          </div>
        </article>

        <article className="panel pulse-panel">
          <header className="panel-header">
            <div><span className="panel-index">02</span><div><h2>Pulso operativo</h2><p>Estado del sistema</p></div></div>
            <span className="live-dot">EN VIVO</span>
          </header>
          <div className="radial-meter" style={{ '--value': `${data.kpis.average_utilization * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{data.kpis.average_utilization}%</strong><span>EFICIENCIA</span></div>
          </div>
          <div className="pulse-stats">
            <span><i><CheckCircle2 size={15} /></i><b>{data.kpis.ready}</b><small>Listas</small></span>
            <span><i><Clock3 size={15} /></i><b>{data.kpis.orders - data.kpis.ready}</b><small>Revisión</small></span>
          </div>
        </article>
      </section>

      <section className="dashboard-bottom reveal-4">
        <article className="panel queue-panel">
          <header className="panel-header">
            <div><span className="panel-index">03</span><div><h2>Cola de órdenes</h2><p>Actividad más reciente</p></div></div>
            <button className="text-link" onClick={() => onOpenOrder(data.orders[0]?.id)}>VER ÚLTIMA <ArrowUpRight size={14} /></button>
          </header>
          <div className="order-table-head"><span>ORDEN / FECHA</span><span>CLIENTE</span><span>UNIDADES</span><span>EMPAQUE</span><span>OCUPACIÓN</span><span>ESTADO</span><span /></div>
          <div className="order-rows">
            {data.orders.slice(0, 5).map((order) => <OrderRow key={order.id} order={order} onOpen={() => onOpenOrder(order.id)} />)}
          </div>
        </article>

        <article className="action-panel">
          <span className="eyebrow">SIGUIENTE MOVIMIENTO</span>
          <div className="action-number">{latest?.order_number.replace('PO-', '') || '—'}</div>
          <h2>{latest?.client || 'Nueva orden'}</h2>
          <p>{latest ? `${latest.unit_count} unidades · ${latest.box_count} cajas propuestas` : 'Carga una orden para comenzar.'}</p>
          <div className="action-rule" />
          <div className="action-metric"><span>APROVECHAMIENTO</span><strong>{latest?.average_utilization || 0}%</strong></div>
          <button onClick={() => latest ? onOpenOrder(latest.id) : onUpload()}>
            {latest ? 'ABRIR PLAN DE CARGA' : 'CARGAR PRIMERA ORDEN'} <ArrowUpRight size={17} />
          </button>
        </article>
      </section>
    </div>
  )
}

