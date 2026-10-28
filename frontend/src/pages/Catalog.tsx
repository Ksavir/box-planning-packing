import { Box, FileSpreadsheet, PackagePlus, Plus, RotateCcw, Ruler, Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useDialogFocus } from '../hooks/useDialogFocus'
import type { BoxType, Product } from '../types'

interface CatalogProps {
  products: Product[]
  boxes: BoxType[]
  onRefresh: () => void
  notify: (message: string) => void
}

export function Catalog({ products, boxes, onRefresh, notify }: CatalogProps) {
  const [tab, setTab] = useState<'products' | 'boxes'>('products')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const filteredProducts = useMemo(() => products.filter((product) =>
    product.name.toLowerCase().includes(query.toLowerCase()),
  ), [products, query])
  const filteredBoxes = useMemo(() => boxes.filter((box) =>
    `${box.code} ${box.name}`.toLowerCase().includes(query.toLowerCase()),
  ), [boxes, query])

  const importFile = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      const result = await api.importCatalog(tab, file)
      const importedLabel = result.reference_workbook
        ? `${result.imported_products || 0} products and ${result.imported_boxes || 0} boxes imported`
        : `${result.imported} records imported`
      notify(`${importedLabel}${result.errors.length ? ` · ${result.errors.length} with errors` : ''}.`)
      onRefresh()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'The file could not be imported.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="page catalog-page">
      <header className="page-header">
        <div><span className="eyebrow">MASTER DATA / CATALOG</span><h1>Products and boxes</h1><p>Accurate weights and dimensions make better packing plans.</p></div>
        <div className="catalog-health"><span>PACKING CATALOG</span><strong>{products.length + boxes.length} records</strong></div>
      </header>
      <div className="catalog-tabs" role="group" aria-label="Catalog type">
        <button aria-pressed={tab === 'products'} className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><PackagePlus size={18} /> Products <b>{products.length}</b></button>
        <button aria-pressed={tab === 'boxes'} className={tab === 'boxes' ? 'active' : ''} onClick={() => setTab('boxes')}><Box size={18} /> Box types <b>{boxes.length}</b></button>
      </div>
      <section className="panel data-panel catalog-panel">
        <div className="table-tools">
          <label><Search size={17} /><input aria-label="Search the catalog" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${tab === 'products' ? 'product' : 'box'}…`} /></label>
          <div>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => importFile(e.target.files?.[0])} />
            <button disabled={busy} onClick={() => fileRef.current?.click()}><FileSpreadsheet size={16} /> {busy ? 'Importing…' : 'Import Excel'}</button>
            <button className="button button--accent button--small" onClick={() => setShowForm(true)}><Plus size={16} /> {tab === 'products' ? 'Add product' : 'Add box'}</button>
          </div>
        </div>
        {!(tab === 'products' ? filteredProducts : filteredBoxes).length && <div className="empty-row">{query ? 'No matches. Try another name.' : 'Your catalog is empty. Add a record or import an Excel file.'}</div>}
        {tab === 'products' ? (
          <div className="catalog-table product-table">
            <div className="catalog-table-head"><span>PRODUCT</span><span>DIMENSIONS</span><span>WEIGHT</span><span>ROTATION</span><span>TYPE</span><span>STATUS</span></div>
            {filteredProducts.map((product) => (
              <div key={product.id} className="catalog-row">
                <span><i className="product-cube" /><b>{product.name}</b><small>Matched by description</small></span>
                <span><Ruler size={15} /> {product.length_cm} × {product.width_cm} × {product.height_cm} cm</span>
                <span>{product.weight_kg.toFixed(2)} kg</span>
                <span><RotateCcw size={15} /> {product.rotation_allowed ? 'Allowed' : 'Fixed'}</span>
                <span>{product.fragile ? 'Fragile' : 'Standard'}</span>
                <span className="status-pill status-pill--packed"><i />Active</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="catalog-table box-table">
            <div className="catalog-table-head"><span>BOX</span><span>INTERNAL DIMENSIONS</span><span>EMPTY WEIGHT</span><span>MAX. WEIGHT</span><span>VOLUME</span><span>STATUS</span></div>
            {filteredBoxes.map((box) => (
              <div key={box.id} className="catalog-row">
                <span><i className="box-icon-mini"><Box size={16} /></i><b>{box.code}</b><small>{box.name}</small></span>
                <span><Ruler size={15} /> {box.length_cm} × {box.width_cm} × {box.height_cm} cm</span>
                <span>{box.empty_weight_kg.toFixed(2)} kg</span><span>{box.max_weight_kg.toFixed(1)} kg</span>
                <span>{((box.length_cm * box.width_cm * box.height_cm) / 1000).toFixed(1)} L</span>
                <span className="status-pill status-pill--packed"><i />Active</span>
              </div>
            ))}
          </div>
        )}
      </section>
      {showForm && <CatalogForm type={tab} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); notify('Record added to the catalog.'); onRefresh() }} />}
    </div>
  )
}

function CatalogForm({ type, onClose, onSaved }: { type: 'products' | 'boxes'; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialogRef = useDialogFocus<HTMLFormElement>(onClose, busy)
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    const data = new FormData(event.currentTarget)
    const number = (name: string) => Number(data.get(name))
    try {
      if (type === 'products') {
        await api.createProduct({ name: data.get('name'), length_cm: number('length'), width_cm: number('width'), height_cm: number('height'), weight_kg: number('weight'), rotation_allowed: true, fragile: false })
      } else {
        await api.createBox({ code: data.get('code'), name: data.get('name'), length_cm: number('length'), width_cm: number('width'), height_cm: number('height'), empty_weight_kg: number('weight'), max_weight_kg: number('maxWeight') })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the record.')
      setBusy(false)
    }
  }
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={type === 'products' ? 'New product' : 'New box type'}>
      <button className="modal-backdrop" disabled={busy} onClick={onClose} aria-label="Close form" />
      <form ref={dialogRef} className="catalog-form" onSubmit={submit}>
        <header><div><span className="eyebrow">CATALOG / NEW RECORD</span><h2>New {type === 'products' ? 'product' : 'box type'}</h2></div><button type="button" disabled={busy} className="icon-button" aria-label="Close form" onClick={onClose}><X /></button></header>
        <div className="form-grid">
          {type === 'boxes' && <label><span>Code</span><input name="code" required placeholder="BX-01" /></label>}
          <label><span>Name</span><input name="name" required placeholder="Clear description" /></label>
          <label><span>Length (cm)</span><input name="length" type="number" step="0.01" min="0.01" required /></label>
          <label><span>Width (cm)</span><input name="width" type="number" step="0.01" min="0.01" required /></label>
          <label><span>Height (cm)</span><input name="height" type="number" step="0.01" min="0.01" required /></label>
          <label><span>{type === 'products' ? 'Weight (kg)' : 'Empty weight (kg)'}</span><input name="weight" type="number" step="0.01" min={type === 'products' ? '0.01' : '0'} required /></label>
          {type === 'boxes' && <label><span>Max. weight (kg)</span><input name="maxWeight" type="number" step="0.01" min="0.01" required /></label>}
        </div>
        {error && <p role="alert" className="form-error">{error}</p>}
        <footer><button type="button" className="button button--ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="button button--accent" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></footer>
      </form>
    </div>
  )
}

