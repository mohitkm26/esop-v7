import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { db, storage } from '@/lib/firebase'
import { collection, getDocs, addDoc, deleteDoc, doc, orderBy, query } from 'firebase/firestore'
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import PlanGate from '@/components/PlanGate'
import { fmtC, fmtDate } from '@/lib/utils'

export default function ValuationPage() {
  const { user, profile, loading } = useAuth()
  const { can } = usePlan()
  const router = useRouter()
  const [vals, setVals] = useState<any[]>([])
  const [busy, setBusy] = useState(true)
  const [form, setForm] = useState({ effectiveDate:'', fairValue:'' })
  const [docFile, setDocFile] = useState<File|null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => { if (user) load() }, [user])

  async function load() {
    const snap = await getDocs(query(collection(db,'valuations'), orderBy('effectiveDate','desc')))
    setVals(snap.docs.map(d=>({id:d.id,...d.data()})))
    setBusy(false)
  }

  async function addValuation() {
    if (!form.effectiveDate || !form.fairValue) { alert('Date and fair value required'); return }
    if (!['admin','editor'].includes(profile?.role||'')) { alert('Admin or Editor access required'); return }
    setSaving(true)
    let docPath: string|null = null, docUrl: string|null = null, docName: string|null = null
    if (docFile) {
      const path = `valuations/${form.effectiveDate}_${Date.now()}_${docFile.name.replace(/\s/g,'_')}`
      const r = sRef(storage, path)
      await uploadBytes(r, docFile)
      docUrl  = await getDownloadURL(r)
      docPath = path
      docName = docFile.name
    }
    await addDoc(collection(db,'valuations'), {
      effectiveDate: form.effectiveDate,
      fairValue: parseFloat(form.fairValue),
      docPath, docUrl, docName,
      addedBy: user!.uid,
      createdAt: new Date().toISOString()
    })
    setForm({ effectiveDate:'', fairValue:'' })
    setDocFile(null)
    if (fileRef.current) fileRef.current.value = ''
    await load()
    setSaving(false)
  }

  async function removeVal(v: any) {
    if (!confirm('Delete this valuation?')) return
    if (v.docPath) await deleteObject(sRef(storage, v.docPath)).catch(()=>{})
    await deleteDoc(doc(db,'valuations',v.id))
    setVals(prev => prev.filter(x=>x.id!==v.id))
  }

  const canEdit = ['admin','editor'].includes(profile?.role||'')

  if (loading || busy) return <div style={{minHeight:'100vh',background:'#000',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  return (
    <Layout>
      <PlanGate feature="valuation" overlay={false}>
      <div className="p-8 max-w-3xl">
        <div className="mb-7">
          <h1 className="page-title">Valuation</h1>
          <p className="text-muted text-sm mt-1">Fair value history per share. Upload supporting documents for each valuation date.</p>
        </div>

        {/* Add form */}
        {canEdit && (
          <div className="card mb-6">
            <h2 className="section-title mb-4">Add Valuation</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">Effective Date</label>
                <input type="date" className="input" value={form.effectiveDate}
                  onChange={e=>setForm(f=>({...f,effectiveDate:e.target.value}))}/>
              </div>
              <div>
                <label className="label">Fair Value (₹ per option)</label>
                <input type="number" step="0.01" className="input" placeholder="e.g. 150"
                  value={form.fairValue} onChange={e=>setForm(f=>({...f,fairValue:e.target.value}))}/>
              </div>
            </div>
            <div className="mb-4">
              <label className="label">Supporting Document (optional)</label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.png,.xlsx,.csv"
                onChange={e=>setDocFile(e.target.files?.[0]||null)}
                className="text-xs text-muted file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-[#1a1e28] file:text-white file:text-xs cursor-pointer w-full"/>
              {docFile && <div className="text-xs text-success mt-1">📎 {docFile.name}</div>}
            </div>
            <button onClick={addValuation} disabled={saving} className="btn btn-success">
              {saving ? '⏳ Saving...' : '+ Add Valuation'}
            </button>
          </div>
        )}

        {/* History */}
        <div className="card">
          <h2 className="section-title mb-4">Valuation History</h2>
          {vals.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">💰</div>
              <p className="text-muted">No valuations yet. Add your first fair value above.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="w-full">
                <thead className="bg-[#1a1e28]"><tr>
                  <th className="th">Effective Date</th>
                  <th className="th">Fair Value / Option</th>
                  <th className="th">Document</th>
                  <th className="th">Added</th>
                  {canEdit && <th className="th"></th>}
                </tr></thead>
                <tbody>
                  {vals.map((v,i) => (
                    <tr key={v.id}>
                      <td className="td font-semibold">
                        {fmtDate(v.effectiveDate)}
                        {i===0 && <span className="badge badge-green ml-2">Current</span>}
                      </td>
                      <td className="td td-mono text-warning font-bold text-lg">{fmtC(v.fairValue)}</td>
                      <td className="td">
                        {v.docUrl
                          ? <a href={v.docUrl} target="_blank" className="text-primary text-xs hover:underline">📎 {v.docName||'View'}</a>
                          : <span className="text-muted text-xs">—</span>}
                      </td>
                      <td className="td text-muted text-xs">{fmtDate(v.createdAt?.split('T')[0])}</td>
                      {canEdit && (
                        <td className="td">
                          <button onClick={()=>removeVal(v)} className="text-xs text-muted hover:text-danger">Delete</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      </PlanGate>
    </Layout>
  )
}
