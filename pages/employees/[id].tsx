import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { doc, getDoc, getDocs, collection, query, where, orderBy, updateDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { computeVesting, getLatestValuation, fmtN, fmtC, fmtDate } from '@/lib/utils'
import Link from 'next/link'

export default function EmployeeDetail() {
  const { user, profile, loading } = useAuth()
  const router  = useRouter()
  const { id }  = router.query as { id: string }
  const [emp, setEmp]     = useState<any>(null)
  const [grants, setGrants] = useState<any[]>([])
  const [vesting, setVesting] = useState<any[]>([])
  const [vals, setVals]   = useState<any[]>([])
  const [busy, setBusy]   = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm]   = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]     = useState('')

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => { if (user && id) load() }, [user, id])

  async function load() {
    setBusy(true)
    const [eSnap, gSnap, vSnap, valSnap] = await Promise.all([
      getDoc(doc(db,'employees',id)),
      getDocs(query(collection(db,'grants'), where('employeeId','==',id), orderBy('grantDate'))),
      getDocs(query(collection(db,'vestingEvents'), where('employeeId','==',id))),
      getDocs(query(collection(db,'valuations'), orderBy('effectiveDate','desc'))),
    ])
    if (!eSnap.exists()) { router.push('/employees'); return }
    const e = { id:eSnap.id, ...eSnap.data() } as any
    setEmp(e); setForm(e)
    setGrants(gSnap.docs.map(d=>({id:d.id,...d.data()})))
    setVesting(vSnap.docs.map(d=>({id:d.id,...d.data()})))
    setVals(valSnap.docs.map(d=>({id:d.id,...d.data()})))
    setBusy(false)
  }

  async function saveEdit() {
    setSaving(true); setMsg('')
    await updateDoc(doc(db,'employees',id), {
      name: form.name||emp.name,
      employeeCode: form.employeeCode||emp.employeeCode,
      department: form.department||null,
      designation: form.designation||null,
      phone: form.phone||null,
      personalEmail: form.personalEmail||null,
      officialEmail: form.officialEmail||null,
      joinDate: form.joinDate||null,
      exitDate: form.exitDate||null,
      notes: form.notes||null,
      updatedAt: new Date().toISOString()
    })
    setMsg('✅ Saved')
    await load(); setEditing(false); setSaving(false)
    setTimeout(()=>setMsg(''), 2500)
  }

  if (loading || busy) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>
  if (!emp) return null

  const fv = getLatestValuation(vals)
  const vestByGrant = new Map<string,any[]>()
  vesting.forEach((ev:any)=>{
    if(!vestByGrant.has(ev.grantId))vestByGrant.set(ev.grantId,[])
    vestByGrant.get(ev.grantId)!.push(ev)
  })

  let totGranted=0,totVested=0,totLapsed=0,totNet=0,totEx=0
  grants.forEach(g=>{
    const evs=vestByGrant.get(g.id)||[]
    const v=computeVesting(evs,g.totalOptions,fv,g.exercised||0,emp.exitDate||null)
    totGranted+=v.total;totVested+=v.vested;totLapsed+=v.lapsed;totNet+=v.netVested;totEx+=v.exercised
  })

  const canEdit = ['admin','editor'].includes(profile?.role||'')
  const isAdmin = profile?.role === 'admin'
  const upd = (k:string) => (e:any) => setForm((f:any)=>({...f,[k]:e.target.value}))

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">{emp.name}</h1>
            <p className="text-muted text-sm mt-1">{emp.employeeCode}{emp.department&&` · ${emp.department}`}{emp.designation&&` · ${emp.designation}`}</p>
            <div className="flex gap-2 mt-2">
              {emp.exitDate ? <span className="badge badge-red">Exited {fmtDate(emp.exitDate)}</span> : <span className="badge badge-green">Active</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canEdit && !editing && <button onClick={()=>setEditing(true)} className="btn btn-ghost btn-sm">✏️ Edit</button>}
            {canEdit && <Link href={`/grants/new?employeeId=${id}`} className="btn btn-primary btn-sm">+ Grant</Link>}
            <button onClick={()=>router.back()} className="btn btn-ghost btn-sm">← Back</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            {l:'Granted',v:fmtN(totGranted),c:'#d4a853'},
            {l:'Vested',v:fmtN(totVested),c:'#4ade80'},
            {l:'Lapsed',v:fmtN(totLapsed),c:'#f87171'},
            {l:'Exercised',v:fmtN(totEx),c:'#e8c27a'},
            {l:'Net Vested',v:fmtN(totNet),c:'#c084fc'},
          ].map(s=>(
            <div key={s.l} className="card" style={{textAlign:'center'}}>
              <div className="stat-lbl">{s.l}</div>
              <div style={{fontSize:22,fontWeight:800,color:s.c,marginTop:4,letterSpacing:'-0.02em'}}>{s.v}</div>
              {s.l==='Net Vested'&&fv>0&&<div className="text-muted" style={{fontSize:10,marginTop:2}}>{fmtC(totNet*fv)}</div>}
            </div>
          ))}
        </div>

        {/* Edit form */}
        {editing && isAdmin ? (
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Edit Employee</h2>
              <div className="flex gap-2">
                <button onClick={saveEdit} disabled={saving} className="btn btn-success btn-sm">{saving?'Saving...':'💾 Save'}</button>
                <button onClick={()=>setEditing(false)} className="btn btn-ghost btn-sm">Cancel</button>
              </div>
            </div>
            {msg && <div style={{fontSize:12,color:'#4ade80',marginBottom:12}}>{msg}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div><label className="label">Full Name *</label><input className="input" value={form.name||''} onChange={upd('name')}/></div>
              <div><label className="label">Employee Code *</label><input className="input" value={form.employeeCode||''} onChange={upd('employeeCode')}/></div>
              <div><label className="label">Department</label><input className="input" value={form.department||''} onChange={upd('department')}/></div>
              <div><label className="label">Designation</label><input className="input" value={form.designation||''} onChange={upd('designation')}/></div>
              <div><label className="label">Personal Email</label><input type="email" className="input" value={form.personalEmail||''} onChange={upd('personalEmail')}/></div>
              <div><label className="label">Official Email</label><input type="email" className="input" value={form.officialEmail||''} onChange={upd('officialEmail')}/></div>
              <div><label className="label">Phone</label><input className="input" value={form.phone||''} onChange={upd('phone')}/></div>
              <div><label className="label">Join Date</label><input type="date" className="input" value={form.joinDate||''} onChange={upd('joinDate')}/></div>
              <div className="col-span-2"><label className="label">Exit Date</label>
                <div className="flex gap-3 items-center">
                  <input type="date" className="input flex-1" value={form.exitDate||''} onChange={upd('exitDate')}/>
                  {form.exitDate && <button onClick={()=>setForm((f:any)=>({...f,exitDate:''}))} className="btn btn-ghost btn-sm text-danger">Clear</button>}
                </div>
                <p className="text-muted" style={{fontSize:11,marginTop:4}}>Vesting events after this date will show as lapsed.</p>
              </div>
              <div className="col-span-2"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes||''} onChange={upd('notes')}/></div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 mb-6">
            <div className="card">
              <h2 className="section-title mb-3">Profile</h2>
              <div className="space-y-2" style={{fontSize:13}}>
                {[['Personal Email',emp.personalEmail],['Official Email',emp.officialEmail],['Phone',emp.phone],['Department',emp.department],['Designation',emp.designation],['Join Date',emp.joinDate?fmtDate(emp.joinDate):null],['Exit Date',emp.exitDate?fmtDate(emp.exitDate):null]].map(([l,v])=>v?(
                  <div key={l as string} style={{display:'flex',justifyContent:'space-between'}}>
                    <span className="text-muted">{l}</span><span>{v}</span>
                  </div>
                ):null)}
              </div>
            </div>
            <div className="card">
              <h2 className="section-title mb-3">Exit / Lapse Info</h2>
              <p style={{fontSize:12,color:'#6b6b6b',lineHeight:1.7,marginBottom:12}}>Options vesting <strong>after</strong> the exit date are lapsed. Options vesting on or before exit date are considered vested.</p>
              {emp.exitDate
                ? <div><span className="badge badge-red">Exited {fmtDate(emp.exitDate)}</span><div style={{marginTop:8,fontSize:12,color:'#6b6b6b'}}>{totLapsed} options lapsed · {totVested} options vested</div></div>
                : <span className="badge badge-green">Active employee</span>}
              {canEdit && <button onClick={()=>setEditing(true)} style={{marginTop:12,display:'block',fontSize:12,color:'#d4a853',background:'none',border:'none',cursor:'pointer',padding:0}}>✏️ Edit employee details →</button>}
            </div>
          </div>
        )}

        {/* Grants */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">Grants ({grants.length})</h2>
            {canEdit && <Link href={`/grants/new?employeeId=${id}`} className="btn btn-primary btn-sm">+ Add Grant</Link>}
          </div>
          {grants.length===0
            ? <p className="text-muted text-sm text-center" style={{padding:24}}>No grants yet. <Link href={`/grants/new?employeeId=${id}`} className="text-primary">Add one.</Link></p>
            : <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th className="th">Grant #</th><th className="th">Date</th><th className="th">Total</th>
                  <th className="th">Vested</th><th className="th">Lapsed</th><th className="th">Exercised</th><th className="th">Net</th>
                  <th className="th">%</th><th className="th">Letter</th>
                </tr></thead>
                <tbody>
                  {grants.map(g=>{
                    const evs=vestByGrant.get(g.id)||[]
                    const v=computeVesting(evs,g.totalOptions,fv,g.exercised||0,emp.exitDate||null)
                    return (
                      <tr key={g.id} style={{cursor:'pointer'}} onClick={()=>router.push(`/grants/${g.id}`)}>
                        <td className="td"><span className="badge badge-amber">{g.grantNumber}</span></td>
                        <td className="td td-mono text-muted">{fmtDate(g.grantDate)}</td>
                        <td className="td td-mono" style={{color:'#d4a853'}}>{fmtN(v.total)}</td>
                        <td className="td td-mono text-success">{fmtN(v.vested)}</td>
                        <td className="td td-mono text-danger">{fmtN(v.lapsed)}</td>
                        <td className="td td-mono text-warning">{fmtN(v.exercised)}</td>
                        <td className="td td-mono text-purple font-semibold">{fmtN(v.netVested)}</td>
                        <td className="td" style={{minWidth:80}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div className="bar-bg" style={{flex:1}}><div className="bar-fill" style={{width:`${v.pct}%`}}/></div>
                            <span style={{fontSize:10,color:'#6b6b6b',width:28,textAlign:'right'}}>{v.pct}%</span>
                          </div>
                        </td>
                        <td className="td">{g.letterGenerated?<span className="badge badge-green">✅</span>:<span className="badge badge-muted">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>}
        </div>
      </div>
    </Layout>
  )
}
