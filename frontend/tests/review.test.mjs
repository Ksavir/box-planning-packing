import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Exercise the pure UI boundary using the already-installed TS compiler and Node runner.
// No additional framework or runtime dependency is needed.
async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const { makeDraft, packingState, validateReview, reviewPayload, serverIssues } = await loadModule('../src/review.ts')
const { api, ApiError } = await loadModule('../src/api.ts')
const product = { id: 4, name: 'Catalog unit', length_cm: 10, width_cm: 5, height_cm: 2, weight_kg: .085, active: 1, rotation_allowed: 0, fragile: 1 }
const item = { id: 1, product_id: 4, product_name: product.name, description: 'Alias accepted by server', quantity: 2, unit_price: 10, amount: 18, discount_percent: 10, length_cm: 10, width_cm: 5, height_cm: 2, weight_kg: .085 }
const order = { id: 1, order_number: 'QA-1', client: 'Synthetic customer', currency: 'USD', vendor: '', subtotal: 18, tax_amount: 2, total_amount: 20, terms: 'Net 30', notes: 'Keep separate', items: [item], order_date: null }
const errors = draft => validateReview(draft, order.items, [product]).filter(i => i.kind === 'error')

test('server-confirmed aliases expose real dimensions, weight and orientation flags', () => {
  const state = packingState(item, item, [product])
  assert.equal(state.status, 'matched')
  assert.deepEqual(state.dimensions, [10, 5, 2])
  assert.equal(state.weight, .085)
  assert.equal(state.product.rotation_allowed, 0)
  assert.equal(state.product.fragile, 1)
})
test('editing a description hides stale measurements even when it resembles a catalog name', () => {
  const state = packingState({ ...item, description: 'Catalog unit' }, item, [product])
  assert.equal(state.status, 'pending')
  assert.equal(state.dimensions, undefined)
  assert.equal(state.weight, undefined)
})
test('new lines require server validation rather than guessed local aliases', () => {
  assert.equal(packingState({ ...item, id: undefined }, undefined, [product]).status, 'pending')
})
test('missing and inactive matches block packing without hiding the cause', () => {
  assert.equal(packingState(item, { ...item, product_id: null }, [product]).status, 'missing')
  assert.equal(packingState(item, item, [{ ...product, active: 0 }]).status, 'inactive')
  assert.equal(packingState(item, item, []).status, 'inactive')
})
test('missing/zero/nonfinite physical data is not replaced with invented dimensions', () => {
  for (const bad of [undefined, null, 0, -1, NaN, Infinity]) {
    assert.equal(packingState(item, item, [{ ...product, length_cm: bad }]).status, 'incomplete')
    assert.equal(packingState(item, item, [{ ...product, weight_kg: bad }]).status, 'incomplete')
  }
})
test('catalog outage uses response measurements and does not invent rotation data', () => {
  const state = packingState(item, item)
  assert.equal(state.status, 'matched')
  assert.equal(state.product, undefined)
  assert.deepEqual(state.dimensions, [10, 5, 2])
})
test('valid draft has no blocking errors; blank dates retain nullable API semantics', () => {
  const draft = makeDraft(order)
  assert.deepEqual(errors(draft), [])
  assert.equal(reviewPayload(draft).order_date, null)
  assert.equal(reviewPayload(draft).requested_date, null)
})
test('required order fields, empty items and empty descriptions produce focusable targets', () => {
  const draft = makeDraft({ ...order, client: '', order_number: '' })
  draft.items[0].description = ''
  assert.deepEqual(new Set(errors(draft).map(i => i.field)), new Set(['client','order_number','items.0.description']))
  draft.items = []
  assert.ok(errors(draft).some(i => i.field === 'items'))
})
test('quantity must be a finite positive integer', () => {
  for (const bad of [0, -1, .5, NaN, Infinity]) {
    const draft = makeDraft(order); draft.items[0].quantity = bad
    assert.ok(errors(draft).some(i => i.field === 'items.0.quantity'))
  }
})
test('financial bounds and discount bounds are enforced without changing valid values', () => {
  for (const field of ['unit_price', 'amount']) {
    const draft = makeDraft(order); draft.items[0][field] = -1
    assert.ok(errors(draft).some(i => i.field === `items.0.${field}`))
  }
  for (const value of [-1, 101, Infinity]) {
    const draft = makeDraft(order); draft.items[0].discount_percent = value
    assert.ok(errors(draft).some(i => i.field === 'items.0.discount_percent'))
  }
  for (const field of ['subtotal','tax_amount','total_amount']) {
    const draft = makeDraft(order); draft[field] = NaN
    assert.ok(errors(draft).some(i => i.field === field))
  }
})
test('zero price is a warning, not a packing blocker', () => {
  const draft = makeDraft(order); draft.items[0].unit_price = 0
  assert.deepEqual(errors(draft), [])
  assert.ok(validateReview(draft, order.items, [product]).some(i => i.kind === 'warning' && i.field === 'items.0.unit_price'))
})
test('unknown match errors can be distinguished from errors blocking save', () => {
  const original = { ...item, product_id: null }
  const issues = validateReview(makeDraft({ ...order, items: [original] }), [original], [product])
  assert.ok(issues.some(i => i.kind === 'error' && i.packingOnly))
  assert.equal(issues.filter(i => i.kind === 'error' && !i.packingOnly).length, 0)
})
test('payload preserves supplied amounts, discounts, totals, suggested flag, terms and notes', () => {
  const draft = makeDraft({ ...order, subtotal: 99, total_amount: 105, items: [{ ...item, amount: 7, is_suggested: 1 }] })
  const payload = reviewPayload(draft)
  assert.equal(payload.items[0].amount, 7)
  assert.equal(payload.items[0].discount_percent, 10)
  assert.equal(payload.items[0].is_suggested, true)
  assert.equal(payload.subtotal, 99)
  assert.equal(payload.total_amount, 105)
  assert.equal(payload.terms, 'Net 30')
  assert.equal(payload.notes, 'Keep separate')
  assert.equal(payload.items[0].product_id, undefined)
})
test('seeded zero totals remain unchanged and are explained as server fallbacks', () => {
  const draft = makeDraft({ ...order, subtotal: 0, total_amount: 0, items: [{ ...item, amount: 0, discount_percent: 0 }] })
  assert.equal(draft.items[0].amount, 20)
  assert.equal(draft.total_amount, 0)
  assert.equal(reviewPayload(draft).subtotal, 0)
  assert.ok(validateReview(draft, order.items, [product]).some(i => i.kind === 'warning' && i.field === 'subtotal'))
})
test('Pydantic errors map to fields; unknown paths fall back to the products section', () => {
  assert.deepEqual(serverIssues([
    { loc: ['body','items',0,'quantity'], msg: 'Must be positive' },
    { loc: ['body','client'], msg: 'Required' },
    { loc: ['body','other'], msg: 'Unexpected' },
  ]).map(i => i.field), ['items.0.quantity','client','items'])
  assert.deepEqual(serverIssues('Not in catalog'), [])
  assert.deepEqual(serverIssues([null, {}]), [])
})
test('API preserves structured validation errors and readable string errors', async () => {
  const previousFetch = globalThis.fetch
  try {
    const details = [{ loc: ['body','items',0,'quantity'], msg: 'Greater than zero' }]
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: details }), { status: 422 })
    await assert.rejects(api.reviewOrder(1, {}), error => error instanceof ApiError && error.status === 422 && serverIssues(error.details)[0].field === 'items.0.quantity')
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Duplicate order number' }), { status: 409 })
    await assert.rejects(api.reviewOrder(1, {}), /Duplicate order number/)
  } finally { globalThis.fetch = previousFetch }
})

test('duplicate order numbers map to the order-number field without guessing other server errors', () => {
  assert.equal(serverIssues('Duplicate order number', 409)[0].field, 'order_number')
  assert.deepEqual(serverIssues('Unknown catalog product', 422), [])
  assert.equal(serverIssues([{loc:['body','items',-1,'quantity'],msg:'Invalid'}])[0].field, 'items')
})

const {statusLabel, sortOrders, prioritySuggestions} = await loadModule('../src/workflow.ts')
test('lifecycle copy reflects the actual four backend states', () => {
  assert.deepEqual(['needs_review','ready','packed','attention'].map(statusLabel), ['Needs review','Validated','Packing ready','Needs attention'])
  assert.equal(statusLabel('other'), 'Unknown status')
})
test('order sorting is numeric for order numbers, handles absent utilization, and preserves input', () => {
  const rows=[{id:1,order_number:'PO-10',client:'Z',order_date:null,average_utilization:null},{id:2,order_number:'PO-2',client:'A',order_date:'2026-11-02',average_utilization:50}]
  for(const key of ['number','customer','date','utilization']) assert.equal(sortOrders(rows,key)[0].id,2)
  assert.equal(rows[0].id,1)
})
test('actionable insights precede success and preserve source order data', () => {
  const rows=[{type:'success'},{type:'space'},{type:'warning'}]
  assert.deepEqual(prioritySuggestions(rows).map(s=>s.type),['warning','space','success'])
  assert.equal(rows[0].type,'success')
})

const { boundedBoxIndex, extractionConfidence } = await loadModule('../src/resultPresentation.ts')
test('selection stays valid when recalculation reduces the box count', () => {
  assert.equal(boundedBoxIndex(4, 2), 1)
  assert.equal(boundedBoxIndex(1, 2), 1)
  assert.equal(boundedBoxIndex(1, 0), 0)
  for (const index of [-1, .5, NaN, Infinity]) assert.equal(boundedBoxIndex(index, 3), 0)
})
test('99% is explained as a global heuristic rather than field accuracy', () => {
  const result = extractionConfidence({source_type:'pdf', confidence:.99})
  assert.equal(result.label, 'Extraction score 99%')
  assert.match(result.explanation, /not the probability/)
  assert.match(result.explanation, /individual descriptions, quantities or prices/)
})
test('100% explains the review reset without certifying extraction', () => {
  const result = extractionConfidence({source_type:'email', confidence:1})
  assert.equal(result.label, 'Review score 100%')
  assert.match(result.explanation, /sets this score to 100%/)
  assert.match(result.explanation, /does not mean every field is correct/)
})
test('manual entry has no misleading extraction confidence', () => {
  const result = extractionConfidence({source_type:'manual', confidence:1})
  assert.equal(result.label, 'No extraction score')
  assert.doesNotMatch(result.label, /100%/)
})
test('invalid or missing scores do not manufacture a confidence value', () => {
  for (const confidence of [undefined,null,NaN,Infinity,-.1,1.1]) {
    assert.equal(extractionConfidence({source_type:'pdf',confidence}).label, 'Extraction score unavailable')
  }
})
