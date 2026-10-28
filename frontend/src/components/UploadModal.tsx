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
  const [mode, setMode] = useState<'pdf' | 'manual'>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [manual, setManual] = useState({
    order_number: '', client: '', vendor: 'Thought3D Ltd',
    order_date: new Date().toISOString().slice(0, 10), requested_date: '',
    currency: 'USD', delivery_address: '', terms: '', notes: '', items: [emptyItem()],
  })
  const inputRef = useRef<HTMLInputElement>(null)

  const submitPdf = async () => {
    if (!file) return
    setBusy(true); setError('')
    try { onComplete(await api.uploadOrder(file)) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo analizar el PDF.'); setBusy(false) }
  }

  const submitManual = async () => {
    const validItems = manual.items.filter((item) => item.description.trim())
    if (!manual.order_number.trim() || !manual.client.trim() || !validItems.length) {
      setError('Completa el número, el cliente y al menos un producto.'); return
    }
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
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo crear la orden.'); setBusy(false) }
  }

  const updateItem = (index: number, patch: Partial<ManualItem>) => setManual((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  }))

  return createPortal((
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Nueva orden">
      <button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" />
      <section className={`upload-modal ${mode === 'manual' ? 'upload-modal--manual' : ''}`}>
        <header>
          <div>
            <span className="eyebrow">NUEVA ORDEN / INGESTA 01</span>
            <h2>{mode === 'pdf' ? 'Convierte el PDF en un plan de carga.' : 'Registra una solicitud recibida.'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar modal"><X size={20} /></button>
        </header>

        <div className="ingest-modes" role="tablist" aria-label="Origen de la orden">
          <button className={mode === 'pdf' ? 'active' : ''} onClick={() => { setMode('pdf'); setError('') }}>
            <FileText size={17} /><span><b>Desde PDF</b><small>Extraer un documento</small></span>
          </button>
          <button className={mode === 'manual' ? 'active' : ''} onClick={() => { setMode('manual'); setError('') }}>
            <Keyboard size={17} /><span><b>Captura manual</b><small>Correo, llamada o mensaje</small></span>
          </button>
        </div>

        {mode === 'pdf' ? (
          <>
            <div className="upload-steps">
              <span className="active"><b>01</b> Documento</span><i />
              <span><b>02</b> Verificación</span><i />
              <span><b>03</b> Empaque</span>
            </div>
            <button className={`drop-zone ${file ? 'drop-zone--ready' : ''}`}
              onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => { event.preventDefault(); const dropped = event.dataTransfer.files[0]; if (dropped?.type === 'application/pdf') setFile(dropped) }}>
              <input ref={inputRef} type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} hidden />
              {file ? <><div className="file-ready-icon"><FileText size={27} /><Check size={15} /></div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · LISTO PARA PROCESAR</span></>
                : <><div className="drop-icon"><UploadCloud size={30} /></div><strong>Arrastra una orden de compra</strong><span>o haz clic para seleccionar un PDF · MÁX. 15 MB</span></>}
            </button>
            <div className="extraction-note"><ScanLine size={21} /><div><strong>Lectura asistida</strong><span>Extraeremos comprador, proveedor, fechas, condiciones, líneas y totales. Podrás corregir todo antes de calcular.</span></div></div>
          </>
        ) : (
          <div className="manual-order-form">
            <div className="manual-context"><Mail size={18} /><span><b>Entrada flexible</b><small>Copia la información esencial del correo. La orden se abrirá después en la revisión completa.</small></span></div>
            <div className="manual-fields">
              <label><span>Número de orden *</span><input value={manual.order_number} onChange={(event) => setManual({ ...manual, order_number: event.target.value.toUpperCase() })} placeholder="PO-0000" /></label>
              <label className="wide"><span>Cliente *</span><input value={manual.client} onChange={(event) => setManual({ ...manual, client: event.target.value })} placeholder="Empresa solicitante" /></label>
              <label><span>Proveedor</span><input value={manual.vendor} onChange={(event) => setManual({ ...manual, vendor: event.target.value })} /></label>
              <label><span>Fecha de orden</span><input type="date" value={manual.order_date} onChange={(event) => setManual({ ...manual, order_date: event.target.value })} /></label>
              <label><span>Fecha solicitada</span><input type="date" value={manual.requested_date} onChange={(event) => setManual({ ...manual, requested_date: event.target.value })} /></label>
              <label><span>Moneda</span><select value={manual.currency} onChange={(event) => setManual({ ...manual, currency: event.target.value })}><option>USD</option><option>EUR</option><option>GBP</option></select></label>
              <label className="wide"><span>Dirección de entrega</span><textarea value={manual.delivery_address} onChange={(event) => setManual({ ...manual, delivery_address: event.target.value })} placeholder="Nombre, calle, ciudad, país" /></label>
              <label><span>Términos</span><input value={manual.terms} onChange={(event) => setManual({ ...manual, terms: event.target.value })} placeholder="Pago, entrega…" /></label>
            </div>
            <div className="manual-items-title"><div><strong>Productos solicitados</strong><span>Usaremos la descripción para relacionar cada producto con el catálogo.</span></div><button onClick={() => setManual({ ...manual, items: [...manual.items, emptyItem()] })}><Plus size={15} /> Añadir producto</button></div>
            <div className="manual-item-list">
              <div className="manual-item-head"><span>DESCRIPCIÓN *</span><span>CANT.</span><span>PRECIO</span><span>IMPORTE</span><span /></div>
              {manual.items.map((item, index) => (
                <div className="manual-item" key={index}>
                  <input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} placeholder="Producto solicitado" />
                  <input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
                  <input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })} />
                  <strong>{manual.currency} {(item.quantity * item.unit_price).toFixed(2)}</strong>
                  <button disabled={manual.items.length === 1} onClick={() => setManual({ ...manual, items: manual.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="form-error">{error}</p>}
        <footer>
          <button className="button button--ghost" onClick={onClose}>Cancelar</button>
          <button className="button button--accent" disabled={busy || (mode === 'pdf' && !file)} onClick={mode === 'pdf' ? submitPdf : submitManual}>
            {busy ? <LoaderCircle className="spin" size={18} /> : mode === 'pdf' ? <ScanLine size={18} /> : <Check size={18} />}
            {busy ? 'Procesando…' : mode === 'pdf' ? 'Analizar documento' : 'Crear y revisar orden'}
          </button>
        </footer>
      </section>
    </div>
  ), document.body)
}
