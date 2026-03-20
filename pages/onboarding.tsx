import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Head from 'next/head'

const STEPS = ['company','plan','complete'] as const
type Step = typeof STEPS[number]

const PLANS = [
  { id:'basic', name:'Basic', price:'Free', desc:'Dashboard, employees, grants, CSV upload, grant letters', color:'#6b6b6b' },
  { id:'pro', name:'Pro', price:'₹999/yr', desc:'Everything in Basic + Email letters, Valuation tracking, Employee portal', color:'#60a5fa' },
  { id:'advanced', name:'Advanced', price:'₹4,999/yr', desc:'Everything in Pro + ESOP Cost (IndAS/IFRS/GAAP), eSign integration', color:'#d4a853' },
]

export default function Onboarding() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [step, setStep]     = useState<Step>('company')
  const [saving, setSaving] = useState(false)
  const [form, setForm]     = useState({
    companyName:'', gstn:'', pan:'', address:'', city:'', state:'',
    contactName:'', contactEmail:'', contactPhone:'',
    source:'', currentTool:'', otherTool:'', selectedPlan:'basic',
  })

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && profile) {
      // Already onboarded — check if company exists
      getDoc(doc(db,'companies',user.uid)).then(snap => {
        if (snap.exists() && snap.data().onboarded) router.replace('/dashboard')
      })
    }
  }, [loading, user, profile])

  const upd = (k: string) => (e: any) => setForm(f=>({...f,[k]:e.target.value}))

  async function saveCompany() {
    if (!form.companyName.trim()) { alert('Company name is required'); return }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const expiry = new Date(Date.now()+365*24*60*60*1000).toISOString().split('T')[0]
      await setDoc(doc(db,'companies',user!.uid),{
        companyId: user!.uid, ownerId: user!.uid,
        companyName: form.companyName.trim(),
        gstn: form.gstn||null, pan: form.pan||null,
        address: form.address||null, city: form.city||null, state: form.state||null,
        contactName: form.contactName||null, contactEmail: form.contactEmail||user!.email,
        contactPhone: form.contactPhone||null,
        source: form.source||null, currentTool: form.currentTool==='other'?form.otherTool:form.currentTool||null,
        plan: 'basic', planExpiry: expiry, // Everyone starts basic
        onboarded: true, createdAt: now, updatedAt: now,
      })
      // Also save settings
      await setDoc(doc(db,'settings','main'),{
        companyName: form.companyName.trim(),
        hrEmail: form.contactEmail||user!.email,
        fromEmail: form.contactEmail||user!.email,
        fromName: form.contactName||'HR Team',
        emailSignature: `Best regards,\n${form.contactName||'HR Team'}\n${form.companyName}`,
        triggers: { onVesting:true, onValuationChange:false, onGrantCreated:true, onExercise:false, onExit:false },
      },{ merge:true })
      setStep('plan')
    } catch(e:any) { alert('Error: '+e.message) }
    setSaving(false)
  }

  async function completePlan() {
    router.replace('/dashboard')
  }

  if (loading) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  const S: Record<string,any> = {
    wrap: {minHeight:'100vh',background:'#0c0c0c',fontFamily:"'DM Sans',system-ui",color:'#f5f0e8',WebkitFontSmoothing:'antialiased'},
    inner: {maxWidth:560,margin:'0 auto',padding:'48px 24px'},
    label: {fontSize:11,fontWeight:700,color:'#6b6b6b',textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:6,display:'block'},
    input: {width:'100%',background:'#141414',border:'1px solid #1c1c1c',borderRadius:9,padding:'11px 14px',fontSize:13,color:'#f5f0e8',outline:'none',marginBottom:0},
    sel: {width:'100%',background:'#141414',border:'1px solid #1c1c1c',borderRadius:9,padding:'11px 14px',fontSize:13,color:'#f5f0e8',outline:'none'},
    card: {background:'#141414',border:'1px solid #1c1c1c',borderRadius:16,padding:24,marginBottom:16},
    row2: {display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14},
    row1: {marginBottom:14},
  }

  const Logo = () => (
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:40}}>
      <div style={{width:32,height:32,borderRadius:9,background:'linear-gradient(135deg,#d4a853,#a07830)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:15,color:'#0c0c0c'}}>E</div>
      <span style={{fontWeight:700,fontSize:16}}>ESOP Manager</span>
    </div>
  )

  if (step === 'company') return (
    <>
      <Head><title>Set up your company — ESOP Manager</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </Head>
      <div style={S.wrap}><div style={S.inner}>
        <Logo/>
        <h1 style={{fontSize:26,fontWeight:800,letterSpacing:'-0.03em',marginBottom:6}}>Welcome! Let's set up your company</h1>
        <p style={{fontSize:13,color:'#6b6b6b',marginBottom:28,lineHeight:1.6}}>This takes 2 minutes. Your data is isolated and private.</p>

        <div style={S.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Company Details</div>
          <div style={S.row2}>
            <div><label style={S.label}>Company Name *</label><input style={S.input} placeholder="Hamoroni Pvt Ltd" value={form.companyName} onChange={upd('companyName')}/></div>
            <div><label style={S.label}>PAN</label><input style={S.input} placeholder="AABCH1234D" value={form.pan} onChange={upd('pan')}/></div>
          </div>
          <div style={S.row1}><label style={S.label}>GSTIN (optional)</label><input style={S.input} placeholder="27AABCH1234D1Z5" value={form.gstn} onChange={upd('gstn')}/></div>
          <div style={S.row2}>
            <div><label style={S.label}>City</label><input style={S.input} placeholder="Mumbai" value={form.city} onChange={upd('city')}/></div>
            <div><label style={S.label}>State</label><input style={S.input} placeholder="Maharashtra" value={form.state} onChange={upd('state')}/></div>
          </div>
          <div style={S.row1}><label style={S.label}>Registered Address</label><input style={S.input} placeholder="123 Business Park, Andheri East" value={form.address} onChange={upd('address')}/></div>
        </div>

        <div style={S.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>HR Contact</div>
          <div style={S.row2}>
            <div><label style={S.label}>Contact Name</label><input style={S.input} placeholder="Priya Sharma" value={form.contactName} onChange={upd('contactName')}/></div>
            <div><label style={S.label}>Contact Email</label><input style={S.input} placeholder="hr@company.com" value={form.contactEmail} onChange={upd('contactEmail')}/></div>
          </div>
          <div style={S.row1}><label style={S.label}>Contact Phone</label><input style={S.input} placeholder="+91 98765 43210" value={form.contactPhone} onChange={upd('contactPhone')}/></div>
        </div>

        <div style={S.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:14}}>Quick questions (optional)</div>
          <div style={S.row1}>
            <label style={S.label}>How did you hear about us?</label>
            <select style={S.sel} value={form.source} onChange={upd('source')}>
              <option value="">Select...</option>
              <option value="google">Google Search</option><option value="linkedin">LinkedIn</option>
              <option value="referral">Referral</option><option value="ca">CA / Advisor</option>
              <option value="twitter">Twitter / X</option><option value="other">Other</option>
            </select>
          </div>
          <div style={S.row1}>
            <label style={S.label}>Are you currently using any ESOP management tool?</label>
            <select style={S.sel} value={form.currentTool} onChange={upd('currentTool')}>
              <option value="">None / Spreadsheets</option>
              <option value="trica">Trica</option><option value="carta">Carta</option>
              <option value="qapita">Qapita</option><option value="excel">Excel/Sheets only</option>
              <option value="other">Other (specify below)</option>
            </select>
          </div>
          {form.currentTool==='other'&&(
            <div style={S.row1}><label style={S.label}>Which tool?</label><input style={S.input} placeholder="Tool name" value={form.otherTool} onChange={upd('otherTool')}/></div>
          )}
        </div>

        <button onClick={saveCompany} disabled={saving}
          style={{width:'100%',padding:'14px',background:'linear-gradient(135deg,#d4a853,#a07830)',border:'none',borderRadius:11,fontSize:15,fontWeight:700,color:'#0c0c0c',cursor:'pointer',opacity:saving?0.7:1}}>
          {saving?'Saving...':'Continue →'}
        </button>
      </div></div>
    </>
  )

  if (step === 'plan') return (
    <>
      <Head><title>Choose a plan — ESOP Manager</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </Head>
      <div style={S.wrap}><div style={{...S.inner,maxWidth:700}}>
        <Logo/>
        <h1 style={{fontSize:26,fontWeight:800,letterSpacing:'-0.03em',marginBottom:6}}>Choose your plan</h1>
        <p style={{fontSize:13,color:'#6b6b6b',marginBottom:28,lineHeight:1.6}}>
          You're on Basic (Free) to start. Upgrade anytime from Settings → Users.
        </p>

        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,marginBottom:28}}>
          {PLANS.map(p=>(
            <div key={p.id} style={{background:'#141414',border:`1px solid ${p.id==='advanced'?'rgba(212,168,83,0.3)':'#1c1c1c'}`,borderRadius:16,padding:20,cursor:'pointer',
              outline:form.selectedPlan===p.id?`2px solid ${p.color}`:'none',transition:'all 0.15s'}}
              onClick={()=>setForm(f=>({...f,selectedPlan:p.id}))}>
              <div style={{fontSize:10,fontWeight:700,color:p.color,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>{p.name}</div>
              <div style={{fontSize:20,fontWeight:800,marginBottom:8}}>{p.price}</div>
              <div style={{fontSize:12,color:'#6b6b6b',lineHeight:1.6}}>{p.desc}</div>
            </div>
          ))}
        </div>

        <div style={{background:'rgba(212,168,83,0.06)',border:'1px solid rgba(212,168,83,0.15)',borderRadius:12,padding:'12px 16px',fontSize:12,color:'#a8a8a0',marginBottom:24,lineHeight:1.6}}>
          💳 Payment integration coming soon. For now you'll start on Basic and can manually set your plan from Users page. Contact us to arrange Pro/Advanced access.
        </div>

        <button onClick={completePlan}
          style={{width:'100%',padding:'14px',background:'linear-gradient(135deg,#d4a853,#a07830)',border:'none',borderRadius:11,fontSize:15,fontWeight:700,color:'#0c0c0c',cursor:'pointer'}}>
          Go to Dashboard →
        </button>
      </div></div>
    </>
  )

  return null
}
