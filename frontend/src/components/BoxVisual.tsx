import { Box, Layers3 } from 'lucide-react'
import type { PackedBox } from '../types'

const palette = ['#19d3f3', '#ff9b52', '#b8e45c', '#ff5e70', '#a78bfa', '#45dfb1']

function colorForProduct(productKey: string) {
  let hash = 0
  for (const char of productKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}

export function BoxVisual({ box }: { box: PackedBox }) {
  const [length, width] = box.dimensions_cm
  return (
    <div className="box-visual-wrap">
      <div className="box-visual-toolbar">
        <span><Layers3 size={15} /> VISTA SUPERIOR / CAPAS</span>
        <span className="live-dot">GEOMETRÍA VERIFICADA</span>
      </div>
      <div className="box-stage">
        <div className="box-stage-shadow" />
        <div className="box-floor" style={{ aspectRatio: `${length} / ${width}` }}>
          <div className="measure measure--x">{length} cm</div>
          <div className="measure measure--y">{width} cm</div>
          {box.placements.map((placement, index) => {
            const [x, y, z] = placement.position
            const [itemLength, itemWidth] = placement.dimensions
            const color = colorForProduct(placement.sku)
            return (
              <div
                key={placement.uid}
                className="packed-item"
                title={placement.name}
                style={{
                  left: `${(x / length) * 100}%`,
                  top: `${(y / width) * 100}%`,
                  width: `${(itemLength / length) * 100}%`,
                  height: `${(itemWidth / width) * 100}%`,
                  background: `${color}cc`,
                  borderColor: color,
                  transform: `translate(${Math.min(z * 0.15, 5)}px, ${Math.min(z * -0.15, -1)}px)`,
                  zIndex: Math.round(z) + index,
                }}
              >
                <span>{placement.name}</span>
                <small>Z{z}</small>
              </div>
            )
          })}
        </div>
      </div>
      <div className="box-legend">
        {box.items.map((item) => (
          <span key={item.sku}>
            <i style={{ background: colorForProduct(item.sku) }} />
            {item.name} <b>×{item.quantity}</b>
          </span>
        ))}
      </div>
      <div className="box-caption">
        <Box size={16} />
        <span>{box.box_code} · {box.dimensions_cm.join(' × ')} cm</span>
      </div>
    </div>
  )
}

