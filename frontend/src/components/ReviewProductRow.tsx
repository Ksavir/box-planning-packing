import { Input } from './ui/input'
import { Trash2 } from 'lucide-react'
import type { OrderItem, Product } from '../types'
import { fieldId, packingState, type DraftItem, type ReviewIssue } from '../review'

interface Props {
  item: DraftItem; index: number; original?: OrderItem; catalog?: Product[]; issues: ReviewIssue[]; busy: boolean
  onChange: (patch: Partial<DraftItem>) => void; onRemove: () => void
}
const labels = { matched: 'Catalog matched', pending: 'Needs revalidation', missing: 'No catalog match', inactive: 'Product unavailable', incomplete: 'Missing packing data' }
export function ReviewProductRow({ item, index, original, catalog, issues, busy, onChange, onRemove }: Props) {
  const state = packingState(item, original, catalog)
  const prefix = `items.${index}.`
  const errors = issues.filter(issue => issue.kind === 'error' && issue.field.startsWith(prefix))
  const attributes = (field: string) => {
    const key = prefix + field
    return { id: fieldId(key), 'aria-invalid': errors.some(e => e.field === key) || undefined,
      'aria-describedby': errors.some(e => e.field === key) ? `${fieldId(key)}-error` : undefined }
  }
  const number = (field: 'quantity' | 'unit_price' | 'discount_percent' | 'amount', value: string) => {
    const numeric = Number(value)
    const patch: Partial<DraftItem> = { [field]: numeric }
    if (field !== 'amount') {
      const next = { ...item, ...patch }
      patch.amount = next.quantity * next.unit_price * (1 - next.discount_percent / 100)
    }
    onChange(patch)
  }
  return <section className="review-product" aria-labelledby={`product-heading-${index}`}>
    <header><h4 id={`product-heading-${index}`}>Product {index + 1}</h4><span className={`match-status match-status--${state.status}`}>{labels[state.status]}</span><button type="button" disabled={busy} className="icon-button" onClick={onRemove} aria-label={`Remove line ${index + 1}`}><Trash2 size={17} /></button></header>
    <div className="review-product-fields">
      <label className="product-description"><span>Description *</span><Input {...attributes('description')} disabled={busy} value={item.description} onChange={e => onChange({ description: e.target.value })} /></label>
      <label><span>Quantity *</span><Input {...attributes('quantity')} disabled={busy} type="number" min="1" step="1" value={item.quantity} onChange={e => number('quantity', e.target.value)} /></label>
      <label><span>Unit price</span><Input {...attributes('unit_price')} disabled={busy} type="number" min="0" step="0.01" value={item.unit_price} onChange={e => number('unit_price', e.target.value)} /></label>
      <label><span>Requested date</span><Input {...attributes('requested_date')} disabled={busy} type="date" value={item.requested_date} onChange={e => onChange({ requested_date: e.target.value })} /></label>
      <label><span>Tax label</span><Input {...attributes('tax_label')} disabled={busy} value={item.tax_label} onChange={e => onChange({ tax_label: e.target.value })} /></label>
      <label><span>Discount (%)</span><Input {...attributes('discount_percent')} disabled={busy} type="number" min="0" max="100" step="0.01" value={item.discount_percent} onChange={e => number('discount_percent', e.target.value)} /></label>
      <label><span>Line amount</span><Input {...attributes('amount')} disabled={busy} type="number" min="0" step="0.01" value={item.amount} onChange={e => number('amount', e.target.value)} /></label>
    </div>
    {errors.map((error, i) => <p className="field-error" id={`${fieldId(error.field)}-error`} key={`${error.field}-${i}`}>{error.message}</p>)}
    {state.status === 'matched' || state.status === 'incomplete' ? <dl className="packing-facts" aria-label={`Packing data for product ${index + 1}`}>
      <div><dt>Catalog product</dt><dd>{state.name || 'Not provided'}</dd></div>
      <div><dt>Dimensions (L × W × H)</dt><dd>{state.dimensions?.map(v => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 'Missing').join(' × ')} cm</dd></div>
      <div><dt>Unit weight</dt><dd>{typeof state.weight === 'number' && Number.isFinite(state.weight) && state.weight > 0 ? `${state.weight} kg` : 'Missing'}</dd></div>
      <div><dt>Rotation</dt><dd>{state.product ? state.product.rotation_allowed ? 'Axis rotations allowed' : 'Fixed orientation' : 'Not provided'}</dd></div>
      <div><dt>Fragile flag</dt><dd>{state.product ? state.product.fragile ? 'Yes — stacking safety is not checked' : 'No' : 'Not provided'}</dd></div>
    </dl> : <p className="packing-pending">{state.status === 'pending' ? 'Save to recheck this description, or validate to match it before calculation. Previous measurements are hidden until the server confirms a match.' : 'Packing measurements are unavailable. Correct the description or update the catalog, then save to recheck.'}</p>}
    {item.unit_price === 0 && <p className="review-warning">Price is zero or pending. Packing can still be calculated.</p>}
  </section>
}
