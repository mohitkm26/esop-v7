import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { auth } from '@/lib/firebase'
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth'
import { useAuth } from '@/lib/auth-context'
import Head from 'next/head'
import Link from 'next/link'

export default function Login() {
  const { user, profile, loading, blocked } = useAuth()
  const router = useRouter()
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.role === 'employee') router.replace('/employee-portal')
      else router.replace('/dashboard')
    }
  }, [user, profile, loading])

  async function signIn() {
    setSigning(true)
    try { await signInWithPopup(auth, new GoogleAuthProvider()) }
    catch (e: any) { if (e.code !== 'auth/popup-closed-by-user') console.error(e) }
    setSigning(false)
  }

  if (loading) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  return (
    <>
      <Head>
        <title>Sign In — ESOP Manager</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{ minHeight:'100vh', background:'#0c0c0c', display:'flex', fontFamily:"'DM Sans',system-ui", WebkitFontSmoothing:'antialiased' as any, color:'#f5f0e8' }}>
        {/* Left */}
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
          <div style={{ width:'100%', maxWidth:380 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:40 }}>
              <div style={{ width:32, height:32, borderRadius:9, background:'linear-gradient(135deg,#d4a853,#a07830)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, color:'#0c0c0c' }}>E</div>
              <span style={{ fontWeight:700, fontSize:16 }}>ESOP Manager</span>
            </div>

            <h1 style={{ fontSize:26, fontWeight:800, letterSpacing:'-0.03em', marginBottom:6 }}>Welcome back</h1>
            <p style={{ fontSize:13, color:'#6b6b6b', marginBottom:28, lineHeight:1.6 }}>
              Sign in with your Google account to access the HR dashboard.
            </p>

            {blocked && (
              <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', borderRadius:12, padding:'14px 16px', marginBottom:20, fontSize:13, color:'#f87171', lineHeight:1.6 }}>
                <strong>Access denied.</strong> Your email is not authorized for this app. Please ask your HR admin to invite you.
              </div>
            )}

            <button onClick={signIn} disabled={signing}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'13px 16px', background:'#fff', borderRadius:11, border:'none', fontSize:14, fontWeight:700, color:'#000', cursor:'pointer', opacity:signing?0.7:1 }}>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.84-1.57 2.4v2h2.54c1.5-1.38 2.36-3.4 2.36-5.76 0-.55-.05-1.09-.1-1.64z"/>
                <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.54-1.97c-.72.48-1.64.77-2.76.77-2.12 0-3.92-1.43-4.56-3.36H1.8v2.03C3.12 15.45 5.88 17 8.98 17z"/>
                <path fill="#FBBC04" d="M4.42 10.5c-.16-.48-.25-.99-.25-1.5s.09-1.02.25-1.5V5.47H1.8A8.01 8.01 0 0 0 1 9c0 1.29.31 2.51.8 3.53l2.62-2.03z"/>
                <path fill="#EA4335" d="M8.98 3.58c1.19 0 2.26.41 3.1 1.22l2.32-2.32C12.95 1.19 11.14.5 8.98.5 5.88.5 3.12 2.05 1.8 4.47L4.42 6.5C5.06 4.57 6.86 3.58 8.98 3.58z"/>
              </svg>
              {signing ? 'Signing in...' : 'Continue with Google'}
            </button>

            <div style={{ marginTop:20, padding:'12px 14px', background:'#141414', border:'1px solid #1c1c1c', borderRadius:10, fontSize:11, color:'#6b6b6b', lineHeight:1.7 }}>
              🔒 <strong style={{color:'#a8a8a0'}}>Invitation-only access.</strong> Only employees and team members added by your HR admin can sign in.
            </div>

            <p style={{ fontSize:11, color:'#3a3a3a', textAlign:'center', marginTop:20 }}>
              Employee? <Link href="/employee-portal" style={{ color:'#d4a853' }}>Use Employee Portal →</Link>
            </p>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width:400, background:'#0f0f0f', borderLeft:'1px solid #1c1c1c', display:'flex', flexDirection:'column', justifyContent:'center', padding:48 }}>
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#d4a853', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>What's included</div>
            {[['◈','Dashboard with vesting overview'],['◧','Grant letters + email delivery'],['◆','Fair value history + IndAS cost'],['⊡','Secure employee self-service portal'],['↑','Bulk CSV import for grants & employees']].map(([icon,text]) => (
              <div key={text as string} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <div style={{ width:26, height:26, borderRadius:7, background:'rgba(212,168,83,0.08)', border:'1px solid rgba(212,168,83,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#d4a853', flexShrink:0 }}>{icon}</div>
                <span style={{ fontSize:13, color:'#a8a8a0' }}>{text as string}</span>
              </div>
            ))}
          </div>
          <div style={{ background:'#141414', border:'1px solid rgba(212,168,83,0.15)', borderRadius:12, padding:14 }}>
            <div style={{ fontSize:11, color:'#6b6b6b', marginBottom:4 }}>Multi-tenant &amp; data-safe</div>
            <div style={{ fontSize:12, color:'#a8a8a0', lineHeight:1.6 }}>Each company's data is isolated. Re-deploying never touches Firestore — all records are always preserved.</div>
          </div>
        </div>
      </div>
    </>
  )
}
