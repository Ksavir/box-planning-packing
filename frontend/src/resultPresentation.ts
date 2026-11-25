import type { OrderDetailData } from './types'

/** Keep navigation and all selected-box views valid when a new plan has fewer boxes. */
export function boundedBoxIndex(index: number, count: number) {
  if (!Number.isInteger(index) || index < 0 || count <= 0) return 0
  return Math.min(index, count - 1)
}

export function extractionConfidence(order: Pick<OrderDetailData, 'source_type' | 'confidence'>) {
  if (order.source_type === 'manual') return {
    label: 'No extraction score',
    explanation: 'This order was entered manually. Verify the order details and packing data before calculating.',
  }
  const score = order.confidence
  if (!Number.isFinite(score) || score < 0 || score > 1) return {
    label: 'Extraction score unavailable',
    explanation: 'There is no valid extraction score for this order. Verify the extracted fields against the source.',
  }
  if (score === 1) return {
    label: 'Review score 100%',
    explanation: 'Saving reviewed order details sets this score to 100%. It does not mean every field is correct or that extraction was independently verified.',
  }
  return {
    label: `Extraction score ${Math.round(score * 100)}%`,
    explanation: 'This is an order-level extraction heuristic, not the probability that every field is correct. Even a 99% score does not verify individual descriptions, quantities or prices.',
  }
}
