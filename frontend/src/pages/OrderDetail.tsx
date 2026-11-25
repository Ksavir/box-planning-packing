import { Gauge } from '../components/charts/gauge'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { AlertTriangle, ArrowLeft, Box, Check, ChevronLeft, ChevronRight, Download, FileCheck2, LoaderCircle, Package, Pencil, Plus, RefreshCcw, Save, Scale, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import { BoxNavigation } from '../components/BoxNavigation'
import { ExtractionReview } from '../components/ExtractionReview'
import { boundedBoxIndex, extractionConfidence } from '../resultPresentation'
import { SourceDocument } from '../components/SourceDocument'
import { RecommendationPreview } from '../components/RecommendationPreview'
import { prioritySuggestions, type RecommendationPreview as Preview } from '../workflow'
import { BoxVisual } from '../components/BoxVisual'
import { ReviewProductRow } from '../components/ReviewProductRow'
import { fieldId, makeDraft, reviewPayload, serverIssues, validateReview, type DraftItem, type ReviewIssue } from '../review'
import type { OrderDetailData, OrderItem, PackingResult, Product } from '../types'

interface DetailProps {
  order: OrderDetailData
  onBack: () => void
  onRefresh: () => Promise<void>
  onSaved: () => Promise<void>
  notify: (message: string, error?: boolean) => void
}

export function OrderDetail({ order, onBack, onRefresh, onSaved, notify }: DetailProps) {
  const [editing, setEditing] = useState(!order.plan)
  const [busy, setBusy] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [boxIndex, setBoxIndex] = useState(0)
  const [draft, setDraft] = useState(makeDraft(order))
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [undo, setUndo] = useState<{id:number;quantity:number;planId:number}|null>(null)
  const [savedPlan, setSavedPlan] = useState<number|null>(null)
  const [operation,setOperation] = useState('')
  const [matchedItems, setMatchedItems] = useState(order.items)
  const [catalog, setCatalog] = useState<Product[]>()
  const [catalogError, setCatalogError] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [remoteIssues, setRemoteIssues] = useState<ReviewIssue[]>([])
  const [reviewMessage, setReviewMessage] = useState('')
  const summaryRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setDraft(makeDraft(order)); setMatchedItems(order.items); setEditing(!order.plan); setBoxIndex(0)
    setAttempted(false); setRemoteIssues([]); setReviewMessage(''); setPreview(null); setUndo(null); setSavedPlan(null)
    // Reset only on navigation to another order, not on unrelated parent refreshes.
  }, [order.id])
  useEffect(() => {
    let cancelled = false
    api.products().then(products => { if (!cancelled) { setCatalog(products); setCatalogError(false) } })
      .catch(() => { if (!cancelled) setCatalogError(true) })
    return () => { cancelled = true }
  }, [order.id])
  const validationIssues = validateReview(draft, matchedItems, catalog)
  const issues = [...validationIssues.filter(issue => issue.kind === 'warning' || attempted || issue.packingOnly), ...remoteIssues]
  const errors = issues.filter(issue => issue.kind === 'error')
  const warnings = issues.filter(issue => issue.kind === 'warning')
  const focusSummary = () => requestAnimationFrame(() => summaryRef.current?.focus())
  const inputAttributes = (field: string) => ({ id: fieldId(field), 'aria-invalid': errors.some(e => e.field === field) || undefined, 'aria-describedby': errors.some(e => e.field === field) ? `${fieldId(field)}-error` : undefined })
  const editDraft: typeof setDraft = update => { setDraft(update); setRemoteIssues([]); setReviewMessage('') }
  const updateItem = (index: number, patch: Partial<DraftItem>) => editDraft(current => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }))
  const toggleEditing = () => {
    if (!editing) { setDraft(makeDraft(order)); setMatchedItems(order.items) }
    setAttempted(false); setRemoteIssues([]); setReviewMessage(''); setEditing(!editing)
  }
  const focusPackingResult = () => requestAnimationFrame(() => document.getElementById('packing-performance-title')?.focus({preventScroll: true}))
  const saveReview = async (analyze = false) => {
    setAttempted(true); setRemoteIssues([]); setReviewMessage('')
    const blocking = validateReview(draft, matchedItems, catalog).filter(issue => issue.kind === 'error' && (analyze || !issue.packingOnly))
    if (blocking.length) { focusSummary(); return }
    setBusy(true)
    setOperation('Saving details and matching products to the catalog…')
    let saved = false
    try {
      const updated = await api.reviewOrder(order.id, reviewPayload(draft))
      saved = true
      setMatchedItems(updated.items)
      // Keep the user's draft and supplied commercial fields; only adopt server item identities/matches.
      const checkedDraft = { ...draft, items: draft.items.map((item, index) => ({ ...item, id: updated.items[index]?.id })) }
      setDraft(checkedDraft)
      let freshCatalog: Product[] | undefined
      try { freshCatalog = await api.products(); setCatalog(freshCatalog); setCatalogError(false) }
      catch { setCatalog(undefined); setCatalogError(true) }
      const physicalErrors = validateReview(checkedDraft, updated.items, freshCatalog).filter(issue => issue.kind === 'error')
      if (analyze && physicalErrors.length) {
        setReviewMessage('Order details saved. Packing has not been calculated: correct the catalog issues below.')
        await onRefresh(); setEditing(true); focusSummary(); return
      }
      if (analyze) { setOperation('Calculating the packing plan…'); await api.analyzeOrder(order.id) }
      await onRefresh()
      setEditing(!analyze)
      setAttempted(false)
      if (analyze) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        focusPackingResult()
      }
      notify(analyze ? 'Packing plan calculated.' : 'Order details saved and catalog matches rechecked. Packing has not been calculated.')
    } catch (error) {
      setRemoteIssues(error instanceof ApiError ? serverIssues(error.details, error.status) : [])
      const message = error instanceof Error ? error.message : 'The order could not be saved.'
      setReviewMessage(saved ? `Order details were saved, but the remaining operation failed. ${message}` : message)
      if (saved) { try { await onRefresh() } catch { /* Keep the draft available for recovery. */ } }
      setEditing(true); focusSummary(); notify(message, true)
    } finally { setBusy(false); setOperation('') }
  }

  const savePackingPlan = async () => {
    setBusy(true)
    setSavingPlan(true); setOperation('Saving the packing plan and PDF…')
    try {
      await api.savePackingPlan(order.id)
      setSavedPlan(order.plan?.id || null)
      notify('Packing plan and PDF saved. You can continue reviewing or return to the overview.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The packing plan could not be saved.', true)
    } finally { setBusy(false); setSavingPlan(false); setOperation('') }
  }

  const exportPdf = async () => {
    setBusy(true)
    setExportingPdf(true); setOperation('Preparing the PDF export…')
    try {
      await api.exportOrderPdf(order.id, order.order_number)
      notify('PDF download started.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The PDF could not be exported.', true)
    } finally { setBusy(false); setExportingPdf(false); setOperation('') }
  }

  const recalculate = async () => {
    setBusy(true)
    setUndo(null); setOperation('Recalculating the current order…')
    try { await api.analyzeOrder(order.id); await onRefresh(); notify('Plan recalculated using the current catalog.') }
    catch (error) { notify(error instanceof Error ? error.message : 'The plan could not be recalculated.', true) }
    finally { setBusy(false); setOperation('') }
  }

  const previewRecommendation = async (recommendation: PackingResult['product_recommendations'][number]) => {
    if (!order.plan) return
    setBusy(true); setOperation('Evaluating this addition in the packing engine…'); setPreviewError('')
    try { setPreview(await api.previewRecommendation(order.id, recommendation.source_item_id, recommendation.quantity, order.plan.id)) }
    catch(error) { notify(error instanceof Error ? error.message : 'Preview unavailable. Refresh and try again.', true) }
    finally { setBusy(false); setOperation('') }
  }
  const applyPreview = async () => {
    if (!preview) return
    setBusy(true); setOperation('Applying the addition and recalculating…'); setPreviewError('')
    try {
      const updated = await api.addSuggestedItem(order.id, preview.source_item_id, preview.quantity, preview.plan_id)
      const source=order.items.find(item=>item.id===preview.source_item_id)
      const addition=updated.items.find(item=>item.is_suggested && item.product_id===source?.product_id && item.description===source?.description && item.unit_price===source?.unit_price)
      setPreview(null)
      setUndo(addition?.id && updated.plan ? {id:addition.id,quantity:preview.quantity,planId:updated.plan.id} : null)
      await onRefresh()
      focusPackingResult()
      notify('Addition applied. Recommendations and totals have been recalculated.')
    } catch(error) {
      const message = error instanceof Error ? error.message : 'Unable to confirm the addition. Refresh the order before trying again.'
      setPreviewError(message); notify(message, true)
    }
    finally { setBusy(false); setOperation('') }
  }
  const undoAddition = async () => {
    if (!undo || undo.planId!==order.plan?.id) return
    setBusy(true)
    try { await api.removeSuggestedItem(order.id,undo.id,undo.quantity); setUndo(null); await onRefresh(); focusPackingResult(); notify('Last addition undone. Earlier added units have been kept.') }
    catch(error) { notify(error instanceof Error ? error.message : 'Undo failed. Refresh the order.',true) }
    finally {setBusy(false);setOperation('')}
  }

  const removeSuggestedItem = async (item: OrderItem) => {
    if (!item.id) return
    setBusy(true)
    try {
      await api.removeSuggestedItem(order.id, item.id)
      await onRefresh()
      focusPackingResult()
      notify('Added product removed. Its value was deducted from the total.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The added product could not be removed.',true)
    } finally { setBusy(false); setOperation('') }
  }

  const result = order.plan?.result
  const selectedIndex = boundedBoxIndex(boxIndex, result?.boxes.length || 0)
  const selectedBox = result?.boxes[selectedIndex]
  const confidence = extractionConfidence(order)
  const reviewExtractedField = (field: string) => {
    if (!editing) { setDraft(makeDraft(order)); setMatchedItems(order.items) }
    setEditing(true)
    requestAnimationFrame(() => document.getElementById(fieldId(field))?.focus())
  }
  const totalValue = order.total_amount || order.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const addedItems = order.items.filter((item) => Boolean(item.is_suggested))

  return (
    <div className="page order-detail-page">
      {preview && <RecommendationPreview preview={preview} currency={order.currency} busy={busy} error={previewError} onClose={()=>setPreview(null)} onApply={applyPreview}/>}
      <header className="detail-header">
        <button className="back-button" onClick={onBack}><ArrowLeft size={18} /> Orders</button>
        <div className="detail-title"><span className="eyebrow">PACKING PLAN / {order.order_number}</span><h1>{order.client}</h1><p>{order.source_type === 'email' ? 'Received email' : order.source_type === 'manual' ? 'Manual entry' : order.source_filename} · {confidence.label}</p></div>
        <div className="detail-actions">
          {order.plan && <Button className="button button--ghost" disabled={busy || editing} onClick={async () => { try { await api.exportOrder(order.id, order.order_number); notify('Excel download started.') } catch (error) { notify(error instanceof Error ? error.message : 'The plan could not be exported.', true) } }}><Download size={16} /> Export Excel</Button>}
          {order.plan && <Button className="button button--ghost" disabled={busy || editing || result?.status !== 'complete'} onClick={exportPdf}>{exportingPdf ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{exportingPdf ? 'Exporting PDF…' : 'Export PDF'}</Button>}
          {order.plan && <Button className="button button--ghost" disabled={busy} onClick={toggleEditing}><Pencil size={16} /> {editing ? 'Cancel editing' : 'Edit details'}</Button>}
          {order.plan && <Button className="button button--ghost" disabled={busy || editing} onClick={recalculate}>{busy ? <LoaderCircle className="spin" size={17} /> : <RefreshCcw size={17} />} Recalculate</Button>}
          {order.plan && !editing && <Button className="button button--accent" disabled={busy || result?.status !== 'complete'} onClick={savePackingPlan}>{savingPlan ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{savingPlan ? 'Saving…' : savedPlan===order.plan?.id ? 'Save plan again' : 'Save packing plan'}</Button>}
          <Button className="button button--ghost" disabled={busy} onClick={onSaved}>Back to overview</Button>
        </div>
      </header>

      {busy && <p role="status" className="operation-status">{operation || 'Completing your request…'}</p>}
      {order.extraction_warnings?.length ? <div className="form-error" role="alert">{order.extraction_warnings.join(' ')}</div> : null}
      <div className="process-rail">
        <span className="done"><i><Check size={14} /></i> {order.source_type === 'email' ? 'Email processed' : order.source_type === 'manual' ? 'Order created' : 'Document processed'}</span><b /><span className={order.plan ? 'done' : ''}><i>{order.plan ? <Check size={14} /> : '2'}</i> {editing ? 'Review order details' : 'Details validated'}</span><b /><span className={order.plan ? 'done' : ''}><i>{order.plan ? <Check size={14} /> : '3'}</i> {editing ? 'Edits not calculated' : result?.status==='complete' ? 'Packing ready' : result?.status==='partial' ? 'Needs attention' : 'Not calculated'}</span>
      </div>

      <ExtractionReview order={editing ? { ...order, items: draft.items } : order}
        issues={editing ? validationIssues : validateReview(makeDraft(order), order.items, catalog)} busy={busy} onReview={reviewExtractedField} />

      {editing ? (
        <section className="review-layout">
          <article className="panel review-form-panel">
            <header className="panel-header"><div><span className="panel-index">01</span><div><h2>Order information</h2><p>Confirm the order details and products before calculating</p></div></div><span className="review-badge"><FileCheck2 size={15} /> {errors.length ? `${errors.length} issues to review` : 'Review required'}</span></header>
            <div ref={summaryRef} tabIndex={-1} className={`review-validation ${errors.length || reviewMessage ? 'review-validation--error' : ''}`} aria-labelledby="review-validation-title">
              <h3 id="review-validation-title">{errors.length ? `${errors.length} blocking ${errors.length === 1 ? 'issue' : 'issues'}` : 'Review packing data before calculating'}</h3>
              {reviewMessage && <p role="alert">{reviewMessage}</p>}
              {!!errors.length && <ul>{errors.map((issue, index) => <li key={`${issue.field}-${index}`}><a href={`#${fieldId(issue.field)}`} onClick={event => { event.preventDefault(); document.getElementById(fieldId(issue.field))?.focus() }}>{issue.field.startsWith('items.') ? `Product ${Number(issue.field.split('.')[1]) + 1}: ` : ''}{issue.message}</a></li>)}</ul>}
              <details className="review-warning-list"><summary>{warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'} — review non-blocking information</summary><ul>{warnings.map((issue, index) => <li key={`${issue.field}-${index}`}><a href={`#${fieldId(issue.field)}`} onClick={event => { event.preventDefault(); document.getElementById(fieldId(issue.field))?.focus() }}>{issue.field.startsWith('items.') ? `Product ${Number(issue.field.split('.')[1]) + 1}: ` : ''}{issue.message}</a></li>)}</ul></details>
              <p>Physical catalog issues block calculation, but you can save valid order details to recheck matches. Measurements are read-only; correct them in Products and boxes.</p>
              {catalogError && <p>Live catalog could not be loaded. Only previously returned packing data is shown; rotation and availability may be unknown. Save to retry.</p>}
            </div>
            <div className="order-fields">
              <label><span>Order number</span><Input {...inputAttributes('order_number')} disabled={busy} value={draft.order_number} onChange={(e) => editDraft({ ...draft, order_number: e.target.value })} /></label>
              <label className="wide"><span>Customer</span><Input {...inputAttributes('client')} disabled={busy} value={draft.client} onChange={(e) => editDraft({ ...draft, client: e.target.value })} /></label>
              <label><span>Supplier</span><Input {...inputAttributes('vendor')} disabled={busy} value={draft.vendor} onChange={(e) => editDraft({ ...draft, vendor: e.target.value })} /></label>
              <label><span>Order date</span><Input {...inputAttributes('order_date')} disabled={busy} type="date" value={draft.order_date} onChange={(e) => editDraft({ ...draft, order_date: e.target.value })} /></label>
              <label><span>Requested date</span><Input {...inputAttributes('requested_date')} disabled={busy} type="date" value={draft.requested_date} onChange={(e) => editDraft({ ...draft, requested_date: e.target.value })} /></label>
              <label><span>Currency</span><select {...inputAttributes('currency')} disabled={busy} value={draft.currency} onChange={(e) => editDraft({ ...draft, currency: e.target.value })}><option>USD</option><option>EUR</option><option>GBP</option></select></label>
            </div>
            {errors.filter(issue => !issue.field.startsWith('items')).map((issue, index) => <p className="field-error" id={`${fieldId(issue.field)}-error`} key={`${issue.field}-${index}`}>{issue.message}</p>)}
            <div className="commercial-fields">
              <label><span>Delivery address</span><textarea {...inputAttributes('delivery_address')} disabled={busy} value={draft.delivery_address} onChange={(e) => editDraft({ ...draft, delivery_address: e.target.value })} /></label>
              <label><span>Billing address</span><textarea {...inputAttributes('billing_address')} disabled={busy} value={draft.billing_address} onChange={(e) => editDraft({ ...draft, billing_address: e.target.value })} /></label>
              <label><span>Terms</span><textarea {...inputAttributes('terms')} disabled={busy} value={draft.terms} onChange={e => editDraft({ ...draft, terms: e.target.value })} /></label>
              <label><span>Notes</span><textarea {...inputAttributes('notes')} disabled={busy} value={draft.notes} onChange={e => editDraft({ ...draft, notes: e.target.value })} /></label>
            </div>
            <div className="order-totals-edit">
              <label><span>SUBTOTAL</span><div><small>{draft.currency}</small><Input {...inputAttributes('subtotal')} disabled={busy} type="number" min="0" step="0.01" value={draft.subtotal} onChange={(e) => editDraft({ ...draft, subtotal: Number(e.target.value) })} /></div></label>
              <label><span>TAXES</span><div><small>{draft.currency}</small><Input {...inputAttributes('tax_amount')} disabled={busy} type="number" min="0" step="0.01" value={draft.tax_amount} onChange={(e) => editDraft({ ...draft, tax_amount: Number(e.target.value) })} /></div></label>
              <label><span>TOTAL</span><div><small>{draft.currency}</small><Input {...inputAttributes('total_amount')} disabled={busy} type="number" min="0" step="0.01" value={draft.total_amount} onChange={(e) => editDraft({ ...draft, total_amount: Number(e.target.value) })} /></div></label>
            </div>
            <div className="review-items-head" id={fieldId('items')} tabIndex={-1}><div><h3>Products to pack</h3><p>Check quantities, catalog matches, dimensions and unit weights.</p></div><button disabled={busy} onClick={() => editDraft({ ...draft, items: [...draft.items, { description: '', quantity: 1, unit_price: 0, requested_date: '', tax_label: '', discount_percent: 0, amount: 0 }] })}><Plus size={15} /> Add line item</button></div>
            <p className="packing-data-note">Catalog measurements may include provisional values from the reference workbook. Confirm them before using this plan for shipping.</p>
            <div className="review-product-list">
              {draft.items.map((item, index) => <ReviewProductRow key={`${item.id || 'new'}-${index}`} item={item} index={index} original={matchedItems.find(original => original.id != null && original.id === item.id)} catalog={catalog} issues={issues} busy={busy} onChange={patch => updateItem(index, patch)} onRemove={() => editDraft(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))} />)}
              {!draft.items.length && <div className="empty-row">No line items. Add at least one product.</div>}
            </div>
            <footer className="review-footer"><span><AlertTriangle size={17} /> {errors.length ? 'Resolve blocking issues before calculation.' : 'Confirm the catalog measurements and quantities.'}</span><div><Button className="button button--ghost" disabled={busy} onClick={() => saveReview(false)}><Save size={16} /> Save and recheck</Button><Button className="button button--accent" disabled={busy} onClick={() => saveReview(true)}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} Validate and calculate</Button></div></footer>
          </article>
          <aside className="source-card">{order.source_type==='pdf' ? <SourceDocument key={order.id} orderId={order.id} filename={order.source_filename}/> : <section className="source-document"><h3>{order.source_type==='email'?'Received email':'Manual entry'}</h3><p>{order.source_type==='email'?'The original pasted email is kept in Notes.':'This order was entered manually.'}</p></section>}</aside>
        </section>
      ) : result && selectedBox ? (
        <>
          <h2 id="packing-performance-title" tabIndex={-1} className="results-heading">Packing performance</h2>
          <section className="plan-kpis" aria-labelledby="packing-performance-title">
            <article><span>BOXES REQUIRED</span><strong>{result.box_count}<small> {result.box_count === 1 ? 'box' : 'boxes'}</small></strong><i><Package /></i></article>
            <article><span>TOTAL UTILIZATION <details className="metric-help"><summary aria-label="How total utilization is calculated">?</summary><p>Total packed product volume divided by the total volume of selected boxes. This is volume-weighted, not an average of box percentages. Unassigned units are excluded.</p></details></span><strong>{result.average_utilization}<small>%</small></strong><i><Box /></i></article>
            <article><span>GROSS WEIGHT</span><strong>{result.total_weight_kg}<small> kg</small></strong><i><Scale /></i></article>

          </section>
          <section className="commercial-summary" aria-labelledby="commercial-summary-title">
            <header><h2 id="commercial-summary-title">Order information</h2><p>Customer and commercial details</p></header>
            <dl>
              <div><dt>Customer</dt><dd>{order.client}</dd></div>
              <div><dt>Order number</dt><dd>{order.order_number}</dd></div>
              <div><dt>Order value</dt><dd>{order.currency} {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd></div>
              <div><dt>Supplier</dt><dd>{order.vendor || 'Not provided'}</dd></div>
            </dl>
          </section>
          <BoxNavigation boxes={result.boxes} selectedIndex={selectedIndex} onSelect={setBoxIndex}/>
          <p className="selected-box-status" role="status">Box {String(selectedBox.sequence).padStart(2, '0')} of {result.boxes.length} · {selectedBox.box_code} · {selectedBox.utilization}% utilized · {selectedBox.placements.length} {selectedBox.placements.length === 1 ? 'unit' : 'units'}</p>
          <section id="selected-box-details" className="packing-workbench" aria-labelledby={`select-box-${selectedBox.sequence}`}>
            <article className="panel box-selector-panel">
              <header className="panel-header"><div><span className="panel-index">01</span><div><h2>Proposed layout</h2><p>{result.method}</p><p className="packing-checks">The engine checks dimensions, permitted rotations and gross weight; its space partitioning avoids overlaps. Stability, support and fragile stacking are not checked. The viewer does not independently verify geometry.</p></div></div><span className="verified-label"><Check size={14} /> ENGINE-GENERATED LAYOUT</span></header>
              <div className="box-switcher">
                <button aria-label="Previous box" disabled={selectedIndex === 0} onClick={() => setBoxIndex(selectedIndex - 1)}><ChevronLeft /></button>
                <div><span>BOX {String(selectedBox.sequence).padStart(2, '0')} / {String(result.box_count).padStart(2, '0')}</span><h3>{selectedBox.box_name}</h3></div>
                <button aria-label="Next box" disabled={selectedIndex === result.boxes.length - 1} onClick={() => setBoxIndex(selectedIndex + 1)}><ChevronRight /></button>
              </div>
              <BoxVisual key={`${order.plan?.id}-${selectedBox.sequence}`} box={selectedBox} />
            </article>
            <aside className="box-inspector">
              <div className="inspector-head"><span>BOX {String(selectedBox.sequence).padStart(2, '0')}</span><strong>{selectedBox.box_code}</strong><em>{selectedBox.box_name}</em></div>
              <div className="utilization-readout"><div className="box-gauge" role="img" aria-label={`${selectedBox.utilization}% volume utilization`}><Gauge value={selectedBox.utilization} width={90} height={90} totalNotches={40} spacing={45} activeFill="#389D9B" inactiveFill="#E5E5E3"/><strong>{selectedBox.utilization}%</strong></div><div><b>Volume utilization</b><p>{selectedBox.remaining_volume_l} L available</p></div></div>
              <div className="inspector-metrics"><span><small>GROSS WEIGHT</small><b>{selectedBox.gross_weight_kg} kg</b></span><span><small>CAPACITY</small><b>{selectedBox.max_weight_kg} kg</b></span><span><small>UNITS</small><b>{selectedBox.placements.length}</b></span><span><small>DIMENSIONS</small><b>{selectedBox.dimensions_cm.join('×')}</b></span></div>
              <div className="contents-list"><h3>Contents</h3>{selectedBox.items.map((item) => <div key={item.sku}><i /><span><b>{item.name}</b></span><strong>×{item.quantity}</strong></div>)}</div>
            </aside>
          </section>
          <section className="plan-bottom-grid">
            <article className="panel recommendation-panel">
              <header className="panel-header"><div><span className="panel-index">02</span><div><h2>Optimize unused space</h2><p>Products that fit in the selected boxes. Apply one alternative at a time.</p></div></div></header>
              {undo && undo.planId===order.plan?.id && <div className="undo-addition" role="status"><span>The last addition can be undone.</span><button disabled={busy} onClick={undoAddition}>Undo last addition</button></div>}
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
                <div><strong>{recommendation.description}</strong><p>Add {recommendation.quantity} units · utilization {result.average_utilization}% → {recommendation.projected_utilization}%</p></div>
                <div className="recommendation-price"><span>{recommendation.unit_price ? `+${order.currency} ${recommendation.amount.toFixed(2)}` : 'Pricing pending'}</span><small>{recommendation.unit_price ? `${order.currency} ${recommendation.unit_price.toFixed(2)} / unit` : 'Complete during review'}</small></div>
                <button disabled={busy} onClick={() => previewRecommendation(recommendation)}>Preview addition</button>
              </div>)}
              {!(result.product_recommendations || []).length && <div className="recommendation-empty"><Sparkles size={18} /><span>No additional units of the ordered products fit in the selected boxes.</span></div>}
              <div className="operational-notes">{prioritySuggestions(result.suggestions).map((suggestion, index) => <div className={`recommendation recommendation--${suggestion.type}`} key={`${suggestion.title}-${index}`}><i><Sparkles size={18} /></i><div><strong>{suggestion.type==='warning'?'Warning':suggestion.type==='weight'?'Weight warning':suggestion.type==='space'?'Space suggestion':suggestion.type==='success'?'Success':'Information'} · {suggestion.title}</strong><p>{suggestion.detail}</p>{suggestion.type==='space' && <p>No automatic alternative-layout comparison is available. Review the selected boxes or preview an additional product below.</p>}</div><span>{String(index + 1).padStart(2, '0')}</span></div>)}</div>
            </article>
            <article className="panel item-summary-panel"><header className="panel-header"><div><span className="panel-index">03</span><div><h2>Order summary</h2><p>{result.unit_count} units across {order.items.length} line items</p></div></div></header><div className="simple-items simple-items--products"><div><span>PRODUCT</span><span>QTY.</span><span>UNIT WEIGHT</span></div>{order.items.map((item) => <div key={item.id}><span>{item.description}</span><span>{item.quantity}</span><span>{item.weight_kg?.toFixed(2) || '—'} kg</span></div>)}</div></article>
          </section>
        </>
      ) : <div className="empty-state"><Package size={42} /><h2>This order does not have a packing plan yet.</h2><p>Review its line items to calculate a plan.</p><Button className="button button--accent" onClick={() => setEditing(true)}>Review order</Button></div>}
    </div>
  )
}
