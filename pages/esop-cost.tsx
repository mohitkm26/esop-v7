import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'
import PlanGate from '@/components/PlanGate'
import { calcESOPCost, fmtC, fmtDate, fmtN, getLatestValuation, computeVestingStatus, downloadBlob } from '@/lib/utils'

export default function ESOPCostPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [rawData, setRawData] = useState<any>({ grants:[], employees:[], vesting:[], valuations:[] })
  const [busy, setBusy]       = useState(true)
  const [selFY, setSelFY]     = useState('')
  const [standard, setStandard] = useState<'indas'|'gaap'|'ifrs'>('indas')

  useEffect(() => { if (!loading&&!user) router.push('/login') }, [user,loading])
  useEffect(() => {
    if (!user) return
    Promise.all([
      getDocs(collection(db,'grants')),
      getDocs(collection(db,'employees')),
      getDocs(collection(db,'vestingEvents')),
      getDocs(query(collection(db,'valuations'),orderBy('effectiveDate','desc'))),
    ]).then(([g,e,v,vals]) => {
      setRawData({
        grants:    g.docs.map(d=>({id:d.id,...d.data()})),
        employees: e.docs.map(d=>({id:d.id,...d.data()})),
        vesting:   v.docs.map(d=>({id:d.id,...d.data()})),
        valuations:vals.docs.map(d=>({id:d.id,...d.data()})),
      })
      setBusy(false)
    })
  }, [user])

  const { results, allFYs } = useMemo(() => {
    const vestMap = new Map<string,any[]>()
    rawData.vesting.forEach((ev:any)=>{
      if(!vestMap.has(ev.grantId)) vestMap.set(ev.grantId,[])
      vestMap.get(ev.grantId)!.push(ev)
    })
    const empMap = new Map(rawData.employees.map((e:any)=>[e.id,e]))

    const results = rawData.grants
      .filter((g:any) => g.grantDate)
      .map((g:any) => {
        const emp = (empMap.get(g.employeeId) as any) || { name:'Unknown', exitDate:null }
        const allEvs = vestMap.get(g.id)||[]
        // Only count non-lapsed events for cost (employees who exited before vesting don't generate cost)
        const activeEvs = allEvs.filter((ev:any) =>
          computeVestingStatus(ev.vestDate, emp.exitDate, ev.status) !== 'lapsed'
        )
        // CRITICAL: Use fair value AS OF the grant date (not current FV)
        // This is what IndAS 102 / IFRS 2 require — cost is locked at grant date
        const grantDateFV = g.grantDateFairValue != null
          ? g.grantDateFairValue
          : getLatestValuation(rawData.valuations, g.grantDate)
        return calcESOPCost(
          { id:g.id, grantNumber:g.grantNumber, grantDate:g.grantDate, exercisePrice:g.exercisePrice||0, totalOptions:g.totalOptions },
          { name: emp.name },
          activeEvs,
          grantDateFV
        )
      })
      .filter((r:any) => r.totalCost > 0 || Object.keys(r.fyAllocation).length > 0)

    const allFYs: string[] = [...new Set<string>(
      results.flatMap((r:any) => Object.keys(r.fyAllocation||{}))
    )].sort()

    return { results, allFYs }
  }, [rawData])

  useEffect(() => {
    if (!selFY && allFYs.length > 0) {
      // Default to current Indian FY
      const now = new Date()
      const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear()-1
      const currentFY = `FY ${fyStart}-${String(fyStart+1).slice(2)}`
      setSelFY(allFYs.includes(currentFY) ? currentFY : allFYs[allFYs.length-1])
    }
  }, [allFYs, selFY])

  function downloadDetailedCSV() {
    // Header row with all FYs
    const header = ['Grant #','Employee','Grant Date','Exercise Price (₹)','FV at Grant Date (₹)','Intrinsic Value/Option (₹)','Total ESOP Cost (₹)',...allFYs.map(fy=>`${fy} Cost (₹)`)]
    const rows = results.map((r:any) => [
      r.grantNumber, r.employeeName, r.grantDate||'',
      r.exercisePrice, r.grantDateFV, r.intrinsicValue, r.totalCost,
      ...allFYs.map(fy => r.fyAllocation[fy]||0)
    ])
    // Summary row
    const totals = [
      'TOTAL','','','','','',
      results.reduce((s:number,r:any)=>s+r.totalCost,0),
      ...allFYs.map(fy=>results.reduce((s:number,r:any)=>s+(r.fyAllocation[fy]||0),0))
    ]
    const csv = [header, ...rows, [], totals].map(r=>r.map((v:any)=>`"${v}"`).join(',')).join('\n')
    downloadBlob(csv, `ESOP_Cost_${standard.toUpperCase()}_${new Date().toISOString().split('T')[0]}.csv`)
  }

  if (loading||busy) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  const activeFY  = selFY || allFYs[allFYs.length-1] || ''
  const totalCost = results.reduce((s:number,r:any)=>s+r.totalCost,0)
  const fyTotal   = results.reduce((s:number,r:any)=>s+(r.fyAllocation[activeFY]||0),0)

  const stdNotes: Record<string,string> = {
    indas: 'IndAS 102: Cost = (FV on grant date − Exercise Price) × options vesting in period. Recognised proportionately over vesting. Lapsed options excluded — no reversal needed for employees who exit before vesting.',
    gaap:  'Indian GAAP (ICAI Guidance Note 18): Intrinsic value method. FV locked at grant date. Lapsed/forfeited options excluded from P&L charge.',
    ifrs:  'IFRS 2: Intrinsic value shown for reference. Note — IFRS 2 strongly prefers the fair value method using Black-Scholes or binomial tree. Engage a valuation expert for full IFRS 2 compliance.',
  }

  const S: Record<string,any> = {
    th:   {padding:'10px 14px',fontSize:11,fontWeight:700,color:'#6b6b6b',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #1c1c1c',textAlign:'left' as const,whiteSpace:'nowrap' as const},
    td:   {padding:'11px 14px',fontSize:12,borderBottom:'1px solid #0f0f0f',verticalAlign:'middle' as const},
    tdr:  {padding:'11px 14px',fontSize:12,borderBottom:'1px solid #0f0f0f',textAlign:'right' as const,fontFamily:'monospace',verticalAlign:'middle' as const},
  }

  return (
    <Layout>
      <PlanGate feature="esop_cost" overlay={false}>
      <div className="p-8">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">ESOP Cost</h1>
            <p className="text-muted text-sm mt-1">
              P&L charge recognised per financial year — grant-date fair value locked at time of grant
            </p>
          </div>
          <button onClick={downloadDetailedCSV} className="btn btn-primary btn-sm" disabled={results.length===0}>
            ⬇ Download Year-wise CSV
          </button>
        </div>

        {/* Standard selector */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {(['indas','gaap','ifrs'] as const).map(s=>(
            <button key={s} onClick={()=>setStandard(s)}
              style={{padding:'7px 16px',borderRadius:9,border:'1px solid',cursor:'pointer',fontSize:12,fontWeight:600,
                background:standard===s?'rgba(212,168,83,0.12)':'transparent',
                borderColor:standard===s?'rgba(212,168,83,0.3)':'#2a2a2a',
                color:standard===s?'#d4a853':'#6b6b6b'}}>
              {s==='indas'?'IndAS 102':s==='gaap'?'Indian GAAP':'IFRS 2'}
            </button>
          ))}
        </div>

        {/* Standard note */}
        <div style={{background:'rgba(212,168,83,0.05)',border:'1px solid rgba(212,168,83,0.15)',borderRadius:10,padding:'10px 14px',fontSize:11,color:'#a8a8a0',marginBottom:20,lineHeight:1.7}}>
          <strong style={{color:'#d4a853'}}>Note ({standard==='indas'?'IndAS 102':standard==='gaap'?'Indian GAAP':'IFRS 2'}):</strong> {stdNotes[standard]}
        </div>

        {rawData.valuations.length===0&&(
          <div style={{background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.2)',borderRadius:10,padding:'12px 16px',fontSize:13,color:'#f87171',marginBottom:20}}>
            ⚠️ No valuations found. Add grant-date fair values in Valuation page. Cost is ₹0 without valuations.
          </div>
        )}

        {/* FY summary cards */}
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:24}}>
          <div style={{background:'#141414',border:'1px solid #1c1c1c',borderRadius:14,padding:'16px 20px',flex:1,minWidth:160}}>
            <div style={{fontSize:10,color:'#6b6b6b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Total ESOP Cost (Lifetime)</div>
            <div style={{fontSize:22,fontWeight:800,color:'#f87171'}}>{fmtC(totalCost)}</div>
          </div>
          <div style={{background:'#141414',border:'1px solid #1c1c1c',borderRadius:14,padding:'16px 20px',flex:1,minWidth:160}}>
            <div style={{fontSize:10,color:'#6b6b6b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Active Grants</div>
            <div style={{fontSize:22,fontWeight:800,color:'#d4a853'}}>{results.length}</div>
          </div>
          <div style={{background:'#141414',border:'1px solid #1c1c1c',borderRadius:14,padding:'16px 20px',flex:2,minWidth:200}}>
            <div style={{fontSize:10,color:'#6b6b6b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>FY Cost Selector</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {allFYs.map(fy=>(
                <button key={fy} onClick={()=>setSelFY(fy)}
                  style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid',cursor:'pointer',
                    background:fy===activeFY?'rgba(212,168,83,0.12)':'transparent',
                    borderColor:fy===activeFY?'rgba(212,168,83,0.3)':'#2a2a2a',
                    color:fy===activeFY?'#d4a853':'#6b6b6b'}}>
                  {fy}
                </button>
              ))}
            </div>
          </div>
          <div style={{background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.15)',borderRadius:14,padding:'16px 20px',flex:1,minWidth:160}}>
            <div style={{fontSize:10,color:'#6b6b6b',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>{activeFY} P&L Charge</div>
            <div style={{fontSize:22,fontWeight:800,color:'#f87171'}}>{fmtC(fyTotal)}</div>
          </div>
        </div>

        {/* Detail table */}
        {activeFY&&(
          <>
            <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>Grant-wise Detail — {activeFY}</div>
            <div className="card" style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:800}}>
                <thead>
                  <tr>
                    <th style={S.th}>Grant #</th>
                    <th style={S.th}>Employee</th>
                    <th style={{...S.th,textAlign:'right'}}>Exercise Price</th>
                    <th style={{...S.th,textAlign:'right'}}>FV at Grant Date</th>
                    <th style={{...S.th,textAlign:'right'}}>Intrinsic Value/Option</th>
                    <th style={{...S.th,textAlign:'right'}}>Total Cost</th>
                    <th style={{...S.th,textAlign:'right'}}>Cost {activeFY}</th>
                  </tr>
                </thead>
                <tbody>
                  {results
                    .filter((r:any)=>(r.fyAllocation[activeFY]||0)>0 || r.totalCost>0)
                    .sort((a:any,b:any)=>(b.fyAllocation[activeFY]||0)-(a.fyAllocation[activeFY]||0))
                    .map((r:any)=>(
                    <tr key={r.grantId}>
                      <td style={S.td}><span className="badge badge-blue">{r.grantNumber}</span></td>
                      <td style={S.td} className="font-semibold">{r.employeeName}</td>
                      <td style={S.tdr}>{fmtC(r.exercisePrice)}</td>
                      <td style={S.tdr}>{fmtC(r.grantDateFV)}</td>
                      <td style={{...S.tdr,color:r.intrinsicValue>0?'#4ade80':'#f87171'}}>{fmtC(r.intrinsicValue)}</td>
                      <td style={{...S.tdr,color:'#f87171',fontWeight:600}}>{fmtC(r.totalCost)}</td>
                      <td style={{...S.tdr,color:'#f87171',fontWeight:700}}>{fmtC(r.fyAllocation[activeFY]||0)}</td>
                    </tr>
                  ))}
                  <tr style={{background:'rgba(212,168,83,0.05)'}}>
                    <td colSpan={5} style={{...S.td,fontWeight:700,color:'#d4a853'}}>FY Total</td>
                    <td style={{...S.tdr,fontWeight:800,fontSize:14,color:'#f87171'}}>{fmtC(results.reduce((s:number,r:any)=>s+r.totalCost,0))}</td>
                    <td style={{...S.tdr,fontWeight:800,fontSize:14,color:'#f87171'}}>{fmtC(fyTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Year-wise breakdown for all FYs */}
            <div style={{fontWeight:700,fontSize:14,margin:'24px 0 10px'}}>All Years — P&L Charge Schedule</div>
            <div className="card" style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
                <thead>
                  <tr>
                    <th style={S.th}>Grant #</th>
                    <th style={S.th}>Employee</th>
                    {allFYs.map(fy=><th key={fy} style={{...S.th,textAlign:'right'}}>{fy}</th>)}
                    <th style={{...S.th,textAlign:'right'}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r:any)=>(
                    <tr key={r.grantId}>
                      <td style={S.td}><span className="badge badge-blue">{r.grantNumber}</span></td>
                      <td style={S.td}>{r.employeeName}</td>
                      {allFYs.map(fy=>(
                        <td key={fy} style={{...S.tdr,color:(r.fyAllocation[fy]||0)>0?'#f87171':'#3a3a3a'}}>
                          {(r.fyAllocation[fy]||0)>0?fmtC(r.fyAllocation[fy]):'—'}
                        </td>
                      ))}
                      <td style={{...S.tdr,fontWeight:700,color:'#f87171'}}>{fmtC(r.totalCost)}</td>
                    </tr>
                  ))}
                  <tr style={{background:'rgba(212,168,83,0.05)'}}>
                    <td colSpan={2} style={{...S.td,fontWeight:700,color:'#d4a853'}}>Total</td>
                    {allFYs.map(fy=>(
                      <td key={fy} style={{...S.tdr,fontWeight:700,color:'#f87171'}}>
                        {fmtC(results.reduce((s:number,r:any)=>s+(r.fyAllocation[fy]||0),0))}
                      </td>
                    ))}
                    <td style={{...S.tdr,fontWeight:800,color:'#f87171'}}>{fmtC(totalCost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      </PlanGate>
    </Layout>
  )
}
