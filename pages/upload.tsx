import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { db, storage } from '@/lib/firebase'
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore'
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { parseFlexDate, parseVestingStr, smartSplit, extractGrantNo, fmtN, fmtDate, generateGrantNumber, computeVestingStatus, today } from '@/lib/utils'

type Tab = 'pdf'|'csv'|'letters'

export default function UploadPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('csv')
  useEffect(() => { if (!loading&&!user) router.push('/login') }, [user,loading])
  if (loading) return null
  return (
    <Layout>
      <div className="p-8">
        <div className="mb-7">
          <h1 className="page-title">Upload Data</h1>
          <p className="text-muted text-sm mt-1">Import grants via CSV, AI PDF extraction, or bulk upload grant letters.</p>
        </div>
        <div className="flex gap-2 mb-6">
          {([['csv','📊 CSV Import','Instant, recommended'],['pdf','🤖 PDF Extraction','Claude AI'],['letters','📎 Grant Letters','PDF storage']] as const).map(([k,l,s])=>(
            <button key={k} onClick={()=>setTab(k)} className={`px-5 py-3 rounded-xl text-sm font-semibold text-left border transition-all ${tab===k?'bg-primary/15 text-primary border-primary/30':'bg-surface text-muted border-border hover:text-white'}`}>
              <div>{l}</div><div className="text-[10px] opacity-60 mt-0.5">{s}</div>
            </button>
          ))}
        </div>
        {tab==='csv'&&<CSVImporter userId={user!.uid}/>}
        {tab==='pdf'&&<PDFExtractor userId={user!.uid}/>}
        {tab==='letters'&&<LetterUploader userId={user!.uid}/>}
      </div>
    </Layout>
  )
}

// ── CSV Importer — saves directly to Firestore ──────────────────────────────
function CSVImporter({ userId }: { userId: string }) {
  const [rows, setRows]   = useState<any[]>([])
  const [step, setStep]   = useState<'upload'|'preview'>('upload')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState({ done:0, total:0 })
  const [result, setResult] = useState<any>(null)

  function handleFile(file: File|null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { alert('File appears empty'); return }
      const headers = smartSplit(lines[0]).map(h => h.trim().toLowerCase().replace(/[\s\-]/g,'_'))
      const COL: Record<string,number> = {}
      headers.forEach((h,i) => COL[h] = i)
      const get = (cells: string[], ...keys: string[]) => {
        for (const k of keys) { const v = (cells[COL[k]??-1]||'').trim(); if (v) return v }
        return ''
      }
      const parsed = lines.slice(1).map(line => {
        const cells = smartSplit(line)
        const name      = get(cells,'name','employee_name')
        const ecode     = get(cells,'employee_code','ecode','code')
        const grantDate = parseFlexDate(get(cells,'grant_date','date_of_grant'))
        const total     = parseInt(get(cells,'total_options','options','no_of_options'))||0
        const exitDate  = get(cells,'exit_date','date_of_exit')
        const vestStr   = get(cells,'vesting_schedule','vesting')
        const vestingSchedule = parseVestingStr(vestStr)
        const _errors: string[] = []
        if (!name) _errors.push('Missing name')
        if (!ecode) _errors.push('Missing code')
        if (!grantDate) _errors.push('Invalid grant date')
        if (!total) _errors.push('Missing options')
        return {
          name, ecode, grantDate, exitDate: parseFlexDate(exitDate)||null, totalOptions: total,
          email: get(cells,'personal_email','email'),
          officialEmail: get(cells,'official_email'),
          phone: get(cells,'phone','mobile').replace(/["']/g,''),
          department: get(cells,'department','dept'),
          designation: get(cells,'designation','role'),
          notes: get(cells,'notes','note'),
          exercisePrice: parseFloat(get(cells,'exercise_price','strike_price'))||0,
          vestingSchedule, _errors
        }
      }).filter(r => r.name || r.ecode) // filter blank rows
      setRows(parsed); setStep('preview')
    }
    reader.readAsText(file)
  }

  async function saveAll() {
    const good = rows.filter(r => r._errors.length === 0)
    if (!good.length) { alert('No valid rows to save'); return }
    setSaving(true)
    setProgress({ done: 0, total: good.length })

    // Get existing grant numbers
    const existing = await getDocs(collection(db,'grants'))
    const existingNums = existing.docs.map(d => (d.data() as any).grantNumber || '')

    let added = 0, newEmp = 0
    const today = new Date().toISOString().split('T')[0]

    for (const row of good) {
      try {
        const now = new Date().toISOString()
        // Find or create employee
        let empId: string
        const empQ = await getDocs(query(collection(db,'employees'), where('employeeCode','==',row.ecode)))
        if (!empQ.empty) {
          empId = empQ.docs[0].id
          if (row.exitDate) await updateDoc(doc(db,'employees',empId),{ exitDate:row.exitDate, updatedAt:now })
        } else {
          const ref = await addDoc(collection(db,'employees'),{
            name:row.name, employeeCode:row.ecode,
            personalEmail:row.email||null, officialEmail:row.officialEmail||null,
            phone:row.phone||null, department:row.department||null, designation:row.designation||null,
            exitDate:row.exitDate||null, createdBy:userId, createdAt:now, updatedAt:now
          })
          empId = ref.id; newEmp++
        }

        // Create grant
        const grantNumber = generateGrantNumber(existingNums)
        existingNums.push(grantNumber)
        const grantRef = await addDoc(collection(db,'grants'),{
          grantNumber, employeeId:empId, grantDate:row.grantDate,
          totalOptions:row.totalOptions, exercisePrice:row.exercisePrice||0,
          status:'active', notes:row.notes||null, exercised:0,
          letterGenerated:false, letterPath:null, signedLetterPath:null,
          createdBy:userId, createdAt:now, updatedAt:now
        })

        // Create vesting events — respect exit date for lapse logic
        for (const ev of (row.vestingSchedule||[])) {
          await addDoc(collection(db,'vestingEvents'),{
            grantId:grantRef.id, employeeId:empId,
            vestDate:ev.date, optionsCount:ev.quantity,
            status: computeVestingStatus(ev.date, row.exitDate),
            createdAt:now
          })
        }
        added++
      } catch(e) { console.error(e) }
      setProgress(p => ({ ...p, done: p.done+1 }))
    }

    setSaving(false)
    setResult({ added, newEmp, skipped: rows.length - good.length })
  }

  const good = rows.filter(r => r._errors.length===0)

  return (
    <div className="max-w-4xl">
      {step==='upload'&&(
        <div className="card">
          <div className="text-sm font-semibold mb-2">Expected CSV columns:</div>
          <div className="bg-bg rounded-lg p-3 font-mono text-xs text-muted mb-3 overflow-x-auto whitespace-nowrap">
            name, employee_code, personal_email, official_email, phone, department, designation, grant_date, total_options, exercise_price, exit_date, notes, vesting_schedule
          </div>
          <div className="text-xs text-muted mb-4">Vesting format: <code className="bg-surface2 px-1 rounded">2024-09-30:250,2025-09-30:250</code> or <code className="bg-surface2 px-1 rounded">30-Sep-24:250,30-Sep-25:250</code></div>
          <label className="flex flex-col items-center h-36 justify-center border-2 border-dashed border-border2 rounded-xl cursor-pointer hover:border-primary transition-colors"
            onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]||null)}}>
            <input type="file" accept=".csv,.txt" className="hidden" onChange={e=>handleFile(e.target.files?.[0]||null)}/>
            <div className="text-3xl mb-2">📊</div>
            <div className="font-semibold">Drop CSV file here or click to browse</div>
            <div className="text-xs text-muted mt-1">Supports your existing template format</div>
          </label>
        </div>
      )}

      {step==='preview'&&!result&&(
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="section-title">{good.length} valid · {rows.length-good.length} issues</h2>
              {saving&&<div className="text-xs text-primary mt-1">Saving {progress.done}/{progress.total}...</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setStep('upload')} className="btn btn-ghost btn-sm">↺ Re-upload</button>
              <button onClick={saveAll} disabled={saving||!good.length} className="btn btn-success">
                {saving?<>⏳ Saving {progress.done}/{progress.total}</>:'💾 Save to Database'}
              </button>
            </div>
          </div>
          {saving&&<div className="bar-bg mb-4"><div className="bar-fill h-2" style={{width:`${progress.total?(progress.done/progress.total*100):0}%`}}/></div>}
          <div className="table-wrap">
            <table className="w-full">
              <thead className="bg-surface2"><tr>
                <th className="th">Name</th><th className="th">Code</th><th className="th">Options</th>
                <th className="th">Grant Date</th><th className="th">Vesting</th><th className="th">Status</th>
              </tr></thead>
              <tbody>{rows.map((r,i)=>(
                <tr key={i} className={r._errors.length?'opacity-50':''}>
                  <td className="td font-semibold">{r.name||'—'}</td>
                  <td className="td td-mono">{r.ecode||'—'}</td>
                  <td className="td td-mono text-primary">{r.totalOptions?fmtN(r.totalOptions):'—'}</td>
                  <td className="td td-mono">{r.grantDate?fmtDate(r.grantDate):'—'}</td>
                  <td className="td td-mono text-muted">{r.vestingSchedule?.length||0} events</td>
                  <td className="td">{r._errors.length===0?<span className="badge badge-green">✅</span>:<span className="badge badge-red text-xs">{r._errors[0]}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {result&&(
        <div className="card text-center py-10">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="font-bold text-xl mb-2">Import Complete</h2>
          <p className="text-muted">{result.added} grants saved · {result.newEmp} new employees · {result.skipped} skipped</p>
          <div className="flex gap-3 justify-center mt-6">
            <a href="/grants" className="btn btn-primary">View Grants</a>
            <button onClick={()=>{setRows([]);setStep('upload');setResult(null)}} className="btn btn-ghost">Import More</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PDF Extractor ─────────────────────────────────────────────────────────────
function PDFExtractor({ userId }: { userId: string }) {
  const [files, setFiles]   = useState<File[]>([])
  const [step, setStep]     = useState<'upload'|'processing'|'review'>('upload')
  const [extracted, setExtracted] = useState<any[]>([])
  const [progress, setProgress] = useState({ done:0, total:0, failed:0 })
  const [saving, setSaving] = useState(false)

  async function extract() {
    setStep('processing'); setProgress({done:0,total:files.length,failed:0})
    const results: any[] = []; const queue = [...files]; const CONC = 3
    const workers = Array(CONC).fill(null).map(async()=>{
      while (queue.length) {
        const f = queue.shift()!
        try {
          const b64 = await fileToB64(f)
          const res = await fetch('/api/extract-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({b64,filename:f.name})})
          const json = await res.json()
          if (json.error) throw new Error(json.error)
          results.push({...json,_file:f.name,_ok:true})
        } catch(e:any) { results.push({_file:f.name,_ok:false,_error:e.message}); setProgress(p=>({...p,failed:p.failed+1})) }
        setProgress(p=>({...p,done:p.done+1}))
      }
    })
    await Promise.all(workers); setExtracted(results); setStep('review')
  }

  async function saveAll() {
    setSaving(true)
    const good = extracted.filter(e=>e._ok&&e.name&&e.totalOptions)
    const existing = await getDocs(collection(db,'grants'))
    const existingNums = existing.docs.map(d=>(d.data() as any).grantNumber||'')
    const today = new Date().toISOString().split('T')[0]
    let added=0, newEmp=0
    for (const row of good) {
      try {
        const now = new Date().toISOString()
        let empId: string
        const empQ = await getDocs(query(collection(db,'employees'),where('employeeCode','==',row.employeeCode||row.ecode)))
        if (!empQ.empty) { empId = empQ.docs[0].id }
        else {
          const ref = await addDoc(collection(db,'employees'),{name:row.name,employeeCode:row.employeeCode||row.ecode||'UNKNOWN',exitDate:null,createdBy:userId,createdAt:now,updatedAt:now})
          empId=ref.id; newEmp++
        }
        const grantNumber = generateGrantNumber(existingNums); existingNums.push(grantNumber)
        const grantRef = await addDoc(collection(db,'grants'),{grantNumber,employeeId:empId,grantDate:row.grantDate,totalOptions:row.totalOptions,exercisePrice:row.exercisePrice||0,status:'active',exercised:0,letterGenerated:false,sourceFile:row._file,createdBy:userId,createdAt:now,updatedAt:now})
        for (const ev of (row.vestingSchedule||[])) {
          await addDoc(collection(db,'vestingEvents'),{grantId:grantRef.id,employeeId:empId,vestDate:ev.date,optionsCount:ev.quantity,status:computeVestingStatus(ev.date,null),createdAt:now})
        }
        added++
      } catch(e){console.error(e)}
    }
    setSaving(false)
    alert(`✅ Saved ${added} grants, ${newEmp} new employees`)
    setFiles([]); setExtracted([]); setStep('upload')
  }

  return (
    <div className="max-w-3xl">
      {step==='upload'&&(
        <div className="card">
          <p className="text-sm text-muted mb-4">Upload PDF grant letters — Claude AI extracts employee name, options, grant date, and vesting schedule automatically.</p>
          <label className="flex flex-col items-center h-40 justify-center border-2 border-dashed border-border2 rounded-xl cursor-pointer hover:border-primary transition-colors"
            onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files,setFiles)}}>
            <input type="file" accept=".pdf" multiple className="hidden" onChange={e=>addFiles(e.target.files!,setFiles)}/>
            <div className="text-4xl mb-2">📂</div>
            <div className="font-semibold">Drop PDF grant letters here</div>
            <div className="text-xs text-muted mt-1">Multiple files supported · Auto-retry on rate limits</div>
          </label>
          {files.length>0&&(
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2"><span className="text-sm font-semibold">{files.length} files ready</span><button onClick={()=>setFiles([])} className="text-xs text-muted hover:text-danger">Clear</button></div>
              <div className="max-h-32 overflow-y-auto space-y-1">{files.map((f,i)=><div key={i} className="text-xs text-muted font-mono bg-surface2 px-3 py-1 rounded">📄 {f.name}</div>)}</div>
              <button onClick={extract} className="btn btn-success mt-3 w-full">✨ Extract with Claude AI</button>
            </div>
          )}
        </div>
      )}
      {step==='processing'&&(
        <div className="card text-center py-10">
          <div className="text-4xl mb-4">⚙️</div>
          <div className="font-semibold mb-3">Processing {progress.done}/{progress.total} files{progress.failed>0?` · ${progress.failed} failed`:''}</div>
          <div className="bar-bg max-w-xs mx-auto"><div className="bar-fill" style={{width:`${progress.total?(progress.done/progress.total*100):0}%`}}/></div>
          <p className="text-xs text-muted mt-3">3 files processed concurrently · auto-retry on rate limits</p>
        </div>
      )}
      {step==='review'&&(
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="section-title">{extracted.filter(e=>e._ok).length} extracted · {extracted.filter(e=>!e._ok).length} failed</h2>
            <div className="flex gap-2">
              <button onClick={()=>setStep('upload')} className="btn btn-ghost btn-sm">↺ Re-upload</button>
              <button onClick={saveAll} disabled={saving} className="btn btn-success">{saving?'⏳ Saving...':'💾 Save All'}</button>
            </div>
          </div>
          <div className="table-wrap"><table className="w-full">
            <thead className="bg-surface2"><tr><th className="th">File</th><th className="th">Name</th><th className="th">Options</th><th className="th">Grant Date</th><th className="th">Vesting</th><th className="th">Status</th></tr></thead>
            <tbody>{extracted.map((e,i)=>(
              <tr key={i} className={e._ok?'':'opacity-50'}>
                <td className="td td-mono text-muted text-xs">{e._file}</td>
                <td className="td font-semibold">{e.name||'—'}</td>
                <td className="td td-mono text-primary">{e.totalOptions?fmtN(e.totalOptions):'—'}</td>
                <td className="td td-mono">{e.grantDate?fmtDate(e.grantDate):'—'}</td>
                <td className="td td-mono">{e.vestingSchedule?.length||0} events</td>
                <td className="td">{e._ok?<span className="badge badge-green">✅</span>:<span className="badge badge-red text-xs" title={e._error}>❌ {e._error?.slice(0,30)}</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  )
}

// ── Grant Letter uploader ─────────────────────────────────────────────────────
function LetterUploader({ userId }: { userId: string }) {
  const [files, setFiles]   = useState<File[]>([])
  const [results, setResults] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  async function upload() {
    setUploading(true)
    const out: any[] = []
    for (const file of files) {
      const grantNum = extractGrantNo(file.name)
      const path = `grant-letters/${Date.now()}_${file.name.replace(/\s/g,'_')}`
      try {
        const r = sRef(storage, path); await uploadBytes(r, file)
        const url = await getDownloadURL(r)
        let grantId = null, matched = false
        if (grantNum) {
          const snap = await getDocs(query(collection(db,'grants'),where('grantNumber','==',grantNum)))
          if (!snap.empty) {
            grantId = snap.docs[0].id; matched = true
            await updateDoc(doc(db,'grants',grantId),{ letterPath:path, letterUrl:url, letterGenerated:true })
          }
        }
        await addDoc(collection(db,'grantLetters'),{ grantId, grantNumber:grantNum, storagePath:path, url, filename:file.name, matched, uploadedBy:userId, uploadedAt:new Date().toISOString() })
        out.push({file:file.name,grantNum,matched,ok:true})
      } catch(e:any) { out.push({file:file.name,grantNum,matched:false,ok:false,error:e.message}) }
    }
    setResults(out); setUploading(false)
  }

  return (
    <div className="max-w-3xl">
      <div className="card mb-4">
        <h2 className="section-title mb-2">Bulk Grant Letter Upload</h2>
        <p className="text-sm text-muted mb-3">Name files starting with grant number to auto-match: <code className="bg-surface2 px-1 rounded">G-0042_Priya_Sharma.pdf</code></p>
        <label className="flex flex-col items-center h-32 justify-center border-2 border-dashed border-border2 rounded-xl cursor-pointer hover:border-primary transition-colors"
          onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();setFiles([...e.dataTransfer.files].filter(f=>f.name.endsWith('.pdf')))}}>
          <input type="file" accept=".pdf" multiple className="hidden" onChange={e=>setFiles([...e.target.files!])}/>
          <div className="text-3xl mb-2">📎</div><div className="font-semibold text-sm">Drop PDF files here</div>
        </label>
      </div>
      {files.length>0&&!results.length&&(
        <div className="card mb-4">
          <div className="flex justify-between items-center mb-3">
            <span className="font-semibold">{files.length} files ready</span>
            <button onClick={upload} disabled={uploading} className="btn btn-success">{uploading?'⏳ Uploading...':'⬆ Upload All'}</button>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {files.map((f,i)=>{const gn=extractGrantNo(f.name);return <div key={i} className="flex justify-between bg-surface2 rounded-lg px-3 py-2"><span className="text-xs font-mono text-muted">📄 {f.name}</span><span className={`badge text-xs ${gn?'badge-green':'badge-amber'}`}>{gn||'No # detected'}</span></div>})}
          </div>
        </div>
      )}
      {results.length>0&&(
        <div className="card">
          <h2 className="section-title mb-4">Results — {results.filter(r=>r.matched).length} matched</h2>
          <div className="table-wrap"><table className="w-full">
            <thead className="bg-surface2"><tr><th className="th">File</th><th className="th">Grant #</th><th className="th">Result</th></tr></thead>
            <tbody>{results.map((r,i)=>(
              <tr key={i}>
                <td className="td td-mono text-xs text-muted">{r.file}</td>
                <td className="td td-mono">{r.grantNum||'—'}</td>
                <td className="td">{!r.ok?<span className="badge badge-red text-xs">❌ {r.error}</span>:r.matched?<span className="badge badge-green">✅ Matched</span>:<span className="badge badge-amber">📤 Uploaded (unmatched)</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <button onClick={()=>{setFiles([]);setResults([])}} className="btn btn-ghost btn-sm mt-4">Upload More</button>
        </div>
      )}
    </div>
  )
}

function addFiles(fl: FileList, setFiles: (fn:(prev:File[])=>File[])=>void) {
  const pdfs = [...fl].filter(f=>f.name.endsWith('.pdf'))
  setFiles(prev => { const names=new Set(prev.map(f=>f.name)); return [...prev,...pdfs.filter(f=>!names.has(f.name))] })
}
async function fileToB64(file: File): Promise<string> {
  return new Promise((res,rej) => { const r=new FileReader(); r.onload=e=>res((e.target!.result as string).split(',')[1]); r.onerror=rej; r.readAsDataURL(file) })
}
