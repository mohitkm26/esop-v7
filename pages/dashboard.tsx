import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { computeVesting, getLatestValuation, fmtN, fmtC, fmtDate, today } from '@/lib/utils'
import Link from 'next/link'

export default function Dashboard() {
  const { user, profile, loading } = useAuth()
  const { companyId } = usePlan()
  const router = useRouter()
  const [data, setData] = useState<any>({ employees:[], grants:[], vesting:[], valuations:[] })
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && profile?.role === 'employee') router.replace('/employee-portal')
  }, [user, profile, loading])

  useEffect(() => {
    if (!user || !companyId) return
    async function load() {
      const cid = companyId
      const [e,g,v,vals] = await Promise.all([
        getDocs(query(collection(db,'employees'), where('companyId','==',cid), orderBy('name'))),
        getDocs(query(collection(db,'grants'),    where('companyId','==',cid), orderBy('grantDate','desc'))),
        getDocs(query(collection(db,'vestingEvents'), where('companyId','==',cid))),
        getDocs(query(collection(db,'valuations'),    where('companyId','==',cid), orderBy('effectiveDate','desc'))),
      ])
      setData({
        employees: e.docs.map(d=>({id:d.id,...d.data()})),
        grants:    g.docs.map(d=>({id:d.id,...d.data()})),
        vesting:   v.docs.map(d=>({id:d.id,...d.data()})),
        valuations:vals.docs.map(d=>({id:d.id,...d.data()})),
      })
      setBusy(false)
    }
    load()
  }, [user, companyId])

  if (loading || busy) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  const fv = getLatestValuation(data.valuations)
  const todayStr = today()

  const vestByGrant = new Map<string,any[]>()
  data.vesting.forEach((ev:any) => {
    if (!vestByGrant.has(ev.grantId)) vestByGrant.set(ev.grantId,[])
    vestByGrant.get(ev.grantId)!.push(ev)
  })

  let totGranted=0, totVested=0, totExercised=0, totNet=0, totLapsed=0
  data.grants.forEach((g:any) => {
    const evs = vestByGrant.get(g.id)||[]
    const emp = data.employees.find((e:any) => e.id === g.employeeId)
    const v = computeVesting(evs, g.totalOptions, fv, g.exercised||0, emp?.exitDate||null)
    totGranted   += v.total
    totVested    += v.vested
    totExercised += v.exercised
    totNet       += v.netVested
    totLapsed    += v.lapsed
  })

  // Per-employee summary
  const byEmp = new Map<string,{granted:number,vested:number,lapsed:number,net:number,exercised:number,grants:number}>()
  data.grants.forEach((g:any) => {
    if (!byEmp.has(g.employeeId)) byEmp.set(g.employeeId,{granted:0,vested:0,lapsed:0,net:0,exercised:0,grants:0})
    const evs = vestByGrant.get(g.id)||[]
    const emp = data.employees.find((e:any) => e.id === g.employeeId)
    const v = computeVesting(evs, g.totalOptions, fv, g.exercised||0, emp?.exitDate||null)
    const s = byEmp.get(g.employeeId)!
    s.granted+=v.total; s.vested+=v.vested; s.lapsed+=v.lapsed; s.net+=v.netVested; s.exercised+=v.exercised; s.grants++
  })

  // Future vesting schedule — next 8 quarters
  const futureEvs: Array<{date:string,qty:number,emp:string,grant:string}> = []
  data.vesting.forEach((ev:any) => {
    if (ev.vestDate > todayStr && ev.status !== 'lapsed') {
      const g = data.grants.find((gr:any)=>gr.id===ev.grantId)
      const emp = data.employees.find((e:any)=>e.id===ev.employeeId)
      if (g && emp && (!emp.exitDate || ev.vestDate <= emp.exitDate)) {
        futureEvs.push({ date:ev.vestDate, qty:ev.optionsCount, emp:emp.name, grant:g.grantNumber })
      }
    }
  })
  futureEvs.sort((a,b)=>a.date.localeCompare(b.date))

  // Group future by quarter
  const qMap = new Map<string,{qty:number,events:typeof futureEvs}>()
  futureEvs.forEach(ev => {
    const d = new Date(ev.date)
    const q = `Q${Math.ceil((d.getMonth()+1)/3)} ${d.getFullYear()}`
    if (!qMap.has(q)) qMap.set(q,{qty:0,events:[]})
    const e = qMap.get(q)!; e.qty+=ev.qty; e.events.push(ev)
  })
  const futureQuarters = [...qMap.entries()].slice(0,8)

  const canEdit = ['admin','editor'].includes(profile?.role||'')

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="text-muted text-sm mt-1">
              {data.employees.length} employees · {data.grants.length} grants
              {fv>0 && <> · FV <span style={{color:'#d4a853',fontWeight:600}}>{fmtC(fv)}/option</span></>}
            </p>
          </div>
          {canEdit && <div className="flex gap-2">
            <Link href="/employees/new" className="btn btn-ghost btn-sm">+ Employee</Link>
            <Link href="/grants/new"    className="btn btn-primary btn-sm">+ Grant</Link>
          </div>}
        </div>

        {/* Summary cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:28}}>
          {[
            {l:'Total Granted', v:fmtN(totGranted),   c:'#d4a853', sub:fv>0?fmtC(totGranted*fv):undefined},
            {l:'Total Vested',  v:fmtN(totVested),    c:'#4ade80', sub:fv>0?fmtC(totVested*fv):undefined},
            {l:'Lapsed',        v:fmtN(totLapsed),    c:'#f87171'},
            {l:'Exercised',     v:fmtN(totExercised), c:'#e8c27a'},
            {l:'Net Vested',    v:fmtN(totNet),       c:'#c084fc', sub:fv>0?fmtC(totNet*fv):undefined},
          ].map(s=>(
            <div key={s.l} className="card" style={{textAlign:'center'}}>
              <div className="stat-lbl">{s.l}</div>
              <div style={{fontSize:24,fontWeight:800,color:s.c,marginTop:6,letterSpacing:'-0.03em'}}>{s.v}</div>
              {s.sub&&<div style={{fontSize:10,color:'#6b6b6b',marginTop:3}}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {data.grants.length === 0 && (
          <div className="card text-center" style={{padding:'64px 24px'}}>
            <div style={{fontSize:48,marginBottom:12}}>📊</div>
            <h2 style={{fontWeight:700,fontSize:17,marginBottom:8}}>No data yet</h2>
            <p className="text-muted" style={{fontSize:13,marginBottom:20}}>Start by uploading your ESOP data or adding grants manually</p>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <Link href="/upload"     className="btn btn-primary">⬆ Upload CSV</Link>
              <Link href="/grants/new" className="btn btn-ghost">+ Add Grant</Link>
            </div>
          </div>
        )}

        {/* Future vesting schedule */}
        {futureQuarters.length > 0 && (
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title">Upcoming Vestings</h2>
                <p style={{fontSize:11,color:'#6b6b6b',marginTop:2}}>Future vesting events for active employees (excludes lapsed)</p>
              </div>
              <div style={{fontSize:11,color:'#6b6b6b'}}>{futureEvs.length} events · {fmtN(futureEvs.reduce((s,e)=>s+e.qty,0))} options</div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
              {futureQuarters.map(([q,qd])=>(
                <div key={q} style={{background:'#0f0f0f',border:'1px solid #1c1c1c',borderRadius:12,padding:'12px 14px'}}>
                  <div style={{fontSize:11,color:'#6b6b6b',fontWeight:600,marginBottom:6}}>{q}</div>
                  <div style={{fontSize:20,fontWeight:800,color:'#d4a853',letterSpacing:'-0.02em'}}>{fmtN(qd.qty)}</div>
                  <div style={{fontSize:9,color:'#6b6b6b',marginTop:2}}>options · {qd.events.length} event{qd.events.length>1?'s':''}</div>
                  {fv>0&&<div style={{fontSize:10,color:'#4ade80',marginTop:3}}>{fmtC(qd.qty*fv)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Employee table */}
        {data.employees.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="section-title">Employees</h2>
              <Link href="/employees" style={{fontSize:11,color:'#d4a853',textDecoration:'none'}}>View all →</Link>
            </div>
            <div className="table-wrap">
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead><tr>
                  <th className="th">Employee</th><th className="th">Code</th><th className="th">Grants</th>
                  <th className="th">Granted</th><th className="th">Vested</th><th className="th">Lapsed</th>
                  <th className="th">Exercised</th><th className="th">Net Vested</th><th className="th">Value</th><th className="th">Status</th>
                </tr></thead>
                <tbody>
                  {data.employees.map((emp:any) => {
                    const s = byEmp.get(emp.id) || {granted:0,vested:0,lapsed:0,net:0,exercised:0,grants:0}
                    return (
                      <tr key={emp.id} style={{cursor:'pointer'}} onClick={()=>router.push(`/employees/${emp.id}`)}>
                        <td className="td" style={{fontWeight:600}}>{emp.name}</td>
                        <td className="td td-mono text-muted">{emp.employeeCode}</td>
                        <td className="td td-mono">{s.grants}</td>
                        <td className="td td-mono" style={{color:'#d4a853'}}>{fmtN(s.granted)}</td>
                        <td className="td td-mono text-success">{fmtN(s.vested)}</td>
                        <td className="td td-mono" style={{color:'#f87171'}}>{fmtN(s.lapsed)}</td>
                        <td className="td td-mono text-warning">{fmtN(s.exercised)}</td>
                        <td className="td td-mono text-purple font-semibold">{fmtN(s.net)}</td>
                        <td className="td td-mono text-muted">{fv>0?fmtC(s.net*fv):'—'}</td>
                        <td className="td">
                          {emp.exitDate
                            ? <span className="badge badge-red">Exited {fmtDate(emp.exitDate)}</span>
                            : <span className="badge badge-green">Active</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
