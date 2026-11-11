import type { OrderDetailData, OrderItem, Product } from './types'

export type DraftItem = Omit<OrderItem, 'requested_date'> & { requested_date: string; tax_label: string; discount_percent: number; amount: number }
export const makeDraft = (order: OrderDetailData) => ({
  order_number: order.order_number, client: order.client, vendor: order.vendor || '',
  order_date: order.order_date || '', requested_date: order.requested_date || '', currency: order.currency,
  delivery_address: order.delivery_address || '', billing_address: order.billing_address || '',
  terms: order.terms || '', notes: order.notes || '', subtotal: order.subtotal || 0,
  tax_amount: order.tax_amount || 0, total_amount: order.total_amount || 0,
  items: order.items.map((item): DraftItem => ({ ...item, requested_date: item.requested_date || '', tax_label: item.tax_label || '', discount_percent: item.discount_percent || 0, amount: item.amount || item.quantity * item.unit_price })),
})
export type ReviewDraft = ReturnType<typeof makeDraft>
export interface ReviewIssue { field: string; message: string; kind: 'error' | 'warning'; packingOnly?: boolean }
export const fieldId = (field: string) => `review-${field.replace(/\./g, '-')}`
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

export function packingState(item: OrderItem, original: OrderItem | undefined, catalog?: Product[]) {
  // Only the backend response confirms alias/fuzzy matching. Never guess a new match.
  if (!original || item.description !== original.description) return { status: 'pending' as const }
  if (!original.product_id) return { status: 'missing' as const }
  const product = catalog?.find(p => p.id === original.product_id)
  if (catalog && (!product || !product.active)) return { status: 'inactive' as const }
  const physical = product || original
  const dimensions = [physical.length_cm, physical.width_cm, physical.height_cm]
  const weight = physical.weight_kg
  const valid = dimensions.every(positive) && positive(weight)
  return { status: valid ? 'matched' as const : 'incomplete' as const, dimensions, weight, product, name: product?.name || original.product_name }
}

export function validateReview(draft: ReviewDraft, originals: OrderItem[], catalog?: Product[]): ReviewIssue[] {
  const issues: ReviewIssue[] = []
  const add = (field: string, message: string, kind: ReviewIssue['kind'] = 'error', packingOnly = false) => issues.push({ field, message, kind, packingOnly })
  if (!draft.order_number.trim()) add('order_number', 'Enter an order number.')
  if (!draft.client.trim()) add('client', 'Enter the customer name.')
  if (!draft.items.length) add('items', 'Add at least one product.')
  for (const field of ['subtotal', 'tax_amount', 'total_amount'] as const) {
    if (!Number.isFinite(draft[field]) || draft[field] < 0) add(field, 'Enter a finite amount of zero or more.')
  }
  draft.items.forEach((item, index) => {
    const prefix = `items.${index}.`
    if (!item.description.trim()) add(prefix + 'description', 'Enter a product description.')
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) add(prefix + 'quantity', 'Enter a whole quantity greater than zero.')
    for (const field of ['unit_price', 'amount'] as const) {
      if (!Number.isFinite(item[field]) || item[field] < 0) add(prefix + field, 'Enter a finite amount of zero or more.')
    }
    if (!Number.isFinite(item.discount_percent) || item.discount_percent < 0 || item.discount_percent > 100) add(prefix + 'discount_percent', 'Enter a discount from 0 to 100%.')
    if (item.unit_price === 0) add(prefix + 'unit_price', 'Price is zero or pending. This does not block packing.', 'warning')
    const state = packingState(item, originals.find(o => o.id != null && o.id === item.id), catalog)
    if (item.description.trim() && state.status === 'pending') add(prefix + 'description', 'Description changed or new line. The server will recheck the catalog before calculating.', 'warning')
    if (state.status === 'missing') add(prefix + 'description', 'No catalog match. Correct the description or update the catalog, then save to recheck.', 'error', true)
    if (state.status === 'inactive') add(prefix + 'description', 'The matched product is unavailable or inactive. Update the catalog or description.', 'error', true)
    if (state.status === 'incomplete') add(prefix + 'description', 'The matched product needs positive dimensions and unit weight in the catalog.', 'error', true)
  })
  const lineTotal = draft.items.reduce((sum, item) => sum + item.amount, 0)
  if (Number.isFinite(lineTotal) && lineTotal > 0 && (draft.subtotal === 0 || draft.total_amount === 0)) {
    add('subtotal', 'Zero subtotal or total will use the server calculation on save. Review the line amounts; this screen does not overwrite supplied totals.', 'warning')
  }
  return issues
}

export function reviewPayload(draft: ReviewDraft) {
  return { ...draft, order_date: draft.order_date || null, requested_date: draft.requested_date || null,
    items: draft.items.map((item, index) => ({ description: item.description, quantity: Number(item.quantity), unit_price: Number(item.unit_price), line_number: item.line_number || index + 1, requested_date: item.requested_date || null, tax_label: item.tax_label || '', discount_percent: Number(item.discount_percent || 0), amount: Number(item.amount || 0), is_suggested: Boolean(item.is_suggested) })) }
}

export function serverIssues(details: unknown, status?: number): ReviewIssue[] {
  if (status === 409 && typeof details === 'string') return [{ field: 'order_number', message: details, kind: 'error' }]
  if (!Array.isArray(details)) return []
  const orderFields = new Set(['order_number','client','vendor','order_date','requested_date','currency','delivery_address','billing_address','terms','notes','subtotal','tax_amount','total_amount'])
  const itemFields = new Set(['description','quantity','unit_price','requested_date','tax_label','discount_percent','amount'])
  return details.flatMap((detail: unknown) => {
    if (!detail || typeof detail !== 'object' || !('loc' in detail) || !Array.isArray(detail.loc)) return []
    const loc = detail.loc.filter((part: unknown) => part !== 'body')
    const field = loc.length === 1 && orderFields.has(String(loc[0])) ? String(loc[0]) :
      loc[0] === 'items' && Number.isInteger(loc[1]) && Number(loc[1]) >= 0 && itemFields.has(String(loc[2])) ? `items.${loc[1]}.${loc[2]}` : 'items'
    const message = 'msg' in detail && typeof detail.msg === 'string' ? detail.msg : 'Check this value.'
    return [{ field, message, kind: 'error' as const }]
  })
}
