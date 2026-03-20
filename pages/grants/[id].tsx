import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db, storage } from '@/lib/firebase'
import { doc, getDoc, updateDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { useAuth } from '@/lib/auth-context'
import { usePlan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'
import { computeVesting, fmtN, fmtDate, fmtC, getLatestValuation, buildGrantLetterHTML } from '@/lib/utils'

export default function GrantDetail() {
  const { user, profile, loading } = useAuth()
  const { can } = usePlan()
  const router  = useRouter()
  const { id }  = router.query as { id: string }

  const [grant, setGrant]   = useState<any>(null)
  const [emp, setEmp]       = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [vals, setVals]     = useState<any[]>([])
  const [settings, setSettings] = useState<any>({})
  const [busy, setBusy]     = useState(true)

  const [exerciseForm, setExerciseForm] = useState({ qty:'', date:'' })
  const [exSaving, setExSaving] = useState(false)
  const [letterBusy, setLetterBusy] = useState(false)
  const [letterMsg, setLetterMsg] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  const [signedFile, setSignedFile] = useState<File|null>(null)
  const [uploadingSign, setUploadingSign] = useState(false)

  useEffect(() => { if (!loading&&!user) router.push('/login') }, [user,loading])
  useEffect(() => { if (user&&id) load() }, [user,id])

  async function load() {
    setBusy(true)
    const [gSnap, vSnap, valsSnap, settingsSnap] = await Promise.all([
      getDoc(doc(db,'grants',id)),
      getDocs(query(collection(db,'vestingEvents'),where('grantId','==',id),orderBy('vestDate'))),
      getDocs(query(collection(db,'valuations'),orderBy('effectiveDate','desc'))),
      getDoc(doc(db,'settings','main')),
    ])
    if (!gSnap.exists()) { router.push('/grants'); return }
    const g = { id:gSnap.id, ...gSnap.data() } as any; setGrant(g)
    const eSnap = await getDoc(doc(db,'employees',g.employeeId))
    setEmp({ id:eSnap.id, ...eSnap.data() })
    setEvents(vSnap.docs.map(d=>({id:d.id,...d.data()})))
    setVals(valsSnap.docs.map(d=>({id:d.id,...d.data()})))
    if (settingsSnap.exists()) setSettings(settingsSnap.data())
    setBusy(false)
  }

  async function recordExercise() {
    const qty = parseInt(exerciseForm.qty)
    if (!qty||qty<=0) { alert('Enter valid quantity'); return }
    const fv = getLatestValuation(vals)
    const v = computeVesting(events, grant.totalOptions, fv, grant.exercised||0, emp?.exitDate||null)
    if (qty > v.netVested) { alert(`Cannot exercise more than net vested (${fmtN(v.netVested)})`); return }
    setExSaving(true)
    const newEx = (grant.exercised||0)+qty
    await updateDoc(doc(db,'grants',id),{
      exercised:newEx,
      lastExerciseDate:exerciseForm.date||new Date().toISOString().split('T')[0],
      updatedAt:new Date().toISOString()
    })
    setExerciseForm({qty:'',date:''})
    await load(); setExSaving(false)
  }

  async function generateAndDownloadLetter() {
    setLetterBusy(true); setLetterMsg('')
    try {
      const vestingSchedule = events.map(ev=>({ date:ev.vestDate, quantity:ev.optionsCount }))
      const companyName = settings.companyName || process.env.NEXT_PUBLIC_COMPANY_NAME || 'Hamoroni'
      const html = buildGrantLetterHTML({
        grantNumber:grant.grantNumber, employeeName:emp.name, employeeCode:emp.employeeCode,
        grantDate:grant.grantDate, totalOptions:grant.totalOptions, exercisePrice:grant.exercisePrice||0,
        vestingSchedule, companyName, notes:grant.notes
      })

      // Store in Firebase Storage
      const path = `grant-letters/${grant.grantNumber}_${Date.now()}.html`
      const r = sRef(storage, path)
      await uploadBytes(r, new Blob([html],{type:'text/html'}))
      const url = await getDownloadURL(r)
      await updateDoc(doc(db,'grants',id),{ letterPath:path, letterUrl:url, letterGenerated:true, updatedAt:new Date().toISOString() })

      // Download in browser
      const blob = new Blob([html],{type:'text/html'})
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob)
      a.download=`${grant.grantNumber}_GrantLetter.html`; a.click()
      setLetterMsg('✅ Downloaded! Open the HTML file in any browser to print as PDF.')
      await load()
    } catch(e:any) { setLetterMsg('❌ Error: '+e.message) }
    setLetterBusy(false)
  }

  async function emailLetterViaResend() {
    const toEmail = emp.personalEmail || emp.officialEmail
    if (!toEmail) { setEmailMsg('❌ No email on file for this employee. Add it in their profile.'); return }
    setEmailBusy(true); setEmailMsg('')
    try {
      const vestingSchedule = events.map(ev=>({ date:ev.vestDate, quantity:ev.optionsCount }))
      const companyName = settings.companyName || process.env.NEXT_PUBLIC_COMPANY_NAME || 'Hamoroni'
      const html = buildGrantLetterHTML({
        grantNumber:grant.grantNumber, employeeName:emp.name, employeeCode:emp.employeeCode,
        grantDate:grant.grantDate, totalOptions:grant.totalOptions, exercisePrice:grant.exercisePrice||0,
        vestingSchedule, companyName, notes:grant.notes
      })

      // Send via Resend API directly (no server needed - Resend supports browser calls)
      const fromEmail = settings.fromEmail || 'onboarding@resend.dev'
      const fromName  = settings.fromName  || `${companyName} HR`

      const tpl = settings.emailTemplates?.grant ||
        `Dear ${emp.name},\n\nPlease find your ESOP grant letter for grant ${grant.grantNumber} attached.\n\nRegards,\n${fromName}`

      const body = tpl
        .replace(/\{\{name\}\}/g, emp.name)
        .replace(/\{\{options\}\}/g, fmtN(grant.totalOptions))
        .replace(/\{\{grantNumber\}\}/g, grant.grantNumber)
        .replace(/\{\{date\}\}/g, fmtDate(grant.grantDate))
        .replace(/\{\{company\}\}/g, companyName)
        .replace(/\{\{signature\}\}/g, settings.emailSignature || fromName)

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [toEmail],
          subject: `Your ESOP Grant Letter — ${grant.grantNumber}`,
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto"><p>${body.replace(/\n/g,'<br>')}</p><hr><br>${html}</div>`
        })
      })

      if (res.ok) {
        setEmailMsg(`✅ Email sent to ${toEmail}`)
        await updateDoc(doc(db,'grants',id),{ lastEmailedAt:new Date().toISOString() })
      } else {
        const err = await res.json()
        setEmailMsg(`❌ Email failed: ${err.message||'Unknown error'}. Check NEXT_PUBLIC_RESEND_API_KEY in .env.local`)
      }
    } catch(e:any) { setEmailMsg('❌ Error: '+e.message) }
    setEmailBusy(false)
  }

  async function uploadSignedLetter() {
    if (!signedFile) return
    setUploadingSign(true)
    try {
      const path = `signed-letters/${grant.grantNumber}_signed_${Date.now()}.pdf`
      const r = sRef(storage, path)
      await uploadBytes(r, signedFile)
      const url = await getDownloadURL(r)
      await updateDoc(doc(db,'grants',id),{
        signedLetterPath:path, signedLetterUrl:url,
        signedLetterName:signedFile.name, signedAt:new Date().toISOString()
      })
      setSignedFile(null); await load()
    } catch(e:any) {
      alert(`Upload failed: ${e.message}\n\nMake sure Firebase Storage rules allow writes. In Firebase Console → Storage → Rules:\nallow read, write: if request.auth != null;`)
    }
    setUploadingSign(false)
  }

  if (loading||busy) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>
  if (!grant||!emp) return null

  const fv = getLatestValuation(vals)
  const v  = computeVesting(events, grant.totalOptions, fv, grant.exercised||0, emp.exitDate||null)
  const canEdit = ['admin','editor'].includes(profile?.role||'')
  const canEmail = can('email_letters')

  return (
    <Layout>
      <div className="p-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="badge badge-blue text-base px-4 py-1.5">{grant.grantNumber}</span>
              <span className={`badge ${emp.exitDate?'badge-red':'badge-green'}`}>{emp.exitDate?'Employee Exited':'Active'}</span>
              {grant.signedLetterUrl&&<span className="badge badge-green">✅ Letter Signed</span>}
              {grant.letterGenerated&&<span className="badge badge-purple">📄 Letter Generated</span>}
            </div>
            <h1 className="page-title">{emp.name}</h1>
            <p className="text-muted text-sm mt-1">
              {emp.employeeCode} · Granted {fmtDate(grant.grantDate)} · Exercise price {fmtC(grant.exercisePrice||0)}/option
              {emp.department&&` · ${emp.department}`}
            </p>
          </div>
          <button onClick={()=>router.back()} className="btn btn-ghost btn-sm">← Back</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-7">
          {[
            {l:'Total Granted',v:fmtN(v.total),c:'primary'},
            {l:'Vested',v:fmtN(v.vested),c:'success'},
            {l:'Exercised',v:fmtN(v.exercised),c:'warning'},
            {l:'Net Vested',v:fmtN(v.netVested),c:'purple'},
          ].map(s=>(
            <div key={s.l} className="card">
              <div className="stat-lbl">{s.l}</div>
              <div className={`stat-val text-${s.c}`}>{s.v}</div>
              {s.l==='Net Vested'&&fv>0&&<div className="text-xs text-muted mt-1">{fmtC(v.netVested*fv)}</div>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left — Vesting schedule */}
          <div className="card">
            <h2 className="section-title mb-4">Vesting Schedule</h2>
            {events.length===0
              ? <p className="text-muted text-sm">No vesting events on record.</p>
              : <div className="space-y-2">
                  {events.map(ev=>{
                    // Compute status dynamically — don't trust stale DB status
                    const dynamicStatus = (() => {
                      if (emp.exitDate) {
                        return ev.vestDate > emp.exitDate ? 'lapsed' : 'vested'
                      }
                      return ev.vestDate <= new Date().toISOString().split('T')[0] ? 'vested' : 'pending'
                    })()
                    return (
                      <div key={ev.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dynamicStatus==='lapsed'?'bg-danger':dynamicStatus==='vested'?'bg-success':'bg-warning'}`}/>
                          <span className="text-sm font-mono text-muted">{fmtDate(ev.vestDate)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold">{fmtN(ev.optionsCount)}</span>
                          {fv>0&&dynamicStatus!=='lapsed'&&<span className="text-xs text-muted">{fmtC(ev.optionsCount*fv)}</span>}
                          <span className={`badge text-[10px] ${dynamicStatus==='lapsed'?'badge-red':dynamicStatus==='vested'?'badge-green':'badge-amber'}`}>
                            {dynamicStatus}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>}
          </div>

          {/* Right — Actions */}
          <div className="space-y-5">
            {/* Grant Letter */}
            <div className="card">
              <h2 className="section-title mb-3">Grant Letter</h2>

              <button onClick={generateAndDownloadLetter} disabled={letterBusy}
                className="btn btn-ghost w-full justify-center mb-2">
                {letterBusy?'⏳ Generating...':'⬇ Download Letter (HTML → Print as PDF)'}
              </button>
              {letterMsg&&<p className="text-xs mb-2" style={{color:letterMsg.startsWith('✅')?'#2dd4a0':'#ff5c5c'}}>{letterMsg}</p>}

              {canEmail ? (
                <button onClick={emailLetterViaResend} disabled={emailBusy}
                  className="btn btn-primary w-full justify-center mb-1">
                  {emailBusy?'⏳ Sending email...':'📧 Email Letter to Employee'}
                </button>
              ) : (
                <div style={{background:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)',borderRadius:9,padding:'10px 14px',marginBottom:8,fontSize:12,color:'#a8a8a0'}}>
                  📧 Email letters requires <strong style={{color:'#d4a853'}}>Pro plan</strong>. Upgrade in Users page.
                </div>
              )}
              {emailMsg&&<p className="text-xs mb-2" style={{color:emailMsg.startsWith('✅')?'#2dd4a0':'#ff5c5c'}}>{emailMsg}</p>}

              {grant.letterGenerated&&grant.letterUrl&&(
                <div className="text-xs text-muted mt-2">
                  <a href={grant.letterUrl} target="_blank" className="text-primary hover:underline">📄 View stored letter</a>
                  {grant.lastEmailedAt&&<span className="ml-2">· Emailed {fmtDate(grant.lastEmailedAt)}</span>}
                </div>
              )}

              {/* Signed letter upload */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="stat-lbl mb-2">Upload Signed Letter</div>
                {grant.signedLetterUrl ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-green">✅ Signed on file</span>
                    <a href={grant.signedLetterUrl} target="_blank" className="text-primary text-xs hover:underline">{grant.signedLetterName}</a>
                    <span className="text-xs text-muted">· {fmtDate(grant.signedAt)}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="file" accept=".pdf,.jpg,.png"
                      onChange={e=>setSignedFile(e.target.files?.[0]||null)}
                      className="text-xs text-muted file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-surface2 file:text-white file:text-xs cursor-pointer"/>
                    {signedFile&&(
                      <button onClick={uploadSignedLetter} disabled={uploadingSign} className="btn btn-success btn-sm">
                        {uploadingSign?'⏳ Uploading...':'⬆ Upload'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Record Exercise */}
            {canEdit&&(
              <div className="card">
                <h2 className="section-title mb-2">Record Options Exercise</h2>
                <p className="text-xs text-muted mb-3">
                  Total exercised: <strong className="text-white">{fmtN(grant.exercised||0)}</strong>
                  {' '}· Available to exercise: <strong className="text-white">{fmtN(v.netVested)}</strong>
                </p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="label">Options to Exercise</label>
                    <input type="number" className="input" placeholder="e.g. 100" value={exerciseForm.qty} onChange={e=>setExerciseForm(f=>({...f,qty:e.target.value}))}/></div>
                  <div><label className="label">Exercise Date</label>
                    <input type="date" className="input" value={exerciseForm.date} onChange={e=>setExerciseForm(f=>({...f,date:e.target.value}))}/></div>
                </div>
                <button onClick={recordExercise} disabled={exSaving||!exerciseForm.qty} className="btn btn-success btn-sm">
                  {exSaving?'⏳ Recording...':'✅ Record Exercise'}
                </button>
              </div>
            )}

            {/* Notes */}
            {grant.notes&&(
              <div className="card">
                <div className="stat-lbl mb-1">Notes / Conditions</div>
                <p className="text-sm text-muted whitespace-pre-wrap">{grant.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
