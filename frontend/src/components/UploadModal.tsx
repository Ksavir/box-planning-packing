import {
  Check,
  FileText,
  Keyboard,
  LoaderCircle,
  Mail,
  Plus,
  ScanLine,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import type { OrderDetailData } from '../types'

interface UploadModalProps {
  onClose: () => void
  onComplete: (order: OrderDetailData) => void
}

interface ManualItem {
  description: string
  quantity: number
  unit_price: number
}

const emptyItem = (): ManualItem => ({ description: '', quantity: 1, unit_price: 0 })

export function UploadModal({ onClose, onComplete }: UploadModalProps) {
  const [mode, setMode] = useState<'pdf' | 'manual' | 'email'>('pdf')
  const [email, setEmail] = useState({ text: '', client: '', subject: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useDialogFocus(onClose, busy)
  const [manual, setManual] = useState({
    order_number: '', client: '', vendor: 'Thought3D Ltd',
    order_date: new Date().toISOString().slice(0, 10), requested_date: '',
    currency: 'USD', delivery_address: '', terms: '', notes: '', items: [emptyItem()],
  })
  const inputRef = useRef<HTMLInputElement>(null)

  const selectFile = (selected?: File) => {
    if (!selected) return
    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) { setError('Select a PDF document.'); return }
    if (selected.size > 15 * 1024 * 1024) { setError('The PDF exceeds 15 MB. Select a smaller file.'); return }
    setError(''); setFile(selected)
  }

  const submitPdf = async () => {
    if (!file) return
    setBusy(true); setError('')
    try { onComplete(await api.uploadOrder(file)) }
    catch (err) { setError(err instanceof Error ? err.message : 'The PDF could not be processed.'); setBusy(false) }
  }

  const submitEmail = async () => {
    if (!email.text.trim()) { setError('Paste the email you received.'); return }
    setBusy(true); setError('')
    try { onComplete(await api.createEmailOrder(email)) }
    catch (err) { setError(err instanceof Error ? err.message : 'The email could not be processed.'); setBusy(false) }
  }

  const submitManual = async () => {
    const validItems = manual.items.filter((item) => item.description.trim())
    if (!manual.order_number.trim() || !manual.client.trim() || !validItems.length) {
      setError('Enter the order number, customer and at least one product.'); return
    }
    if (validItems.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unit_price) || item.unit_price < 0)) { setError('Use whole quantities greater than zero and prices of zero or more.'); return }
    setBusy(true); setError('')
    const subtotal = validItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
    try {
      onComplete(await api.createManualOrder({
        ...manual, requested_date: manual.requested_date || null, billing_address: '',
        subtotal, tax_amount: 0, total_amount: subtotal,
        items: validItems.map((item, index) => ({
          ...item, line_number: index + 1, requested_date: manual.requested_date || null,
          tax_label: '', discount_percent: 0, amount: item.quantity * item.unit_price,
        })),
      }))
    } catch (err) { setError(err instanceof Error ? err.message : 'The order could not be created.'); setBusy(false) }
  }

  const updateItem = (index: number, patch: Partial<ManualItem>) => setManual((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  }))

  return createPortal((
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="New order">
      <button className="modal-backdrop" disabled={busy} onClick={onClose} aria-label="Close" />
      <section ref={dialogRef} className={`upload-modal ${mode !== 'pdf' ? 'upload-modal--manual' : ''}`}>
        <header>
          <div>
            <span className="eyebrow">NEW ORDER</span>
            <h2>{mode === 'pdf' ? 'Let’s start with your order.' : mode === 'email' ? 'Paste your customer’s email.' : 'Create your order, step by step.'}</h2>
          </div>
          <button className="icon-button" disabled={busy} onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </header>

        <div className="ingest-modes" role="group" aria-label="Order source">
          <button disabled={busy} aria-pressed={mode === 'pdf'} className={mode === 'pdf' ? 'active' : ''} onClick={() => { setMode('pdf'); setError('') }}>
            <FileText size={17} /><span><b>From PDF</b><small>Extract a document</small></span>
          </button>
          <button disabled={busy} aria-pressed={mode === 'email'} className={mode === 'email' ? 'active' : ''} onClick={() => { setMode('email'); setError('') }}>
            <Mail size={17} /><span><b>From email</b><small>Paste and extract</small></span>
          </button>
          <button disabled={busy} aria-pressed={mode === 'manual'} className={mode === 'manual' ? 'active' : ''} onClick={() => { setMode('manual'); setError('') }}>
            <Keyboard size={17} /><span><b>Manual entry</b><small>Enter details yourself</small></span>
          </button>
        </div>

        {mode === 'pdf' ? (
          <>
            <div className="upload-steps">
              <span className="active"><b>01</b> Document</span><i />
              <span><b>02</b> Review</span><i />
              <span><b>03</b> Packing</span>
            </div>
            <button className={`drop-zone ${file ? 'drop-zone--ready' : ''}`}
              onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); const dropped = event.dataTransfer.files[0]; selectFile(dropped) }}>
              <input ref={inputRef} type="file" accept="application/pdf" onChange={(event) => selectFile(event.target.files?.[0])} hidden />
              {file ? <><div className="file-ready-icon"><FileText size={27} /><Check size={15} /></div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · READY TO PROCESS</span></>
                : <><div className="drop-icon"><UploadCloud size={30} /></div><strong>Drag and drop a purchase order</strong><span>or click to select a PDF · MAX. 15 MB</span></>}
            </button>
            <div className="extraction-note"><ScanLine size={21} /><div><strong>Assisted extraction</strong><span>We will extract the customer, supplier, dates, terms, line items and totals. You can edit everything before calculating.</span></div></div>
          </>
        ) : mode === 'email' ? (
          <div className="email-order-form">
            <div className="extraction-note"><ScanLine size={21} /><div><strong>From email to packing plan</strong><span>Paste the full email below. We’ll extract products and quantities, then you can review the details and calculate the boxes. Prices can be completed later.</span></div></div>
            <div className="email-metadata">
              <label><span>Customer (optional)</span><input value={email.client} onChange={event => setEmail({ ...email, client: event.target.value })} placeholder="Detected from the signature when available" /></label>
              <label><span>Subject (optional)</span><input value={email.subject} onChange={event => setEmail({ ...email, subject: event.target.value })} placeholder="Pricing and lead time" /></label>
            </div>
            <label className="email-body"><span>Received email *</span><textarea autoFocus maxLength={100000} value={email.text} onChange={event => setEmail({ ...email, text: event.target.value })} placeholder="Paste your email here, including the products and quantities requested." /></label>
            <p className="email-helper">Use explicit quantities, such as “Product – 15 pcs” or “15 x Product”. You can correct any details in the next step.</p>
          </div>
        ) : (
          <div className="manual-order-form">
            <div className="manual-context"><Mail size={18} /><span><b>Flexible entry</b><small>Copy the essential details from the email. You can review the full order next.</small></span></div>
            <div className="manual-fields">
              <label><span>Order number *</span><input value={manual.order_number} onChange={(event) => setManual({ ...manual, order_number: event.target.value.toUpperCase() })} placeholder="PO-0000" /></label>
              <label className="wide"><span>Customer *</span><input value={manual.client} onChange={(event) => setManual({ ...manual, client: event.target.value })} placeholder="Customer company" /></label>
              <label><span>Supplier</span><input value={manual.vendor} onChange={(event) => setManual({ ...manual, vendor: event.target.value })} /></label>
              <label><span>Order date</span><input type="date" value={manual.order_date} onChange={(event) => setManual({ ...manual, order_date: event.target.value })} /></label>
              <label><span>Requested date</span><input type="date" value={manual.requested_date} onChange={(event) => setManual({ ...manual, requested_date: event.target.value })} /></label>
              <label><span>Currency</span><select value={manual.currency} onChange={(event) => setManual({ ...manual, currency: event.target.value })}><option>USD</option><option>EUR</option><option>GBP</option></select></label>
              <label className="wide"><span>Delivery address</span><textarea value={manual.delivery_address} onChange={(event) => setManual({ ...manual, delivery_address: event.target.value })} placeholder="Name, street, city, country" /></label>
              <label><span>Terms</span><input value={manual.terms} onChange={(event) => setManual({ ...manual, terms: event.target.value })} placeholder="Payment, delivery…" /></label>
            </div>
            <div className="manual-items-title"><div><strong>Requested products</strong><span>We will use the description to match each product to the catalog.</span></div><button onClick={() => setManual({ ...manual, items: [...manual.items, emptyItem()] })}><Plus size={15} /> Add product</button></div>
            <div className="manual-item-list">
              <div className="manual-item-head"><span>DESCRIPTION *</span><span>QTY.</span><span>PRICE</span><span>AMOUNT</span><span /></div>
              {manual.items.map((item, index) => (
                <div className="manual-item" key={index}>
                  <input aria-label={`Product description ${index + 1}`} value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="Requested product" />
                  <input aria-label={`Product quantity ${index + 1}`} type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
                  <input aria-label={`Product price ${index + 1}`} type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })} />
                  <strong>{manual.currency} {(item.quantity * item.unit_price).toFixed(2)}</strong>
                  <button aria-label={`Remove product ${index + 1}`} disabled={manual.items.length === 1} onClick={() => setManual({ ...manual, items: manual.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p role="alert" className="form-error">{error}</p>}
        <footer>
          <button className="button button--ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="button button--accent" disabled={busy || (mode === 'pdf' && !file) || (mode === 'email' && !email.text.trim())} onClick={mode === 'pdf' ? submitPdf : mode === 'email' ? submitEmail : submitManual}>
            {busy ? <LoaderCircle className="spin" size={18} /> : mode === 'pdf' ? <ScanLine size={18} /> : <Check size={18} />}
            {busy ? 'Processing…' : mode === 'pdf' ? 'Process document' : mode === 'email' ? 'Extract and review order' : 'Create and review order'}
          </button>
        </footer>
      </section>
    </div>
  ), document.body)
}
