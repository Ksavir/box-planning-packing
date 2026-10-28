import { AlertTriangle, LoaderCircle, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from '../hooks/useDialogFocus'

interface Props {
  count: number
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}

export function DeleteOrdersDialog({ count, busy, error, onClose, onConfirm }: Props) {
  const dialogRef = useDialogFocus(onClose, busy)
  return createPortal(
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="delete-orders-title" aria-describedby="delete-orders-description">
      <button className="modal-backdrop" disabled={busy} onClick={onClose} aria-label="Cancel deletion" />
      <section className="upload-modal delete-orders-dialog" ref={dialogRef}>
        <header><div><span className="eyebrow">ORDER HISTORY</span><h2 id="delete-orders-title">Delete all orders?</h2></div><button className="icon-button" disabled={busy} onClick={onClose} aria-label="Close dialog"><X size={20} /></button></header>
        <div className="delete-orders-body"><AlertTriangle size={28} /><p id="delete-orders-description">This will permanently delete all {count} orders, their packing plans and saved PDF reports. Your product and box catalogs will be kept. This cannot be undone.</p></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer><button className="button button--ghost" disabled={busy} onClick={onClose}>Keep orders</button><button className="button button--danger" disabled={busy} onClick={onConfirm}>{busy ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}{busy ? 'Deleting…' : 'Delete all orders'}</button></footer>
      </section>
    </div>, document.body,
  )
}
