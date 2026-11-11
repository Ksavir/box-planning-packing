import { extractionConfidence } from '../resultPresentation'
import type { OrderDetailData } from '../types'
import type { ReviewIssue } from '../review'

export function ExtractionReview({ order, issues, busy, onReview }: {
  order: OrderDetailData
  issues: ReviewIssue[]
  busy: boolean
  onReview: (field: string) => void
}) {
  const confidence = extractionConfidence(order)
  if (order.source_type === 'manual') return null
  const checks = [
    { field: 'client', label: 'Customer and order details' },
    ...(!order.items.length ? [{ field: 'items', label: 'Products to pack — no products found' }] : []),
    ...order.items.flatMap((item, index) => item.is_suggested ? [] : [{ field: `items.${index}.description`, label: `Product ${index + 1}: description, quantity and price` }]),
    { field: 'total_amount', label: 'Subtotal, taxes and order total' },
  ]
  return <section className="extraction-review" aria-labelledby="extraction-review-title">
    <div className="extraction-review-heading"><h2 id="extraction-review-title">Extraction review</h2><span>{confidence.label}</span></div>
    <p>{confidence.explanation}</p>
    <p>Field-level confidence is unavailable. The checks below use validation warnings, not OCR certainty. Compare all extracted values with the original PDF or email.</p>
    <details>
      <summary>Fields to verify ({checks.length})</summary>
      <ul>{checks.map(check => {
        const related = issues.filter(issue => check.field === 'items' ? issue.field === 'items' : check.field.startsWith('items.')
          ? issue.field.startsWith(check.field.slice(0, check.field.lastIndexOf('.') + 1))
          : check.field === 'client' ? ['client', 'order_number'].includes(issue.field)
          : ['subtotal', 'tax_amount', 'total_amount'].includes(issue.field))
        return <li key={check.field}>
          <button className="text-link" disabled={busy} onClick={() => onReview(related[0]?.field || check.field)}>{check.label}</button>
          <span>{related.length ? `${related.length} validation ${related.length === 1 ? 'issue' : 'issues'} to check` : 'Verify against source'}</span>
          {!!related.length && <ul>{related.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
        </li>
      })}</ul>
    </details>
  </section>
}
