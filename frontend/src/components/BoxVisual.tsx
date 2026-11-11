import { useState } from 'react'
import { Box, RotateCcw, ZoomIn, ZoomOut, Maximize, X } from 'lucide-react'
import { useDialogFocus } from '../hooks/useDialogFocus'
import type { PackedBox } from '../types'
const palette=['#E5F3F2','#FFF0E4','#E5F3E2','#FCEAEA','#EDEDEB','#F5F5F3']
function colorForProduct(key:string){let hash=0;for(const char of key)hash=(hash*31+char.charCodeAt(0))>>>0;return palette[hash%palette.length]}
export function BoxVisual({box}:{box:PackedBox}) {
 const [angle,setAngle]=useState(-3),[zoom,setZoom]=useState(1),[top,setTop]=useState(false),[labels,setLabels]=useState(true),[layer,setLayer]=useState('all'),[selected,setSelected]=useState(''),[product,setProduct]=useState(''),[expanded,setExpanded]=useState(false)
 const ref=useDialogFocus<HTMLDivElement>(()=>setExpanded(false),false,expanded)
 const [length,width]=box.dimensions_cm
 const levels=[...new Set(box.placements.map(p=>p.position[2]))].sort((a,b)=>a-b)
 const unit=box.placements.find(p=>p.uid===selected)
 const reset=()=>{setAngle(-3);setZoom(1);setTop(false);setLayer('all');setSelected('');setProduct('');setLabels(true)}
 return <div ref={ref} className={`box-visual-wrap interactive-viewer ${expanded?'viewer--expanded':''}`} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} aria-label={`Box ${box.sequence} placement viewer`}>
  <div className="viewer-controls" aria-label="Viewer controls">
   <button onClick={()=>setAngle(a=>a-15)} aria-label="Rotate left">↶</button><button onClick={()=>setAngle(a=>a+15)} aria-label="Rotate right">↷</button>
   <button onClick={()=>setZoom(z=>Math.max(.5,z-.15))} disabled={zoom<=.5} aria-label="Zoom out"><ZoomOut size={17}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.min(2,z+.15))} disabled={zoom>=2} aria-label="Zoom in"><ZoomIn size={17}/></button>
   <button onClick={reset}><RotateCcw size={16}/>Reset</button><button aria-pressed={top} onClick={()=>setTop(t=>!t)}>{top?'Perspective view':'Top view'}</button>
   <label><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/>Labels</label>
   <button onClick={()=>setExpanded(e=>!e)}>{expanded?<X size={16}/>:<Maximize size={16}/>} {expanded?'Close expanded viewer':'Expand viewer'}</button>
  </div>
  <div className="viewer-filters"><label>Height slice<select value={layer} onChange={e=>setLayer(e.target.value)}><option value="all">All heights (projection)</option>{levels.map(z=><option key={z} value={z}>Z = {z} cm</option>)}</select></label><label>Inspect a unit<select value={selected} onChange={e=>{setSelected(e.target.value);setProduct('')}}><option value="">Select a unit</option>{box.placements.map(p=><option key={p.uid} value={p.uid}>{p.name} · {p.uid}</option>)}</select></label></div>
  <p className="viewer-note">{layer==='all'?'Projection of all placements; units at different heights may cover each other.':`Horizontal slice at Z = ${layer} cm.`} Display controls do not change the packing plan.</p>
  <div className="box-stage" role="region" aria-label="Packing layout projection" tabIndex={0}><div className="box-floor" style={{aspectRatio:`${length}/${width}`,transform:`rotateX(${top?0:56}deg) rotateZ(${angle}deg) scale(${zoom})`}}>
   <div className="measure measure--x">{length} cm</div><div className="measure measure--y">{width} cm</div>
   {box.placements.filter(p=>layer==='all'||(p.position[2]<=Number(layer)&&p.position[2]+p.dimensions[2]>Number(layer))).map((p,index)=>{
    const [x,y,z]=p.position,[l,w]=p.dimensions,color=colorForProduct(p.sku)
    return <button type="button" key={p.uid} tabIndex={-1} className={`packed-item ${selected===p.uid?'packed-item--selected':''}`} aria-label={`${p.name}, unit ${p.uid}`} onClick={()=>{setSelected(p.uid);setProduct('')}} style={{left:`${x/length*100}%`,top:`${y/width*100}%`,width:`${l/length*100}%`,height:`${w/width*100}%`,background:`${color}cc`,borderColor:color,zIndex:Math.round(z)+index,opacity:product && product!==p.sku ? .35 : 1}}>{labels&&<><span>{p.name}</span><small>Z{z}</small></>}</button>
   })}
  </div></div>
  <div className="box-legend" aria-label="Products in this box">{box.items.map(item=><button key={item.sku} aria-pressed={product===item.sku} onClick={()=>{setProduct(p=>p===item.sku?'':item.sku);setSelected('')}}><i style={{background:colorForProduct(item.sku)}}/>{item.name} <b>×{item.quantity}</b></button>)}</div>
  {unit&&<dl className="viewer-unit-details" aria-live="polite"><div><dt>Selected unit</dt><dd>{unit.name} · {unit.uid}</dd></div><div><dt>Position x, y, z (cm)</dt><dd>{unit.position.join(', ')}</dd></div><div><dt>Oriented dimensions (cm)</dt><dd>{unit.dimensions.join(' × ')}</dd></div></dl>}
  <p className="viewer-caption"><Box size={16}/>{box.box_code} · {box.dimensions_cm.join(' × ')} cm</p>
 </div>
}
