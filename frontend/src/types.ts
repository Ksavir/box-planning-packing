export type Page = 'dashboard' | 'orders' | 'catalog' | 'order'

export interface OrderSummary {
  id: number
  order_number: string
  client: string
  vendor: string
  order_date: string
  requested_date?: string | null
  currency: string
  source_filename?: string
  source_type: 'pdf' | 'manual' | 'email'
  total_amount: number
  status: string
  confidence: number
  line_count: number
  unit_count: number
  box_count?: number
  average_utilization?: number
  total_weight_kg?: number
}

export interface DashboardData {
  kpis: {
    orders: number
    ready: number
    boxes: number
    average_utilization: number
    total_weight_kg: number
  }
  orders: OrderSummary[]
  utilization_series: { label: string; value: number }[]
}

export interface OrderItem {
  id?: number
  description: string
  quantity: number
  unit_price: number
  line_number?: number
  requested_date?: string | null
  tax_label?: string
  discount_percent?: number
  amount?: number
  is_suggested?: number
  product_id?: number | null
  product_name?: string
  weight_kg?: number
  length_cm?: number
  width_cm?: number
  height_cm?: number
}

export interface Placement {
  uid: string
  sku: string
  name: string
  position: [number, number, number]
  dimensions: [number, number, number]
}

export interface PackedBox {
  sequence: number
  box_type_id: number
  box_code: string
  box_name: string
  dimensions_cm: [number, number, number]
  utilization: number
  product_weight_kg: number
  gross_weight_kg: number
  max_weight_kg: number
  remaining_volume_l: number
  items: { sku: string; name: string; quantity: number }[]
  placements: Placement[]
}

export interface PackingResult {
  status: string
  box_count: number
  unit_count: number
  average_utilization: number
  total_weight_kg: number
  unplaced: { sku: string; name: string; uid: string }[]
  boxes: PackedBox[]
  suggestions: { type: string; title: string; detail: string }[]
  product_recommendations: {
    type: 'product'
    source_item_id: number
    product_id: number
    description: string
    quantity: number
    unit_price: number
    amount: number
    projected_utilization: number
    box_count: number
  }[]
  method: string
}

export interface PackingPlan {
  id: number
  order_id: number
  box_count: number
  average_utilization: number
  total_weight_kg: number
  created_at: string
  result: PackingResult
}

export interface OrderDetailData {
  id: number
  order_number: string
  client: string
  vendor: string
  order_date: string
  requested_date?: string | null
  currency: string
  source_filename?: string
  source_type: 'pdf' | 'manual' | 'email'
  delivery_address: string
  billing_address: string
  terms: string
  notes: string
  subtotal: number
  tax_amount: number
  total_amount: number
  status: string
  confidence: number
  items: OrderItem[]
  extraction_warnings?: string[]
  plan?: PackingPlan | null
}

export interface AnalysisReport {
  id: number
  order_id: number
  plan_id: number
  filename: string
  created_at: string
  download_url: string
}

export interface Product {
  id: number
  name: string
  length_cm: number
  width_cm: number
  height_cm: number
  weight_kg: number
  rotation_allowed: number
  fragile: number
  active: number
}

export interface BoxType {
  id: number
  code: string
  name: string
  length_cm: number
  width_cm: number
  height_cm: number
  empty_weight_kg: number
  max_weight_kg: number
  active: number
}

