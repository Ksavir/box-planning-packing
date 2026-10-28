import type { AnalysisReport, BoxType, DashboardData, OrderDetailData, OrderSummary, Product } from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, options)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: 'The request could not be completed.' }))
    throw new Error(payload.detail || 'The request could not be completed.')
  }
  return response.json() as Promise<T>
}

export const api = {
  dashboard: () => request<DashboardData>('/dashboard'),
  orders: () => request<OrderSummary[]>('/orders'),
  order: (id: number) => request<OrderDetailData>(`/orders/${id}`),
  uploadOrder: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<OrderDetailData>('/orders/upload', { method: 'POST', body })
  },
  createManualOrder: (payload: object) =>
    request<OrderDetailData>('/orders/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  createEmailOrder: (payload: { text: string; client?: string; subject?: string }) =>
    request<OrderDetailData>('/orders/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  savePackingPlan: (id: number) => request<AnalysisReport>(`/orders/${id}/reports`, { method: 'POST' }),
  deleteAllOrders: () => request<{ deleted_orders: number }>('/orders', { method: 'DELETE' }),
  reviewOrder: (id: number, payload: object) =>
    request<OrderDetailData>(`/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  analyzeOrder: (id: number) => request(`/orders/${id}/analyze`, { method: 'POST' }),
  addSuggestedItem: (orderId: number, sourceItemId: number, quantity: number) =>
    request<OrderDetailData>(`/orders/${orderId}/suggested-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_item_id: sourceItemId, quantity }),
    }),
  removeSuggestedItem: (orderId: number, itemId: number) =>
    request<OrderDetailData>(`/orders/${orderId}/suggested-items/${itemId}`, { method: 'DELETE' }),
  exportOrder: async (id: number, orderNumber: string) => {
    const response = await fetch(`/api/orders/${id}/export`)
    if (!response.ok) throw new Error('The plan could not be exported.')
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `plan-${orderNumber}.xlsx`
    anchor.click()
    URL.revokeObjectURL(url)
  },
  exportOrderPdf: async (id: number, orderNumber: string) => {
    const response = await fetch(`/api/orders/${id}/export.pdf`)
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: 'The PDF could not be exported.' }))
      throw new Error(payload.detail || 'The PDF could not be exported.')
    }
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `plan-${orderNumber.replace(/[^a-zA-Z0-9_-]/g, '') || id}.pdf`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Allow the browser to start consuming the file before releasing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
  products: () => request<Product[]>('/catalog/products'),
  boxes: () => request<BoxType[]>('/catalog/boxes'),
  createProduct: (payload: object) =>
    request<Product>('/catalog/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  createBox: (payload: object) =>
    request<BoxType>('/catalog/boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  importCatalog: (type: 'products' | 'boxes', file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<{ imported: number; imported_products?: number; imported_boxes?: number; reference_workbook?: boolean; errors: string[] }>(`/catalog/${type}/import`, {
      method: 'POST',
      body,
    })
  },
}
