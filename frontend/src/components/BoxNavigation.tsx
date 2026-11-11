import { Check } from 'lucide-react'
import type { PackedBox } from '../types'

export function BoxNavigation({ boxes, selectedIndex, onSelect }: {
  boxes: PackedBox[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  return <nav className="box-tabs" aria-label="Select a box">
    {boxes.map((box, index) => <button key={box.sequence}
      id={`select-box-${box.sequence}`} aria-controls="selected-box-details"
      aria-current={index === selectedIndex ? 'true' : undefined} onClick={() => onSelect(index)}>
      <b>Box {String(box.sequence).padStart(2, '0')} · {box.box_code}</b>
      <span>{box.utilization}% utilized · {box.placements.length} {box.placements.length === 1 ? 'unit' : 'units'}</span>
      {index === selectedIndex && <span className="box-selection"><Check size={14} aria-hidden="true"/> Selected</span>}
    </button>)}
  </nav>
}
