import { Box, FileSpreadsheet, PackagePlus, Plus, RotateCcw, Ruler, Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { api } from '../api'
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
        ? `${result.imported_products || 0} productos y ${result.imported_boxes || 0} cajas importados`
        : `${result.imported} registros importados`
      notify(`${importedLabel}${result.errors.length ? ` · ${result.errors.length} con error` : ''}.`)
      onRefresh()
    } catch (error) {
      notify(error instanceof Error ? error.message : 'No se pudo importar el archivo.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="page catalog-page">
      <header className="page-header">
        <div><span className="eyebrow">DATOS MAESTROS / CATÁLOGO</span><h1>Dimensiones que mandan.</h1><p>La precisión del plan depende del peso y las medidas registradas.</p></div>
        <div className="catalog-health"><span>CALIDAD DE DATOS</span><strong>100%</strong><i><b /></i></div>
      </header>
      <div className="catalog-tabs">
        <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><PackagePlus size={18} /> Productos <b>{products.length}</b></button>
        <button className={tab === 'boxes' ? 'active' : ''} onClick={() => setTab('boxes')}><Box size={18} /> Tipos de caja <b>{boxes.length}</b></button>
      </div>
      <section className="panel data-panel catalog-panel">
        <div className="table-tools">
          <label><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Buscar ${tab === 'products' ? 'producto' : 'caja'}…`} /></label>
          <div>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => importFile(e.target.files?.[0])} />
            <button disabled={busy} onClick={() => fileRef.current?.click()}><FileSpreadsheet size={16} /> {busy ? 'Importando…' : 'Importar Excel'}</button>
            <button className="button button--accent button--small" onClick={() => setShowForm(true)}><Plus size={16} /> Añadir</button>
          </div>
        </div>
        {tab === 'products' ? (
          <div className="catalog-table product-table">
            <div className="catalog-table-head"><span>PRODUCTO</span><span>DIMENSIONES</span><span>PESO</span><span>ROTACIÓN</span><span>TIPO</span><span>ESTADO</span></div>
            {filteredProducts.map((product) => (
              <div key={product.id} className="catalog-row">
                <span><i className="product-cube" /><b>{product.name}</b><small>Identificado por descripción</small></span>
                <span><Ruler size={15} /> {product.length_cm} × {product.width_cm} × {product.height_cm} cm</span>
                <span>{product.weight_kg.toFixed(2)} kg</span>
                <span><RotateCcw size={15} /> {product.rotation_allowed ? 'Permitida' : 'Fija'}</span>
                <span>{product.fragile ? 'Frágil' : 'Estándar'}</span>
                <span className="status-pill status-pill--packed"><i />Activo</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="catalog-table box-table">
            <div className="catalog-table-head"><span>CAJA</span><span>MEDIDAS INTERNAS</span><span>PESO VACÍA</span><span>PESO MÁXIMO</span><span>VOLUMEN</span><span>ESTADO</span></div>
            {filteredBoxes.map((box) => (
              <div key={box.id} className="catalog-row">
                <span><i className="box-icon-mini"><Box size={16} /></i><b>{box.code}</b><small>{box.name}</small></span>
                <span><Ruler size={15} /> {box.length_cm} × {box.width_cm} × {box.height_cm} cm</span>
                <span>{box.empty_weight_kg.toFixed(2)} kg</span><span>{box.max_weight_kg.toFixed(1)} kg</span>
                <span>{((box.length_cm * box.width_cm * box.height_cm) / 1000).toFixed(1)} L</span>
                <span className="status-pill status-pill--packed"><i />Activa</span>
              </div>
            ))}
          </div>
        )}
      </section>
      {showForm && <CatalogForm type={tab} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); notify('Registro añadido al catálogo.'); onRefresh() }} />}
    </div>
  )
}

function CatalogForm({ type, onClose, onSaved }: { type: 'products' | 'boxes'; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setBusy(false)
    }
  }
  return (
    <div className="modal-layer">
      <button className="modal-backdrop" onClick={onClose} />
      <form className="catalog-form" onSubmit={submit}>
        <header><div><span className="eyebrow">CATÁLOGO / ALTA</span><h2>Nuevo {type === 'products' ? 'producto' : 'tipo de caja'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></header>
        <div className="form-grid">
          {type === 'boxes' && <label><span>Código</span><input name="code" required placeholder="BX-01" /></label>}
          <label><span>Nombre</span><input name="name" required placeholder="Descripción clara" /></label>
          <label><span>Largo (cm)</span><input name="length" type="number" step="0.01" min="0.01" required /></label>
          <label><span>Ancho (cm)</span><input name="width" type="number" step="0.01" min="0.01" required /></label>
          <label><span>Alto (cm)</span><input name="height" type="number" step="0.01" min="0.01" required /></label>
          <label><span>{type === 'products' ? 'Peso (kg)' : 'Peso vacía (kg)'}</span><input name="weight" type="number" step="0.01" min={type === 'products' ? '0.01' : '0'} required /></label>
          {type === 'boxes' && <label><span>Peso máximo (kg)</span><input name="maxWeight" type="number" step="0.01" min="0.01" required /></label>}
        </div>
        {error && <p className="form-error">{error}</p>}
        <footer><button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button><button className="button button--accent" disabled={busy}>{busy ? 'Guardando…' : 'Guardar registro'}</button></footer>
      </form>
    </div>
  )
}

