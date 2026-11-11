import { useId } from 'react'
import type { PackedBox } from '../types'

/** A compact, read-only projection of the saved placements (never illustrative data). */
export function PackingPreview({ box }: { box: PackedBox }) {
  const id = useId()
  const [length, width, height] = box.dimensions_cm
  const scale = 240 / (length + width)
  const project = (x: number, y: number, z: number) => [155 + (x - y) * scale, 95 + (x + y) * scale * .45 - z * scale * .65]
  const polygon = (points: number[][]) => points.map(p => p.join(',')).join(' ')
  const base = [project(0,0,0),project(length,0,0),project(length,width,0),project(0,width,0)]
  return <svg viewBox="0 0 320 245" className="packing-preview" role="img" aria-labelledby={id}>
    <title id={id}>Box {box.sequence}: {box.items.length} product types, {length} by {width} by {height} cm. Open the plan to inspect all placements.</title>
    <polygon points={polygon(base)} fill="#737373" stroke="#aaaaa5" strokeWidth="1.5" />
    {[...box.placements].sort((a,b)=>(a.position[0]+a.position[1]+a.position[2])-(b.position[0]+b.position[1]+b.position[2])).map(p => {
      const [x,y,z]=p.position, [l,w,h]=p.dimensions
      const a=project(x,y,z+h), b=project(x+l,y,z+h), c=project(x+l,y+w,z+h), d=project(x,y+w,z+h)
      return <g key={p.uid} stroke="#242424" strokeWidth=".5"><polygon points={polygon([d,c,project(x+l,y+w,z),project(x,y+w,z)])} fill="#389D9B"/><polygon points={polygon([b,c,project(x+l,y+w,z),project(x+l,y,z)])} fill="#737373"/><polygon points={polygon([a,b,c,d])} fill="#E5F3F2"/></g>
    })}
    <text x="160" y="220" textAnchor="middle" fill="#FAFAF8" fontSize="12">{length} × {width} × {height} cm</text>
  </svg>
}
