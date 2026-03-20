import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, collection, getDocs, updateDoc, query, where } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'

const DEFAULT: any = {
  companyName: 'Hamoroni',
  hrEmail: '',
  fromEmail: '',
  fromName: 'HR Team',
  emailSignature: 'Best regards,\nHR Team',
  triggers: {
    onVesting: true,
    onValuationChange: true,
    onGrantCreated: true,
    onExercise: false,
    onExit: false,
  },
  emailTemplates: {
    vesting:   'Dear {{name}},\n\nYour {{options}} ESOP options have vested today ({{date}}).\nCurrent fair value: ₹{{fairValue}}/option.\nYour total vested: {{totalVested}} options.\n\n{{signature}}',
    valuation: 'Dear {{name}},\n\nThe ESOP fair value has been updated to ₹{{fairValue}} per option effective {{date}}.\nYour vested options are now worth ₹{{vestedValue}}.\n\n{{signature}}',
    grant:     'Dear {{name}},\n\n{{options}} stock options have been granted to you (Grant: {{grantNumber}}) on {{date}}.\nPlease find your grant letter attached.\n\n{{signature}}',
    exercise:  'Dear {{name}},\n\nYour exercise of {{options}} options has been recorded on {{date}}.\n\n{{signature}}',
    exit:      'Dear {{name}},\n\nYour exit date is recorded as {{date}}. Options vesting after this date will lapse.\nPlease contact HR for queries.\n\n{{signature}}',
  }
}

export default function SettingsPage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [s, setS]       = useState<any>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [tab, setTab]       = useState<'general'|'triggers'|'templates'|'roles'>('general')
  const [secret, setSecret] = useState('')
  const [claimMsg, setClaimMsg] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'settings', 'main')).then(snap => {
      if (snap.exists()) setS({ ...DEFAULT, ...snap.data() })
    })
  }, [user])

  async function save() {
    setSaving(true)
    await setDoc(doc(db, 'settings', 'main'), s)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  function upd(path: string, val: any) {
    setS((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev))
      const keys = path.split('.'); let cur = next
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]]
      cur[keys[keys.length - 1]] = val; return next
    })
  }

  // Admin claim via client-side secret check
  async function claimAdmin() {
    if (!user) return
    const expectedSecret = process.env.NEXT_PUBLIC_ADMIN_SECRET || 'hamoroni2024'
    if (secret !== expectedSecret) { setClaimMsg('❌ Wrong secret'); return }
    setClaimBusy(true)
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { role: 'admin' })
      setClaimMsg('✅ You are now admin! Refresh the page to see full access.')
    } catch(e: any) { setClaimMsg('❌ Error: ' + e.message) }
    setClaimBusy(false)
  }

  if (loading) return null

  const isAdmin = profile?.role === 'admin'
  const canEdit = isAdmin

  return (
    <Layout>
      <div className="p-8 max-w-3xl">
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="text-muted text-sm mt-1">Company info, email triggers and templates</p>
          </div>
          {canEdit && (
            <button onClick={save} disabled={saving}
              className="btn btn-success">
              {saving ? '⏳ Saving...' : saved ? '✅ Saved!' : '💾 Save Settings'}
            </button>
          )}
        </div>

        {/* Admin claim panel — shows for non-admins */}
        {!isAdmin && (
          <div className="card mb-6 border border-warning/30 bg-warning/5">
            <div className="font-semibold text-warning mb-2">🔑 Claim Admin Access</div>
            <p className="text-xs text-muted mb-3">
              Not an admin yet? Enter the secret from your <code className="bg-surface2 px-1 rounded">.env.local</code> file
              (NEXT_PUBLIC_ADMIN_SECRET) to promote yourself.
            </p>
            <div className="flex gap-3">
              <input type="password" className="input flex-1" placeholder="Admin secret"
                value={secret} onChange={e => setSecret(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && claimAdmin()}/>
              <button onClick={claimAdmin} disabled={claimBusy || !secret} className="btn btn-warning">
                {claimBusy ? '...' : 'Claim Admin'}
              </button>
            </div>
            {claimMsg && <p className="text-sm mt-2 text-success">{claimMsg}</p>}
            <p className="text-xs text-muted mt-3">
              After claiming, refresh the page. Then go to <a href="/users" className="text-primary hover:underline">Users</a> to manage other people's roles.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['general','triggers','templates','roles'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-all border ${tab===t?'bg-primary/15 text-primary border-primary/30':'bg-surface text-muted border-border hover:text-white'}`}>
              {t === 'general' ? '⚙️ General' : t === 'triggers' ? '🔔 Email Triggers' : t === 'templates' ? '✉️ Templates' : '👥 Role Guide'}
            </button>
          ))}
        </div>

        {/* General */}
        {tab === 'general' && (
          <div className="card space-y-4">
            {[
              ['companyName','Company Name'],
              ['fromName','From Name (emails)'],
              ['fromEmail','From Email (must be verified in Resend)'],
              ['hrEmail','HR Email (receives copies)'],
            ].map(([k,l]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input className="input" disabled={!canEdit} value={s[k]||''} onChange={e => upd(k, e.target.value)}/>
              </div>
            ))}
            <div>
              <label className="label">Email Signature</label>
              <textarea className="input" rows={3} disabled={!canEdit}
                value={s.emailSignature||''} onChange={e => upd('emailSignature', e.target.value)}/>
            </div>
          </div>
        )}

        {/* Triggers */}
        {tab === 'triggers' && (
          <div className="card space-y-3">
            <p className="text-sm text-muted mb-3">Select which events automatically email employees.</p>
            {[
              ['triggers.onVesting',       '📅 When options vest'],
              ['triggers.onValuationChange','💰 When valuation is updated'],
              ['triggers.onGrantCreated',   '🎁 When a new grant is created'],
              ['triggers.onExercise',       '✅ When options are exercised'],
              ['triggers.onExit',           '🚪 When exit date is set'],
            ].map(([path, label]) => (
              <div key={path} className="flex items-center gap-3 p-3 bg-surface2 rounded-xl">
                <input type="checkbox" className="w-4 h-4 accent-primary cursor-pointer"
                  disabled={!canEdit}
                  checked={path.split('.').reduce((o: any, k) => o?.[k], s) || false}
                  onChange={e => upd(path, e.target.checked)}/>
                <span className="text-sm">{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Email templates */}
        {tab === 'templates' && (
          <div className="space-y-4">
            <div className="card text-xs text-muted">
              Variables: <code>{'{{name}} {{options}} {{date}} {{fairValue}} {{vestedValue}} {{totalVested}} {{grantNumber}} {{company}} {{signature}}'}</code>
            </div>
            {[
              ['emailTemplates.vesting',   '📅 Vesting'],
              ['emailTemplates.valuation', '💰 Valuation update'],
              ['emailTemplates.grant',     '🎁 New grant'],
              ['emailTemplates.exercise',  '✅ Exercise'],
              ['emailTemplates.exit',      '🚪 Exit'],
            ].map(([path, label]) => (
              <div key={path} className="card">
                <label className="label mb-2">{label}</label>
                <textarea className="input font-mono text-xs" rows={5}
                  disabled={!canEdit}
                  value={path.split('.').reduce((o: any, k) => o?.[k], s) || ''}
                  onChange={e => upd(path, e.target.value)}/>
              </div>
            ))}
          </div>
        )}

        {/* Role Guide */}
        {tab === 'roles' && (
          <div className="card space-y-4">
            <h2 className="section-title">Role Permissions Guide</h2>
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="bg-surface2">
                  <tr>
                    <th className="th">Feature</th>
                    <th className="th text-center">Admin</th>
                    <th className="th text-center">Editor</th>
                    <th className="th text-center">Viewer</th>
                    <th className="th text-center">Finance*</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['View Dashboard','✅','✅','✅','✅'],
                    ['View Grants & Vesting','✅','✅','✅','✅'],
                    ['Add/Edit Employees','✅','✅','❌','❌'],
                    ['Add/Edit Grants','✅','✅','❌','❌'],
                    ['Upload CSV/PDF data','✅','✅','❌','❌'],
                    ['Record Exercise','✅','✅','❌','❌'],
                    ['Generate Grant Letters','✅','✅','❌','❌'],
                    ['Add Valuation','✅','✅','❌','✅'],
                    ['View ESOP Cost','✅','✅','✅','✅'],
                    ['Settings / Email config','✅','❌','❌','❌'],
                    ['Manage User Roles','✅','❌','❌','❌'],
                    ['Delete Records','✅','❌','❌','❌'],
                  ].map(([feat,...perms]) => (
                    <tr key={feat}>
                      <td className="td">{feat}</td>
                      {perms.map((p,i) => <td key={i} className="td text-center">{p}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted">
              * Finance role = use <strong>Editor</strong> role and restrict via Firestore rules. Go to <a href="/users" className="text-primary hover:underline">Users</a> to assign roles.
            </p>
            <div className="bg-surface2 rounded-xl p-4 text-xs text-muted">
              <p className="font-semibold text-white mb-2">📋 Re-deploying won't affect your data</p>
              <p>Your data lives in Firestore (database) and Firebase Storage (files) — completely separate from the app code. 
              Re-deploying only updates the website files. Users, roles, grants, employees, valuations, and settings are all preserved.</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
