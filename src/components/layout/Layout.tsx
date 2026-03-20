import { ReactNode, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/lib/auth-context'
import { usePlan, PLAN_LABELS } from '@/lib/plan-context'
import { auth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'

const NAV = [
  { href:'/dashboard',  icon:'◈',  label:'Dashboard' },
  { href:'/employees',  icon:'⊡',  label:'Employees' },
  { href:'/grants',     icon:'⊟',  label:'Grants' },
  { href:'/upload',     icon:'⊕',  label:'Upload' },
  { href:'/valuation',  icon:'◆',  label:'Valuation',  gate:'pro' },
  { href:'/esop-cost',  icon:'∑',  label:'ESOP Cost',  gate:'advanced' },
]
const ADMIN_NAV = [
  { href:'/settings', icon:'⊙', label:'Settings' },
  { href:'/users',    icon:'⊗', label:'Users' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { profile }     = useAuth()
  const { plan }        = usePlan()
  const router          = useRouter()
  const [open, setOpen] = useState(false)
  const isAdmin = profile?.role === 'admin'
  const planColor = plan === 'advanced' ? '#e8c27a' : plan === 'pro' ? '#d4a853' : '#6b6b6b'

  const Sidebar = () => (
    <aside className="sidebar" style={{ width:216, display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ padding:'18px 14px 14px', borderBottom:'1px solid #1c1c1c' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#d4a853,#a07830)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#0c0c0c', flexShrink:0 }}>E</div>
          <div>
            <div style={{ fontWeight:700, fontSize:13.5, color:'#f5f0e8' }}>ESOP Manager</div>
            <div style={{ fontSize:9, marginTop:1, textTransform:'uppercase', letterSpacing:'0.07em', color:planColor }}>{PLAN_LABELS[plan]}</div>
          </div>
        </div>
      </div>

      <nav style={{ flex:1, padding:'8px 6px', overflowY:'auto' }}>
        <div className="sidebar-section">Navigation</div>
        {NAV.map(n => {
          const active = router.pathname === n.href || router.pathname.startsWith(n.href+'/')
          const locked = n.gate === 'advanced' ? plan !== 'advanced' : n.gate === 'pro' ? plan === 'basic' : false
          return (
            <Link key={n.href} href={locked ? '/pricing' : n.href}
              className={`sidebar-link${active?' active':''}`} style={locked?{opacity:0.45}:{}}>
              <span style={{ fontStyle:'normal', fontSize:12, width:16, textAlign:'center', flexShrink:0 }} className={active?'sidebar-icon':''}>{n.icon}</span>
              <span>{n.label}</span>
              {locked && <span style={{ marginLeft:'auto', fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:4, background:'rgba(212,168,83,0.1)', color:'#d4a853', border:'1px solid rgba(212,168,83,0.2)', textTransform:'uppercase', letterSpacing:'0.06em' }}>PRO</span>}
            </Link>
          )
        })}
        {isAdmin && <>
          <div className="sidebar-section" style={{ marginTop:10 }}>Admin</div>
          {ADMIN_NAV.map(n => (
            <Link key={n.href} href={n.href} className={`sidebar-link${router.pathname===n.href?' active':''}`}>
              <span style={{ fontStyle:'normal', fontSize:12, width:16, textAlign:'center', flexShrink:0 }}>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          ))}
        </>}
      </nav>

      <div style={{ borderTop:'1px solid #1c1c1c', padding:'8px 6px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:9, marginBottom:6 }}>
          {profile?.photo
            ? <img src={profile.photo} style={{ width:26, height:26, borderRadius:'50%', flexShrink:0 }} alt=""/>
            : <div style={{ width:26, height:26, borderRadius:'50%', background:'#242424', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#d4a853', flexShrink:0 }}>{profile?.name?.[0]?.toUpperCase()}</div>}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#f5f0e8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile?.name}</div>
            <div style={{ fontSize:9, color:'#6b6b6b', textTransform:'uppercase', letterSpacing:'0.06em' }}>{profile?.role}</div>
          </div>
          <button onClick={()=>signOut(auth)} style={{ background:'none', border:'none', color:'#6b6b6b', cursor:'pointer', fontSize:13, padding:'2px 4px' }}>→</button>
        </div>
        {plan==='basic' && (
          <Link href="/pricing" style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, padding:'7px 12px', borderRadius:9, fontSize:11.5, fontWeight:700, background:'rgba(212,168,83,0.1)', border:'1px solid rgba(212,168,83,0.2)', color:'#d4a853', textDecoration:'none' }}>◆ Upgrade Plan</Link>
        )}
      </div>
    </aside>
  )

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#0c0c0c' }}>
      <div style={{ width:216, flexShrink:0, position:'fixed', top:0, left:0, bottom:0, zIndex:40 }}><Sidebar/></div>
      <button onClick={()=>setOpen(o=>!o)} style={{ position:'fixed', top:12, left:12, zIndex:50, background:'#141414', border:'1px solid #242424', borderRadius:8, padding:'5px 9px', color:'#f5f0e8', fontSize:13, cursor:'pointer', display:'none' }}>
        {open?'✕':'☰'}
      </button>
      {open && <>
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:30 }} onClick={()=>setOpen(false)}/>
        <div style={{ position:'fixed', top:0, left:0, bottom:0, width:216, zIndex:40 }}><Sidebar/></div>
      </>}
      <main style={{ flex:1, minHeight:'100vh', background:'#0c0c0c', marginLeft:216 }}>{children}</main>
    </div>
  )
}
