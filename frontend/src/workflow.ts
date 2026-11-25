import type { OrderSummary, PackingResult } from './types'
export function statusLabel(status: string) {
  return ({ needs_review: 'Needs review', ready: 'Validated', packed: 'Packing ready', attention: 'Needs attention' } as Record<string,string>)[status] || 'Unknown status'
}
export function sortOrders(orders: OrderSummary[], key: string) {
  return [...orders].sort((a,b) => key === 'customer' ? a.client.localeCompare(b.client) : key === 'utilization' ? (b.average_utilization ?? -1) - (a.average_utilization ?? -1) : key === 'number' ? a.order_number.localeCompare(b.order_number, undefined, {numeric:true}) : (b.order_date || '').localeCompare(a.order_date || '') || b.id - a.id)
}
export function prioritySuggestions(suggestions: PackingResult['suggestions']) {
  const priority: Record<string,number> = {warning:0,weight:1,space:2,info:3,success:4}
  return [...suggestions].sort((a,b)=>(priority[a.type] ?? 3)-(priority[b.type] ?? 3))
}
export interface RecommendationPreview {
  plan_id: number; source_item_id: number; quantity: number; description: string; amount: number; requires_pricing: boolean
  current_order_total: number; projected_order_total: number
  current_utilization: number; projected_utilization: number
  boxes: {sequence:number;box_code:string;quantity:number;current_utilization:number;projected_utilization:number}[]
  result: PackingResult
}
