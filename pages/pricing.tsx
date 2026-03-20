import Link from 'next/link'
import Head from 'next/head'

const TIERS = [
  {
    name: 'Basic', price: 'Free', sub: 'Forever', color: '#6b6b6b', highlight: false,
    cta: 'Get started free', href: '/login',
    features: [
      '✓ Up to 50 employees',
      '✓ Grant management',
      '✓ Vesting schedules',
      '✓ Grant letter generation',
      '✓ CSV bulk import',
      '— Email letters',
      '— Valuation tracking',
      '— Employee portal',
      '— ESOP cost (IndAS/IFRS)',
      '— eSign integration',
    ],
  },
  {
    name: 'Pro', price: '₹999', sub: '/year · ~₹83/month', color: '#d4a853', highlight: true,
    badge: 'Most Popular',
    cta: 'Start Pro', href: '/login',
    features: [
      '✓ Unlimited employees',
      '✓ Grant management',
      '✓ Vesting schedules',
      '✓ Grant letter generation',
      '✓ CSV bulk import',
      '✓ Email letters to employees',
      '✓ Valuation history + docs',
      '✓ Secure employee portal',
      '— ESOP cost (IndAS/IFRS)',
      '— eSign integration',
    ],
  },
  {
    name: 'Advanced', price: '₹4,999', sub: '/year · ~₹417/month', color: '#e8c27a', highlight: false,
    cta: 'Start Advanced', href: '/login',
    features: [
      '✓ Unlimited employees',
      '✓ Grant management',
      '✓ Vesting schedules',
      '✓ Grant letter generation',
      '✓ CSV bulk import',
      '✓ Email letters to employees',
      '✓ Valuation history + docs',
      '✓ Secure employee portal',
      '✓ ESOP cost (IndAS 102 / IFRS 2 / Indian GAAP)',
      '✓ eSign via DocuSign / Zoho Sign',
    ],
  },
]

export default function PricingPage() {
  return (
    <>
      <Head>
        <title>ESOP Manager — Pricing</title>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{ background:'#0c0c0c', minHeight:'100vh', fontFamily:"'DM Sans', system-ui, sans-serif", color:'#f5f0e8', WebkitFontSmoothing:'antialiased' }}>

        {/* Nav */}
        <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 32px', height:60, borderBottom:'1px solid #1c1c1c' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:8, background:'linear-gradient(135deg,#d4a853,#a07830)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:'#0c0c0c' }}>E</div>
            <span style={{ fontWeight:700, fontSize:15, letterSpacing:'-0.01em' }}>ESOP Manager</span>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <Link href="/login" style={{ padding:'7px 16px', border:'1px solid #242424', borderRadius:9, fontSize:13, fontWeight:600, color:'#f5f0e8', background:'#141414', textDecoration:'none' }}>Sign In</Link>
            <Link href="/login" style={{ padding:'7px 16px', background:'#d4a853', borderRadius:9, fontSize:13, fontWeight:700, color:'#0c0c0c', textDecoration:'none' }}>Start Free</Link>
          </div>
        </nav>

        {/* Hero */}
        <section style={{ textAlign:'center', padding:'72px 24px 56px' }}>
          <div style={{ display:'inline-block', background:'rgba(212,168,83,0.1)', border:'1px solid rgba(212,168,83,0.2)', borderRadius:99, padding:'4px 16px', fontSize:11, color:'#d4a853', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:24 }}>
            IndAS 102 · IFRS 2 · Indian GAAP · Razorpay-ready
          </div>
          <h1 style={{ fontSize:'clamp(34px,5.5vw,60px)', fontWeight:800, letterSpacing:'-0.035em', lineHeight:1.08, margin:'0 0 18px', color:'#f5f0e8' }}>
            ESOP management,<br/>
            <span style={{ background:'linear-gradient(90deg,#d4a853,#e8c27a)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>finally done right</span>
          </h1>
          <p style={{ fontSize:16, color:'#6b6b6b', maxWidth:460, margin:'0 auto 36px', lineHeight:1.65 }}>
            Grant letters, vesting schedules, valuation history, and IndAS-compliant cost calculations — all in one place. Built for Indian startups.
          </p>
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <Link href="/login" style={{ padding:'12px 28px', background:'#d4a853', borderRadius:11, fontSize:14, fontWeight:700, color:'#0c0c0c', textDecoration:'none' }}>Start for free →</Link>
            <a href="#pricing" style={{ padding:'12px 28px', border:'1px solid #242424', background:'#141414', borderRadius:11, fontSize:14, fontWeight:600, color:'#f5f0e8', textDecoration:'none' }}>See pricing</a>
          </div>
        </section>

        {/* Stats bar */}
        <div style={{ borderTop:'1px solid #1c1c1c', borderBottom:'1px solid #1c1c1c', display:'flex', flexWrap:'wrap', justifyContent:'center' }}>
          {[['IndAS 102','Compliant'],['IFRS 2','Supported'],['₹999/yr','Pro plan'],['eSign','Built-in (Adv)']].map(([v,l],i) => (
            <div key={i} style={{ padding:'22px 40px', textAlign:'center', borderRight:'1px solid #1c1c1c' }}>
              <div style={{ fontSize:20, fontWeight:800, color:'#d4a853', letterSpacing:'-0.02em' }}>{v}</div>
              <div style={{ fontSize:10, color:'#6b6b6b', marginTop:4, textTransform:'uppercase', letterSpacing:'0.08em' }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Pricing cards */}
        <section id="pricing" style={{ padding:'72px 24px 80px', maxWidth:960, margin:'0 auto' }}>
          <h2 style={{ textAlign:'center', fontSize:30, fontWeight:800, letterSpacing:'-0.03em', marginBottom:8 }}>Simple pricing</h2>
          <p style={{ textAlign:'center', color:'#6b6b6b', fontSize:14, marginBottom:48 }}>Start free. Upgrade when your team grows.</p>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(265px,1fr))', gap:16 }}>
            {TIERS.map(t => (
              <div key={t.name} style={{
                background: t.highlight ? '#141414' : '#0f0f0f',
                border: t.highlight ? `1px solid rgba(212,168,83,0.35)` : '1px solid #1c1c1c',
                borderRadius:20, padding:'28px 24px', position:'relative',
                boxShadow: t.highlight ? '0 0 40px rgba(212,168,83,0.06)' : 'none',
              }}>
                {t.badge && (
                  <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:'#d4a853', color:'#0c0c0c', fontSize:9, fontWeight:800, padding:'3px 12px', borderRadius:99, letterSpacing:'0.08em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
                    {t.badge}
                  </div>
                )}
                <div style={{ fontSize:11, fontWeight:700, color:t.color, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>{t.name}</div>
                <div style={{ fontSize:36, fontWeight:800, color:'#f5f0e8', letterSpacing:'-0.035em', lineHeight:1 }}>{t.price}</div>
                <div style={{ fontSize:12, color:'#6b6b6b', marginTop:4, marginBottom:22 }}>{t.sub}</div>
                <Link href={t.href} style={{
                  display:'block', textAlign:'center', padding:'10px', borderRadius:10,
                  fontSize:13, fontWeight:700, textDecoration:'none', marginBottom:22,
                  ...(t.highlight
                    ? { background:'#d4a853', color:'#0c0c0c' }
                    : { background:'#1c1c1c', border:'1px solid #2e2e2e', color:'#f5f0e8' })
                }}>{t.cta}</Link>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {t.features.map((f,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color: f.startsWith('✓') ? '#a8a8a0' : '#3a3a3a' }}>
                      <span style={{ fontSize:11, flexShrink:0, color: f.startsWith('✓') ? '#d4a853' : '#2e2e2e' }}>
                        {f.startsWith('✓') ? '✦' : '–'}
                      </span>
                      {f.slice(2)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ strip */}
        <section style={{ borderTop:'1px solid #1c1c1c', padding:'56px 24px', maxWidth:700, margin:'0 auto' }}>
          <h3 style={{ fontSize:22, fontWeight:700, letterSpacing:'-0.02em', marginBottom:32, textAlign:'center' }}>Common questions</h3>
          {[
            ['Will upgrading my plan affect my data?', 'Never. Your data lives in Firestore. Upgrading only unlocks features — it never touches grants, employees, or any records.'],
            ['Can I test before committing?', 'Yes. Basic plan is free forever. You can explore the app fully before deciding to upgrade.'],
            ['How does employee login work?', 'Employees sign in with their Google account. The app matches their email to their employee record — they only see their own grants.'],
            ['What accounting standards are supported?', 'Advanced plan includes IndAS 102, IFRS 2, and Indian GAAP (ICAI Guidance Note) — with year-wise P&L breakdown and disclosure notes.'],
          ].map(([q,a],i) => (
            <div key={i} style={{ borderBottom:'1px solid #1c1c1c', padding:'18px 0' }}>
              <div style={{ fontWeight:600, fontSize:14, marginBottom:6, color:'#f5f0e8' }}>{q}</div>
              <div style={{ fontSize:13, color:'#6b6b6b', lineHeight:1.65 }}>{a}</div>
            </div>
          ))}
        </section>

        <footer style={{ borderTop:'1px solid #1c1c1c', padding:'24px', textAlign:'center' }}>
          <p style={{ fontSize:12, color:'#2e2e2e' }}>© 2025 ESOP Manager · Built for Indian startups · Prices in INR</p>
        </footer>
      </div>
    </>
  )
}
