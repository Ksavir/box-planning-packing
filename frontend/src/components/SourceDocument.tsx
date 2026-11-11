import { Button } from './ui/button'
import { useEffect, useState } from 'react'
import { api } from '../api'

export function SourceDocument({ orderId, filename }: {orderId:number;filename?:string}) {
  const [url,setUrl]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  useEffect(()=>()=>{ if(url) URL.revokeObjectURL(url) },[url])
  const open=async()=>{setBusy(true);setError('');try{setUrl(URL.createObjectURL(await api.sourcePdf(orderId)))}catch(error){setError(error instanceof Error?error.message:'Unable to open source PDF.')}finally{setBusy(false)}}
  return <section className="source-document"><h3>Original PDF</h3><p>{filename || 'Source document'}</p>{!url && <Button className="button button--ghost" disabled={busy} onClick={open}>{busy?'Opening PDF…':'View original PDF'}</Button>}{error && <p role="alert" className="field-error">{error}</p>}{url && <><div className="source-document-actions"><a href={url} target="_blank" rel="noreferrer">Open PDF in new tab</a><a href={url} download={filename || "source.pdf"}>Download original PDF</a><button className="text-link" onClick={()=>setUrl('')}>Close PDF</button></div><p>If the embedded viewer is blank, open the PDF in a new tab or download it.</p><iframe title="Original purchase order PDF" src={url} /></>}</section>
}
