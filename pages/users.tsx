import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, getDocs, doc, updateDoc, getDoc, setDoc, addDoc, query, where, deleteDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import { usePlan, PLAN_LABELS, Plan } from '@/lib/plan-context'
import Layout from '@/components/layout/Layout'

const ROLES = ['admin','editor','viewer'] as const
type Role = typeof ROLES[number]

const ROLE_DESC: Record<string,string> = {
  admin:  'Full access — data, users, settings, plan',
  editor: 'Add/edit grants, employees, upload, valuations',
  viewer: 'Read-only — view data, no edits',
}
const ROLE_COLORS: Record<string,string> = { admin:'#f87171', editor:'#d4a853', viewer:'#60a5fa' }

export default function UsersPage() {
  const { user, profile, loading } = useAuth()
  const { plan, companyId } = usePlan()
  const router = useRouter()
  const [users, setUsers]       = useState<any[]>([])
  const [invites, setInvites]   = useState<any[]>([])
  const [busy, setBusy]         = useState(true)
  const [saving, setSaving]     = useState<string|null>(null)
  const [planBusy, setPlanBusy] = useState(false)
  const [planMsg, setPlanMsg]   = useState('')
  // Invite form
  const [invEmail, setInvEmail] = useState('')
  const [invRole, setInvRole]   = useState<Role>('viewer')
  const [invSaving, setInvSaving] = useState(false)
  const [invMsg, setInvMsg]     = useState('')

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!user || !profile || loading) return
    if (profile.role !== 'admin') { router.push('/dashboard'); return }
    load()
  }, [user, profile, loading])

  async function load() {
    setBusy(true)
    const [uSnap, iSnap] = await Promise.all([
      getDocs(collection(db,'profiles')),
      getDocs(collection(db,'invites')),
    ])
    setUsers(uSnap.docs.map(d=>({id:d.id,...d.data()})))
    setInvites(iSnap.docs.map(d=>({id:d.id,...d.data()})))
    setBusy(false)
  }

  async function changeRole(uid: string, role: Role) {
    setSaving(uid)
    await updateDoc(doc(db,'profiles',uid), { role })
    setUsers(u => u.map(x => x.uid===uid ? {...x,role} : x))
    setSaving(null)
  }

  async function deactivate(uid: string) {
    if (!confirm('Deactivate this user? They will not be able to sign in.')) return
    await updateDoc(doc(db,'profiles',uid), { isActive:false })
    setUsers(u => u.map(x => x.uid===uid ? {...x,isActive:false} : x))
  }

  async function reactivate(uid: string) {
    await updateDoc(doc(db,'profiles',uid), { isActive:true })
    setUsers(u => u.map(x => x.uid===uid ? {...x,isActive:true} : x))
  }

  async function sendInvite() {
    const email = invEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { setInvMsg('❌ Enter a valid email'); return }
    setInvSaving(true); setInvMsg('')
    try {
      // Check not already invited or registered
      const existing = await getDocs(query(collection(db,'invites'),where('email','==',email)))
      const existUser = await getDocs(query(collection(db,'profiles'),where('email','==',email)))
      if (!existing.empty || !existUser.empty) { setInvMsg('❌ This email already has access or a pending invite'); setInvSaving(false); return }

      await addDoc(collection(db,'invites'),{
        email, role:invRole, invitedBy:user!.email,
        createdAt:new Date().toISOString(), used:false
      })
      setInvites(i=>[...i,{email,role:invRole,used:false}])
      setInvMsg(`✅ Invite created for ${email}. They can now sign in at ${window.location.origin}/login`)
      setInvEmail('')
    } catch(e:any) { setInvMsg('❌ '+e.message) }
    setInvSaving(false)
  }

  async function revokeInvite(inviteId: string) {
    await deleteDoc(doc(db,'invites',inviteId))
    setInvites(i=>i.filter(x=>x.id!==inviteId))
  }

  async function setPlanLevel(newPlan: Plan) {
    if (!companyId) { setPlanMsg('❌ No companyId found — refresh the page.'); return }
    setPlanBusy(true); setPlanMsg('')
    try {
      const ref = doc(db,'companies',companyId)
      const snap = await getDoc(ref)
      const expiry = new Date(Date.now()+365*24*60*60*1000).toISOString().split('T')[0]
      if (!snap.exists()) {
        await setDoc(ref,{companyId,ownerId:user!.uid,plan:newPlan,planExpiry:expiry,createdAt:new Date().toISOString()})
      } else {
        await updateDoc(ref,{plan:newPlan,planExpiry:expiry,updatedAt:new Date().toISOString()})
      }
      setPlanMsg(`✅ Plan set to ${PLAN_LABELS[newPlan]}. Refresh the page to unlock features.`)
    } catch(e:any) { setPlanMsg('❌ '+e.message) }
    setPlanBusy(false)
  }

  if (loading || busy) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  const S: Record<string,any> = {
    card: {background:'#141414',border:'1px solid #1c1c1c',borderRadius:16,padding:24,marginBottom:16},
    th:   {padding:'10px 14px',fontSize:11,fontWeight:700,color:'#6b6b6b',textTransform:'uppercase' as const,letterSpacing:'0.06em',borderBottom:'1px solid #1c1c1c',textAlign:'left' as const},
    td:   {padding:'12px 14px',fontSize:13,borderBottom:'1px solid #0f0f0f',verticalAlign:'middle' as const},
    input:{background:'#0c0c0c',border:'1px solid #1c1c1c',borderRadius:8,padding:'9px 12px',fontSize:13,color:'#f5f0e8',outline:'none',width:'100%'},
    sel:  {background:'#0c0c0c',border:'1px solid #1c1c1c',borderRadius:8,padding:'9px 12px',fontSize:13,color:'#f5f0e8',outline:'none'},
  }

  return (
    <Layout>
      <div className="p-8" style={{maxWidth:760}}>
        <div className="mb-7">
          <h1 className="page-title">Users & Access</h1>
          <p className="text-muted text-sm mt-1">Invite team members, manage roles, and set the company plan</p>
        </div>

        {/* Role legend */}
        <div style={S.card}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>
            {ROLES.map(r=>(
              <div key={r}>
                <div style={{fontSize:12,fontWeight:700,marginBottom:4,color:ROLE_COLORS[r]}}>{r.charAt(0).toUpperCase()+r.slice(1)}</div>
                <div style={{fontSize:11,color:'#6b6b6b',lineHeight:1.6}}>{ROLE_DESC[r]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite new user */}
        <div style={S.card}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:14}}>Invite a team member</div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div style={{flex:1,minWidth:200}}>
              <div style={{fontSize:11,color:'#6b6b6b',marginBottom:5}}>EMAIL ADDRESS</div>
              <input style={S.input} placeholder="colleague@company.com" value={invEmail} onChange={e=>setInvEmail(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&sendInvite()}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'#6b6b6b',marginBottom:5}}>ROLE</div>
              <select style={S.sel} value={invRole} onChange={e=>setInvRole(e.target.value as Role)}>
                <option value="admin">Admin</option>
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <button onClick={sendInvite} disabled={invSaving} className="btn btn-primary btn-sm">
              {invSaving?'Inviting...':'+ Send Invite'}
            </button>
          </div>
          {invMsg&&<div style={{marginTop:10,fontSize:12,color:invMsg.startsWith('✅')?'#4ade80':'#f87171'}}>{invMsg}</div>}
          <div style={{marginTop:12,fontSize:11,color:'#6b6b6b',lineHeight:1.7}}>
            🔒 <strong style={{color:'#a8a8a0'}}>Invitation-only.</strong> Only invited emails (or employees with their email in the system) can sign in. All others are blocked automatically.
          </div>
        </div>

        {/* Pending invites */}
        {invites.filter(i=>!i.used).length > 0 && (
          <div style={S.card}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Pending Invites</div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr>
                <th style={S.th}>Email</th><th style={S.th}>Role</th><th style={S.th}>Invited by</th><th style={S.th}/>
              </tr></thead>
              <tbody>
                {invites.filter(i=>!i.used).map(inv=>(
                  <tr key={inv.id}>
                    <td style={S.td}>{inv.email}</td>
                    <td style={S.td}><span style={{fontSize:11,fontWeight:700,color:ROLE_COLORS[inv.role]||'#6b6b6b',textTransform:'capitalize'}}>{inv.role}</span></td>
                    <td style={{...S.td,fontSize:11,color:'#6b6b6b'}}>{inv.invitedBy}</td>
                    <td style={S.td}><button onClick={()=>revokeInvite(inv.id)} style={{fontSize:11,color:'#f87171',background:'none',border:'none',cursor:'pointer'}}>Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Active users */}
        <div style={S.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:12}}>Active Users ({users.filter(u=>u.isActive!==false).length})</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>
              <th style={S.th}>User</th><th style={S.th}>Email</th><th style={S.th}>Role</th><th style={S.th}>Change Role</th><th style={S.th}>Status</th>
            </tr></thead>
            <tbody>
              {users.map(u=>{
                const isMe = u.uid === user?.uid
                const active = u.isActive !== false
                return (
                  <tr key={u.id} style={{opacity:active?1:0.45}}>
                    <td style={S.td}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {u.photo&&<img src={u.photo} style={{width:24,height:24,borderRadius:'50%'}} alt=""/>}
                        <span style={{fontWeight:600}}>{u.name||u.email}</span>
                      </div>
                    </td>
                    <td style={{...S.td,fontSize:11,fontFamily:'monospace',color:'#6b6b6b'}}>{u.email}</td>
                    <td style={S.td}>
                      <span style={{fontSize:11,fontWeight:700,color:ROLE_COLORS[u.role]||'#6b6b6b',textTransform:'capitalize',background:'rgba(0,0,0,0.3)',padding:'2px 8px',borderRadius:5}}>
                        {u.role}
                      </span>
                    </td>
                    <td style={S.td}>
                      {!isMe && active ? (
                        <div style={{display:'flex',gap:5}}>
                          {ROLES.map(r=>(
                            <button key={r} disabled={u.role===r||saving===u.uid} onClick={()=>changeRole(u.uid,r)}
                              style={{fontSize:11,padding:'3px 8px',borderRadius:5,border:'1px solid',cursor:u.role===r?'default':'pointer',
                                background:u.role===r?'rgba(212,168,83,0.15)':'transparent',
                                borderColor:u.role===r?'rgba(212,168,83,0.3)':'#2a2a2a',
                                color:u.role===r?'#d4a853':'#6b6b6b',textTransform:'capitalize'}}>
                              {saving===u.uid?'...':r}
                            </button>
                          ))}
                        </div>
                      ) : isMe ? <span style={{fontSize:11,color:'#6b6b6b'}}>You</span> : null}
                    </td>
                    <td style={S.td}>
                      {!isMe && (
                        active
                          ? <button onClick={()=>deactivate(u.uid)} style={{fontSize:11,color:'#f87171',background:'none',border:'none',cursor:'pointer'}}>Deactivate</button>
                          : <button onClick={()=>reactivate(u.uid)} style={{fontSize:11,color:'#4ade80',background:'none',border:'none',cursor:'pointer'}}>Reactivate</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Plan management */}
        <div style={S.card}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:6}}>Plan Management</div>
          <div style={{fontSize:12,color:'#6b6b6b',marginBottom:14,lineHeight:1.6}}>
            Current: <strong style={{color:'#d4a853'}}>{PLAN_LABELS[plan]}</strong>
            {' · '}ID: <code style={{fontSize:10,background:'#0c0c0c',padding:'1px 6px',borderRadius:4,color:'#6b6b6b'}}>{companyId||'loading...'}</code>
          </div>
          <div style={{fontSize:11,color:'#6b6b6b',marginBottom:14}}>
            Set your plan manually (Razorpay integration adds payments). Plan change takes effect on refresh.
          </div>
          <div style={{display:'flex',gap:8}}>
            {(['basic','pro','advanced'] as Plan[]).map(p=>(
              <button key={p} onClick={()=>setPlanLevel(p)} disabled={planBusy||plan===p}
                style={{padding:'7px 14px',borderRadius:8,border:'1px solid',cursor:plan===p?'default':'pointer',fontSize:12,fontWeight:600,
                  background:plan===p?'rgba(212,168,83,0.12)':'transparent',
                  borderColor:plan===p?'rgba(212,168,83,0.3)':'#2a2a2a',
                  color:plan===p?'#d4a853':'#6b6b6b'}}>
                {planBusy?'...':PLAN_LABELS[p]}
              </button>
            ))}
          </div>
          {planMsg&&<div style={{marginTop:10,fontSize:12,color:planMsg.startsWith('✅')?'#4ade80':'#f87171'}}>{planMsg}</div>}
        </div>
      </div>
    </Layout>
  )
}
