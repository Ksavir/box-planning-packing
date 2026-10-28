import { AlertTriangle, ArrowLeft, Box, Check, ChevronLeft, ChevronRight, Download, FileCheck2, LoaderCircle, Package, Pencil, Plus, RefreshCcw, Save, Scale, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { BoxVisual } from '../components/BoxVisual'
import type { OrderDetailData, OrderItem, PackingResult } from '../types'

interface DetailProps {
  order: OrderDetailData
  onBack: () => void
  onRefresh: () => Promise<void>
  onSaved: () => Promise<void>
  notify: (message: string, error?: boolean) => void
}

type DraftItem = Omit<OrderItem, 'requested_date'> & {
  requested_date: string
  tax_label: string
  discount_percent: number
  amount: number
}

const makeDraft = (order: OrderDetailData) => ({
  order_number: order.order_number,
  client: order.client,
  vendor: order.vendor || '',
  order_date: order.order_date || '',
  requested_date: order.requested_date || '',
  currency: order.currency,
  delivery_address: order.delivery_address || '',
  billing_address: order.billing_address || '',
  terms: order.terms || '',
  notes: order.notes || '',
  subtotal: order.subtotal || 0,
  tax_amount: order.tax_amount || 0,
  total_amount: order.total_amount || 0,
  items: order.items.map((item): DraftItem => ({
    ...item,
    requested_date: item.requested_date || '',
    tax_label: item.tax_label || '',
    discount_percent: item.discount_percent || 0,
    amount: item.amount || item.quantity * item.unit_price,
  })),
})

export function OrderDetail({ order, onBack, onRefresh, onSaved, notify }: DetailProps) {
  const [editing, setEditing] = useState(!order.plan)
  const [busy, setBusy] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [boxIndex, setBoxIndex] = useState(0)
  const [draft, setDraft] = useState(makeDraft(order))
  useEffect(() => {
    setDraft(makeDraft(order))
    setEditing(!order.plan)
    setBoxIndex(0)
  }, [order])

  const updateItem = (index: number, patch: Partial<DraftItem>) => setDraft((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }))
  const saveReview = async (analyze = false) => {
    setBusy(true)
    try {
      await api.reviewOrder(order.id, {
        ...draft,
        order_date: draft.order_date || null,
        requested_date: draft.requested_date || null,
        items: draft.items.map((item, index) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          line_number: item.line_number || index + 1,
          requested_date: item.requested_date || null,
          tax_label: item.tax_label || '',
          discount_percent: Number(item.discount_percent || 0),
          amount: Number(item.amount || 0),
          is_suggested: Boolean(item.is_suggested),
        })),
      })
      if (analyze) await api.analyzeOrder(order.id)
      await onRefresh()
      setEditing(false)
      if (analyze) window.scrollTo({ top: 0, behavior: 'smooth' })
      notify(analyze ? 'Packing plan calculated.' : 'Order validated and saved.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The order could not be saved.', true)
    } finally { setBusy(false) }
  }

  const savePackingPlan = async () => {
    setBusy(true)
    setSavingPlan(true)
    try {
      await api.savePackingPlan(order.id)
      await onSaved()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The packing plan could not be saved.', true)
    } finally { setBusy(false); setSavingPlan(false) }
  }

  const exportPdf = async () => {
    setBusy(true)
    setExportingPdf(true)
    try {
      await api.exportOrderPdf(order.id, order.order_number)
      notify('PDF download started.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The PDF could not be exported.', true)
    } finally { setBusy(false); setExportingPdf(false) }
  }

  const recalculate = async () => {
    setBusy(true)
    try { await api.analyzeOrder(order.id); await onRefresh(); notify('Plan recalculated using the current catalog.') }
    catch (error) { notify(error instanceof Error ? error.message : 'The plan could not be recalculated.', true) }
    finally { setBusy(false) }
  }

  const addRecommendation = async (recommendation: PackingResult['product_recommendations'][number]) => {
    setBusy(true)
    try {
      await api.addSuggestedItem(order.id, recommendation.source_item_id, recommendation.quantity)
      await onRefresh()
      notify(`${recommendation.quantity} units added. The total and packing plan have been updated.`)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The recommendation could not be added.')
    } finally { setBusy(false) }
  }

  const removeSuggestedItem = async (item: OrderItem) => {
    if (!item.id) return
    setBusy(true)
    try {
      await api.removeSuggestedItem(order.id, item.id)
      await onRefresh()
      notify('Added product removed. Its value was deducted from the total.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The added product could not be removed.')
    } finally { setBusy(false) }
  }

  const result = order.plan?.result
  const selectedBox = result?.boxes[boxIndex]
  const totalValue = order.total_amount || order.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const addedItems = order.items.filter((item) => Boolean(item.is_suggested))

  return (
    <div className="page order-detail-page">
      <header className="detail-header">
        <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Orders</button>
        <div className="detail-title"><span className="eyebrow">PACKING PLAN / {order.order_number}</span><h1>{order.client}</h1><p>{order.source_type === 'email' ? 'Received email' : order.source_type === 'manual' ? 'Manual entry' : order.source_filename} · {order.source_type === 'manual' ? 'Ready for validation' : `Extraction confidence ${(order.confidence * 100).toFixed(0)}%`}</p></div>
        <div className="detail-actions">
          {order.plan && <button className="button button--ghost" onClick={() => api.exportOrder(order.id, order.order_number)}><Download size={16} /> Export Excel</button>}
          {order.plan && <button className="button button--ghost" disabled={busy || editing || result?.status !== 'complete'} onClick={exportPdf}>{exportingPdf ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{exportingPdf ? 'Exporting PDF…' : 'Export PDF'}</button>}
          {order.plan && <button className="button button--ghost" disabled={busy} onClick={() => setEditing(!editing)}><Pencil size={16} /> {editing ? 'Cancel editing' : 'Edit details'}</button>}
          {order.plan && <button className="button button--ghost" disabled={busy} onClick={recalculate}>{busy ? <LoaderCircle className="spin" size={17} /> : <RefreshCcw size={17} />} Recalculate</button>}
          {order.plan && !editing && <button className="button button--accent" disabled={busy || result?.status !== 'complete'} onClick={savePackingPlan}>{savingPlan ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{savingPlan ? 'Saving…' : 'Save plan & go home'}</button>}
        </div>
      </header>

      {order.extraction_warnings?.length ? <div className="form-error" role="alert">{order.extraction_warnings.join(' ')}</div> : null}
      <div className="process-rail">
        <span className="done"><i><Check size={14} /></i> {order.source_type === 'email' ? 'Email processed' : order.source_type === 'manual' ? 'Order created' : 'Document processed'}</span><b /><span className={order.plan ? 'done' : ''}><i>{order.plan ? <Check size={14} /> : '2'}</i> {order.plan ? 'Details validated' : 'Review details'}</span><b /><span className={order.plan ? 'done' : ''}><i>{order.plan ? <Check size={14} /> : '3'}</i> Plan calculated</span>
      </div>

      {editing ? (
        <section className="review-layout">
          <article className="panel review-form-panel">
            <header className="panel-header"><div><span className="panel-index">01</span><div><h2>Review the order</h2><p>Confirm the order details and products before calculating</p></div></div><span className="review-badge"><FileCheck2 size={15} /> MANUAL REVIEW</span></header>
            <div className="order-fields">
              <label><span>Order number</span><input value={draft.order_number} onChange={(e) => setDraft({ ...draft, order_number: e.target.value })} /></label>
              <label className="wide"><span>Customer</span><input value={draft.client} onChange={(e) => setDraft({ ...draft, client: e.target.value })} /></label>
              <label><span>Supplier</span><input value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} /></label>
              <label><span>Order date</span><input type="date" value={draft.order_date} onChange={(e) => setDraft({ ...draft, order_date: e.target.value })} /></label>
              <label><span>Requested date</span><input type="date" value={draft.requested_date} onChange={(e) => setDraft({ ...draft, requested_date: e.target.value })} /></label>
              <label><span>Currency</span><select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}><option>USD</option><option>EUR</option><option>GBP</option></select></label>
            </div>
            <div className="commercial-fields">
              <label><span>Delivery address</span><textarea value={draft.delivery_address} onChange={(e) => setDraft({ ...draft, delivery_address: e.target.value })} /></label>
              <label><span>Billing address</span><textarea value={draft.billing_address} onChange={(e) => setDraft({ ...draft, billing_address: e.target.value })} /></label>
              <label><span>Terms and notes</span><textarea value={`${draft.terms}${draft.terms && draft.notes ? '\n' : ''}${draft.notes}`} onChange={(e) => setDraft({ ...draft, terms: e.target.value, notes: '' })} /></label>
            </div>
            <div className="order-totals-edit">
              <label><span>SUBTOTAL</span><div><small>{draft.currency}</small><input type="number" min="0" step="0.01" value={draft.subtotal} onChange={(e) => setDraft({ ...draft, subtotal: Number(e.target.value) })} /></div></label>
              <label><span>TAXES</span><div><small>{draft.currency}</small><input type="number" min="0" step="0.01" value={draft.tax_amount} onChange={(e) => setDraft({ ...draft, tax_amount: Number(e.target.value) })} /></div></label>
              <label><span>TOTAL</span><div><small>{draft.currency}</small><input type="number" min="0" step="0.01" value={draft.total_amount} onChange={(e) => setDraft({ ...draft, total_amount: Number(e.target.value) })} /></div></label>
            </div>
            <div className="review-items-head"><div><h3>Matched line items</h3><p>The description matches the product to its catalog weight and dimensions.</p></div><button onClick={() => setDraft({ ...draft, items: [...draft.items, { description: '', quantity: 1, unit_price: 0, requested_date: '', tax_label: '', discount_percent: 0, amount: 0 }] })}><Plus size={15} /> Add line item</button></div>
            <div className="review-item-table">
              <div className="review-table-head"><span>DESCRIPTION</span><span>QTY.</span><span>PRICE</span><span>REQUESTED DATE</span><span>TAX</span><span>DISC.</span><span>AMOUNT</span><span /></div>
              {draft.items.map((item, index) => (
                <div key={`${item.id || 'new'}-${index}`} className="review-item-row">
                  <input aria-label={`Description for line ${index + 1}`} value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Description" />
                  <input aria-label={`Quantity for line ${index + 1}`} type="number" min="1" value={item.quantity} onChange={(e) => { const quantity = Number(e.target.value); updateItem(index, { quantity, amount: quantity * item.unit_price * (1 - Number(item.discount_percent || 0) / 100) }) }} />
                  <input aria-label={`Unit price for line ${index + 1}`} type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => { const unit_price = Number(e.target.value); updateItem(index, { unit_price, amount: item.quantity * unit_price * (1 - Number(item.discount_percent || 0) / 100) }) }} />
                  <input aria-label={`Requested date for line ${index + 1}`} type="date" value={item.requested_date || ''} onChange={(e) => updateItem(index, { requested_date: e.target.value })} />
                  <input aria-label={`Tax for line ${index + 1}`} value={item.tax_label || ''} onChange={(e) => updateItem(index, { tax_label: e.target.value })} placeholder="—" />
                  <input aria-label={`Discount for line ${index + 1}`} type="number" min="0" max="100" step="0.01" value={item.discount_percent || 0} onChange={(e) => { const discount_percent = Number(e.target.value); updateItem(index, { discount_percent, amount: item.quantity * item.unit_price * (1 - discount_percent / 100) }) }} />
                  <input aria-label={`Amount for line ${index + 1}`} type="number" min="0" step="0.01" value={item.amount || 0} onChange={(e) => updateItem(index, { amount: Number(e.target.value) })} />
                  <button aria-label={`Remove line ${index + 1}`} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={16} /></button>
                </div>
              ))}
              {!draft.items.length && <div className="empty-row">No line items found. Add at least one product.</div>}
            </div>
            <footer className="review-footer"><span><AlertTriangle size={17} /> Check descriptions, quantities and units.</span><div><button className="button button--ghost" disabled={busy} onClick={() => saveReview(false)}><Save size={16} /> Save</button><button className="button button--accent" disabled={busy || !draft.items.length} onClick={() => saveReview(true)}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Validate and calculate</button></div></footer>
          </article>
          <aside className="source-card"><span className="eyebrow">{order.source_type === 'email' ? 'SOURCE / RECEIVED EMAIL' : order.source_type === 'manual' ? 'SOURCE / MANUAL ENTRY' : 'SOURCE DOCUMENT'}</span><div className="paper-preview"><i /><i /><i /><b>{order.source_type === 'email' ? 'MAIL' : order.source_type === 'manual' ? 'TXT' : 'PO'}</b><small>{order.order_number}</small><div /><div /><div /><div /></div><h3>{order.source_filename || (order.source_type === 'email' ? 'Received email' : 'Manual entry')}</h3><p>{order.source_type === 'email' ? 'Products and quantities extracted from the email. Review the details and complete any missing information.' : order.source_type === 'manual' ? 'Details entered from an email, call or message.' : 'The PDF was used as the source for extraction and validation.'}</p></aside>
        </section>
      ) : result && selectedBox ? (
        <>
          <section className="plan-kpis">
            <article><span>BOXES REQUIRED</span><strong>{result.box_count}<small> {result.box_count === 1 ? 'box' : 'boxes'}</small></strong><i><Package /></i></article>
            <article><span>TOTAL UTILIZATION</span><strong>{result.average_utilization}<small>%</small></strong><i><Box /></i></article>
            <article><span>GROSS WEIGHT</span><strong>{result.total_weight_kg}<small> kg</small></strong><i><Scale /></i></article>
            <article><span>ORDER VALUE</span><strong>{order.currency} {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><i><FileCheck2 /></i></article>
          </section>
          <section className="packing-workbench">
            <article className="panel box-selector-panel">
              <header className="panel-header"><div><span className="panel-index">01</span><div><h2>Proposed layout</h2><p>{result.method}</p></div></div><span className="verified-label"><Check size={14} /> NO OVERLAPS</span></header>
              <div className="box-switcher">
                <button aria-label="Previous box" disabled={boxIndex === 0} onClick={() => setBoxIndex(boxIndex - 1)}><ChevronLeft /></button>
                <div><span>BOX {String(selectedBox.sequence).padStart(2, '0')} / {String(result.box_count).padStart(2, '0')}</span><h3>{selectedBox.box_name}</h3></div>
                <button aria-label="Next box" disabled={boxIndex === result.box_count - 1} onClick={() => setBoxIndex(boxIndex + 1)}><ChevronRight /></button>
              </div>
              <BoxVisual box={selectedBox} />
            </article>
            <aside className="box-inspector">
              <div className="inspector-head"><span>BOX {String(selectedBox.sequence).padStart(2, '0')}</span><strong>{selectedBox.box_code}</strong><em>{selectedBox.box_name}</em></div>
              <div className="utilization-readout"><div className="radial-small" style={{ '--value': `${selectedBox.utilization * 3.6}deg` } as React.CSSProperties}><span>{selectedBox.utilization}<small>%</small></span></div><div><b>Volume utilization</b><p>{selectedBox.remaining_volume_l} L available</p></div></div>
              <div className="inspector-metrics"><span><small>GROSS WEIGHT</small><b>{selectedBox.gross_weight_kg} kg</b></span><span><small>CAPACITY</small><b>{selectedBox.max_weight_kg} kg</b></span><span><small>UNITS</small><b>{selectedBox.placements.length}</b></span><span><small>DIMENSIONS</small><b>{selectedBox.dimensions_cm.join('×')}</b></span></div>
              <div className="contents-list"><h3>Contents</h3>{selectedBox.items.map((item) => <div key={item.sku}><i /><span><b>{item.name}</b></span><strong>×{item.quantity}</strong></div>)}</div>
            </aside>
          </section>
          <section className="plan-bottom-grid">
            <article className="panel recommendation-panel">
              <header className="panel-header"><div><span className="panel-index">02</span><div><h2>Fill the remaining space</h2><p>Products that fit in the selected boxes. Apply one alternative at a time.</p></div></div></header>
              {addedItems.length > 0 && <div className="added-products">
                <div className="added-products__title"><span>ADDED TO THE INVOICE</span><b>{addedItems.length}</b></div>
                {addedItems.map((item) => <div className="added-product" key={item.id}>
                  <div><strong>{item.description}</strong><span>{item.quantity} × {order.currency} {item.unit_price.toFixed(2)}</span></div>
                  <b>+{order.currency} {(item.amount || item.quantity * item.unit_price).toFixed(2)}</b>
                  <button disabled={busy} onClick={() => removeSuggestedItem(item)} aria-label={`Remove ${item.description}`}><Trash2 size={15} /></button>
                </div>)}
              </div>}
              {(result.product_recommendations || []).map((recommendation) => <div className="product-recommendation" key={`${recommendation.source_item_id}-${recommendation.quantity}`}>
                <i><Plus size={17} /></i>
                <div><strong>{recommendation.description}</strong><p>Add {recommendation.quantity} units · estimated utilization {recommendation.projected_utilization}%</p></div>
                <div className="recommendation-price"><span>{recommendation.unit_price ? `+${order.currency} ${recommendation.amount.toFixed(2)}` : 'Pricing pending'}</span><small>{recommendation.unit_price ? `${order.currency} ${recommendation.unit_price.toFixed(2)} / unit` : 'Complete during review'}</small></div>
                <button disabled={busy} onClick={() => addRecommendation(recommendation)}>ADD</button>
              </div>)}
              {!(result.product_recommendations || []).length && <div className="recommendation-empty"><Sparkles size={18} /><span>No additional units of the ordered products fit in the selected boxes.</span></div>}
              <div className="operational-notes">{result.suggestions.map((suggestion, index) => <div className={`recommendation recommendation--${suggestion.type}`} key={`${suggestion.title}-${index}`}><i><Sparkles size={18} /></i><div><strong>{suggestion.title}</strong><p>{suggestion.detail}</p></div><span>{String(index + 1).padStart(2, '0')}</span></div>)}</div>
            </article>
            <article className="panel item-summary-panel"><header className="panel-header"><div><span className="panel-index">03</span><div><h2>Order summary</h2><p>{result.unit_count} units across {order.items.length} line items</p></div></div></header><div className="simple-items simple-items--products"><div><span>PRODUCT</span><span>QTY.</span><span>UNIT WEIGHT</span></div>{order.items.map((item) => <div key={item.id}><span>{item.description}</span><span>{item.quantity}</span><span>{item.weight_kg?.toFixed(2) || '—'} kg</span></div>)}</div></article>
          </section>
        </>
      ) : <div className="empty-state"><Package size={42} /><h2>This order does not have a packing plan yet.</h2><p>Review its line items to calculate a plan.</p><button className="button button--accent" onClick={() => setEditing(true)}>Review order</button></div>}
    </div>
  )
}
