import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { computeVesting, getLatestValuation, fmtN, fmtC, fmtDate } from '@/lib/utils'
import Link from 'next/link'

export default function GrantsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<any>({ grants:[], employees:[], vesting:[], valuations:[] })
  const [busy, setBusy] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!user) return
    Promise.all([
      getDocs(query(collection(db,'grants'), orderBy('grantDate','desc'))),
      getDocs(collection(db,'employees')),
      getDocs(collection(db,'vestingEvents')),
      getDocs(query(collection(db,'valuations'), orderBy('effectiveDate','desc'))),
    ]).then(([g,e,v,vals]) => {
      setData({
        grants:     g.docs.map(d=>({id:d.id,...d.data()})),
        employees:  e.docs.map(d=>({id:d.id,...d.data()})),
        vesting:    v.docs.map(d=>({id:d.id,...d.data()})),
        valuations: vals.docs.map(d=>({id:d.id,...d.data()})),
      })
      setBusy(false)
    })
  }, [user])

  if (loading || busy) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  const fv = getLatestValuation(data.valuations)
  const vestByGrant = new Map<string,any[]>()
  data.vesting.forEach((ev:any)=>{ if(!vestByGrant.has(ev.grantId))vestByGrant.set(ev.grantId,[]); vestByGrant.get(ev.grantId)!.push(ev) })
  const empMap = new Map(data.employees.map((e:any)=>[e.id,e]))

  const filtered = data.grants.filter((g:any) => {
    if (!search) return true
    const emp = empMap.get(g.employeeId) as any
    return g.grantNumber?.toLowerCase().includes(search.toLowerCase()) || emp?.name?.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">Grants</h1>
            <p className="text-muted text-sm mt-1">{data.grants.length} grants</p>
          </div>
          <Link href="/grants/new" className="btn btn-primary">+ Add Grant</Link>
        </div>

        <div className="mb-5">
          <input className="input max-w-sm" placeholder="🔍 Search by grant # or employee..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {filtered.length === 0 ? (
          <div className="card text-center py-12 text-muted">
            <div className="text-4xl mb-3">📋</div>
            <p>{data.grants.length===0 ? <>No grants yet. <Link href="/upload" className="text-primary hover:underline">Upload data.</Link></> : 'No results.'}</p>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table className="w-full">
                <thead className="bg-[#1a1e28]"><tr>
                  <th className="th">Grant #</th>
                  <th className="th">Employee</th>
                  <th className="th">Date</th>
                  <th className="th">Total</th>
                  <th className="th">Vested</th>
                  <th className="th">Exercised</th>
                  <th className="th">Net</th>
                  <th className="th">Progress</th>
                  <th className="th">Letter</th>
                </tr></thead>
                <tbody>
                  {filtered.map((g:any)=>{
                    const emp = empMap.get(g.employeeId) as any
                    const evs = vestByGrant.get(g.id)||[]
                    const v   = computeVesting(evs, g.totalOptions, fv, g.exercised||0, emp?.exitDate||null)
                    return (
                      <tr key={g.id} className="hover:bg-[#1a1e28] cursor-pointer" onClick={()=>router.push(`/grants/${g.id}`)}>
                        <td className="td"><span className="badge badge-blue">{g.grantNumber}</span></td>
                        <td className="td font-semibold">{emp?.name||'—'}</td>
                        <td className="td td-mono text-muted">{fmtDate(g.grantDate)}</td>
                        <td className="td td-mono text-primary">{fmtN(v.total)}</td>
                        <td className="td td-mono text-success">{fmtN(v.vested)}</td>
                        <td className="td td-mono text-warning">{fmtN(v.exercised)}</td>
                        <td className="td td-mono text-purple font-semibold">{fmtN(v.netVested)}</td>
                        <td className="td" style={{minWidth:100}}>
                          <div className="flex items-center gap-2">
                            <div className="bar-bg flex-1"><div className="bar-fill" style={{width:`${v.pct}%`}}/></div>
                            <span className="text-xs text-muted w-8 text-right">{v.pct}%</span>
                          </div>
                        </td>
                        <td className="td">
                          {g.signedLetterUrl
                            ? <span className="badge badge-green">✅ Signed</span>
                            : g.letterGenerated
                              ? <span className="badge badge-purple">📄 Sent</span>
                              : <span className="badge badge-muted">—</span>}
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
