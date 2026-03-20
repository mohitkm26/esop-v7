import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import { computeVesting, getLatestValuation, fmtN, fmtC, fmtDate } from '@/lib/utils'
import Link from 'next/link'

export default function EmployeesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<any>({ employees:[], grants:[], vesting:[], valuations:[] })
  const [busy, setBusy] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!user) return
    Promise.all([
      getDocs(query(collection(db,'employees'), orderBy('name'))),
      getDocs(collection(db,'grants')),
      getDocs(collection(db,'vestingEvents')),
      getDocs(query(collection(db,'valuations'), orderBy('effectiveDate','desc'))),
    ]).then(([e,g,v,vals]) => {
      setData({
        employees: e.docs.map(d=>({id:d.id,...d.data()})),
        grants:    g.docs.map(d=>({id:d.id,...d.data()})),
        vesting:   v.docs.map(d=>({id:d.id,...d.data()})),
        valuations:vals.docs.map(d=>({id:d.id,...d.data()})),
      })
      setBusy(false)
    })
  }, [user])

  if (loading || busy) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  const fv = getLatestValuation(data.valuations)
  const vestByGrant = new Map<string,any[]>()
  data.vesting.forEach((ev:any) => {
    if (!vestByGrant.has(ev.grantId)) vestByGrant.set(ev.grantId,[])
    vestByGrant.get(ev.grantId)!.push(ev)
  })

  const grantsByEmp = new Map<string,any[]>()
  data.grants.forEach((g:any) => {
    if (!grantsByEmp.has(g.employeeId)) grantsByEmp.set(g.employeeId,[])
    grantsByEmp.get(g.employeeId)!.push(g)
  })

  const filtered = data.employees.filter((e:any) =>
    !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.employeeCode?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">Employees</h1>
            <p className="text-muted text-sm mt-1">{data.employees.length} total</p>
          </div>
          <Link href="/employees/new" className="btn btn-primary">+ Add Employee</Link>
        </div>

        <div className="mb-5">
          <input className="input max-w-sm" placeholder="🔍 Search by name or code..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>

        {filtered.length === 0 ? (
          <div className="card text-center py-12 text-muted">
            <div className="text-4xl mb-3">👥</div>
            <p>{data.employees.length===0 ? 'No employees yet. Upload data or add manually.' : 'No results.'}</p>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table className="w-full">
                <thead className="bg-[#1a1e28]"><tr>
                  <th className="th">Name</th>
                  <th className="th">Code</th>
                  <th className="th">Grants</th>
                  <th className="th">Granted</th>
                  <th className="th">Net Vested</th>
                  <th className="th">Value</th>
                  <th className="th">Status</th>
                </tr></thead>
                <tbody>
                  {filtered.map((emp:any) => {
                    const grants = grantsByEmp.get(emp.id)||[]
                    let granted=0, net=0
                    grants.forEach(g => {
                      const evs = vestByGrant.get(g.id)||[]
                      const v = computeVesting(evs, g.totalOptions, fv, g.exercised||0, emp.exitDate||null)
                      granted += v.total; net += v.netVested
                    })
                    return (
                      <tr key={emp.id} className="hover:bg-[#1a1e28] cursor-pointer" onClick={()=>router.push(`/employees/${emp.id}`)}>
                        <td className="td font-semibold">{emp.name}</td>
                        <td className="td td-mono text-muted">{emp.employeeCode}</td>
                        <td className="td td-mono">{grants.length}</td>
                        <td className="td td-mono text-primary">{fmtN(granted)}</td>
                        <td className="td td-mono text-purple font-semibold">{fmtN(net)}</td>
                        <td className="td td-mono text-muted">{fv>0?fmtC(net*fv):'—'}</td>
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
