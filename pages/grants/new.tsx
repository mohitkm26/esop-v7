import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, addDoc, query, orderBy, getDoc, doc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { generateGrantNumber, parseFlexDate, computeVestingStatus } from '@/lib/utils'

export default function NewGrant() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [existing, setExisting]   = useState<string[]>([])
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vestRows, setVestRows] = useState([{ date:'', qty:'' }])
  const [form, setForm] = useState({
    employeeId: '', grantDate: '', totalOptions: '', exercisePrice: '0', notes: ''
  })
  const [selEmp, setSelEmp] = useState<any>(null)

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!user) return
    Promise.all([
      getDocs(query(collection(db,'employees'), orderBy('name'))),
      getDocs(collection(db,'grants'))
    ]).then(([e,g]) => {
      setEmployees(e.docs.map(d=>({id:d.id,...d.data()})))
      setExisting(g.docs.map(d=>(d.data() as any).grantNumber||''))
      setBusy(false)
    })
    if (router.query.employeeId) {
      const eid = router.query.employeeId as string
      setForm(f=>({...f, employeeId: eid}))
      getDoc(doc(db,'employees',eid)).then(s => { if(s.exists()) setSelEmp({id:s.id,...s.data()}) })
    }
  }, [user])

  // When employee changes, update selEmp
  function onEmpChange(eid: string) {
    setForm(f=>({...f,employeeId:eid}))
    const e = employees.find(emp=>emp.id===eid)
    setSelEmp(e||null)
  }

  async function save() {
    if (!form.employeeId || !form.grantDate || !form.totalOptions) {
      alert('Employee, grant date and options are required'); return
    }
    setSaving(true)
    const now = new Date().toISOString()
    const grantNumber = generateGrantNumber(existing)
    const totalOptions = parseInt(form.totalOptions)
    const exitDate = selEmp?.exitDate || null

    const grantRef = await addDoc(collection(db,'grants'),{
      grantNumber, employeeId:form.employeeId, grantDate:form.grantDate,
      totalOptions, exercisePrice:parseFloat(form.exercisePrice)||0,
      status:'active', notes:form.notes||null, exercised:0,
      letterGenerated:false, letterPath:null, signedLetterPath:null,
      createdBy:user!.uid, createdAt:now, updatedAt:now
    })

    for (const row of vestRows.filter(r=>r.date&&r.qty)) {
      const d = parseFlexDate(row.date)||row.date
      await addDoc(collection(db,'vestingEvents'),{
        grantId:grantRef.id, employeeId:form.employeeId,
        vestDate:d, optionsCount:parseInt(row.qty)||0,
        status: computeVestingStatus(d, exitDate),
        createdAt:now
      })
    }
    router.push(`/grants/${grantRef.id}`)
  }

  function addVestRow() { setVestRows(r=>[...r,{date:'',qty:''}]) }
  function removeVestRow(i:number) { setVestRows(r=>r.filter((_,j)=>j!==i)) }
  function updateVestRow(i:number, k:string, v:string) { setVestRows(r=>r.map((row,j)=>j===i?{...row,[k]:v}:row)) }

  const totalVesting = vestRows.reduce((s,r)=>(s+parseInt(r.qty||'0')),0)
  const totalOptions = parseInt(form.totalOptions)||0
  const diff = totalOptions - totalVesting

  if (loading || busy || !profile) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>
  if (!['admin','editor'].includes(profile?.role||'')) return <Layout><div className="p-8 text-muted">Editor access required.</div></Layout>

  return (
    <Layout>
      <div className="p-8 max-w-2xl">
        <div className="flex items-center justify-between mb-7">
          <div><h1 className="page-title">New Grant</h1><p className="text-muted text-sm mt-1">Manually create a grant and vesting schedule</p></div>
          <button onClick={()=>router.back()} className="btn btn-ghost btn-sm">← Back</button>
        </div>

        {selEmp?.exitDate && (
          <div style={{background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:12,padding:'10px 14px',marginBottom:16,fontSize:12,color:'#f87171'}}>
            ⚠️ <strong>{selEmp.name}</strong> exited on {selEmp.exitDate}. Vesting events after this date will be marked as lapsed automatically.
          </div>
        )}

        <div className="card mb-5">
          <h2 className="section-title mb-4">Grant Details</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Employee *</label>
              <select className="input" value={form.employeeId} onChange={e=>onEmpChange(e.target.value)}>
                <option value="">Select employee...</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.name} ({e.employeeCode}){e.exitDate?' [Exited]':''}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Grant Date *</label><input type="date" className="input" value={form.grantDate} onChange={e=>setForm(f=>({...f,grantDate:e.target.value}))}/></div>
              <div><label className="label">Exercise Price (₹)</label><input type="number" step="0.01" className="input" value={form.exercisePrice} onChange={e=>setForm(f=>({...f,exercisePrice:e.target.value}))}/></div>
            </div>
            <div><label className="label">Total Options *</label><input type="number" className="input" value={form.totalOptions} onChange={e=>setForm(f=>({...f,totalOptions:e.target.value}))}/></div>
            <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
        </div>

        <div className="card mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Vesting Schedule</h2>
            <div style={{fontSize:11,fontFamily:'monospace',color:diff!==0?'#f59e0b':'#4ade80'}}>
              {totalVesting}/{totalOptions} allocated{diff!==0&&` (${diff>0?'+':''}${-diff} remaining)`}
            </div>
          </div>
          <div className="space-y-2 mb-3">
            {vestRows.map((row,i)=>{
              const isLapsed = selEmp?.exitDate && row.date && row.date > selEmp.exitDate
              return (
                <div key={i} style={{display:'flex',gap:10,alignItems:'flex-end'}}>
                  <div style={{flex:1}}>
                    <label className="label">Vesting Date{isLapsed&&<span style={{marginLeft:6,fontSize:9,background:'rgba(248,113,113,0.15)',color:'#f87171',padding:'1px 6px',borderRadius:4,border:'1px solid rgba(248,113,113,0.25)'}}>WILL LAPSE</span>}</label>
                    <input type="date" className="input" value={row.date} style={isLapsed?{borderColor:'rgba(248,113,113,0.4)'}:{}} onChange={e=>updateVestRow(i,'date',e.target.value)}/>
                  </div>
                  <div style={{width:120}}>
                    <label className="label">Options</label>
                    <input type="number" className="input" value={row.qty} onChange={e=>updateVestRow(i,'qty',e.target.value)}/>
                  </div>
                  <button onClick={()=>removeVestRow(i)} className="btn btn-ghost btn-sm" style={{color:'#f87171',marginBottom:2}}>✕</button>
                </div>
              )
            })}
          </div>
          <button onClick={addVestRow} className="btn btn-ghost btn-sm">+ Add Vesting Date</button>
          {totalOptions>0&&diff===0&&<div style={{fontSize:11,color:'#4ade80',marginTop:8}}>✅ All {totalOptions} options allocated across {vestRows.filter(r=>r.date).length} dates</div>}
        </div>

        <div style={{display:'flex',gap:12}}>
          <button onClick={save} disabled={saving} className="btn btn-success">
            {saving?'⏳ Saving...':'💾 Create Grant'}
          </button>
          <button onClick={()=>router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </Layout>
  )
}
