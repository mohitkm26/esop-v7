import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { db } from '@/lib/firebase'
import { collection, addDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Layout from '@/components/layout/Layout'

export default function NewEmployee() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name:'', employeeCode:'', personalEmail:'', officialEmail:'',
    phone:'', department:'', designation:'', joinDate:'', exitDate:'', notes:''
  })

  useEffect(() => { if (!loading && !user) router.push('/login') }, [user, loading])

  async function save() {
    if (!form.name || !form.employeeCode) { alert('Name and employee code are required'); return }
    if (!['admin','editor'].includes(profile?.role||'')) { alert('Admin or Editor access required'); return }
    setSaving(true)
    const now = new Date().toISOString()
    const ref = await addDoc(collection(db,'employees'), {
      name: form.name.trim(),
      employeeCode: form.employeeCode.trim().toUpperCase(),
      personalEmail: form.personalEmail || null,
      officialEmail: form.officialEmail || null,
      phone: form.phone || null,
      department: form.department || null,
      designation: form.designation || null,
      joinDate: form.joinDate || null,
      exitDate: form.exitDate || null,
      notes: form.notes || null,
      createdBy: user!.uid, createdAt: now, updatedAt: now
    })
    router.push(`/employees/${ref.id}`)
  }

  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) =>
    setForm(f => ({...f, [k]: e.target.value}))

  if (loading || !profile) return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>

  return (
    <Layout>
      <div className="p-8 max-w-2xl">
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="page-title">New Employee</h1>
            <p className="text-muted text-sm mt-1">Add an employee to assign ESOP grants</p>
          </div>
          <button onClick={()=>router.back()} className="btn btn-ghost btn-sm">← Back</button>
        </div>

        <div className="card mb-5">
          <h2 className="section-title mb-4">Basic Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="label">Full Name *</label><input className="input" placeholder="Priya Sharma" value={form.name} onChange={upd('name')}/></div>
            <div><label className="label">Employee Code *</label><input className="input" placeholder="XIN001" value={form.employeeCode} onChange={upd('employeeCode')}/></div>
            <div><label className="label">Designation</label><input className="input" placeholder="Software Engineer" value={form.designation} onChange={upd('designation')}/></div>
            <div><label className="label">Department</label><input className="input" placeholder="Engineering" value={form.department} onChange={upd('department')}/></div>
            <div><label className="label">Join Date</label><input type="date" className="input" value={form.joinDate} onChange={upd('joinDate')}/></div>
          </div>
        </div>

        <div className="card mb-5">
          <h2 className="section-title mb-4">Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Personal Email</label><input type="email" className="input" value={form.personalEmail} onChange={upd('personalEmail')}/></div>
            <div><label className="label">Official Email</label><input type="email" className="input" value={form.officialEmail} onChange={upd('officialEmail')}/></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={upd('phone')}/></div>
            <div><label className="label">Exit Date (if applicable)</label><input type="date" className="input" value={form.exitDate} onChange={upd('exitDate')}/></div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="btn btn-success">
            {saving ? '⏳ Saving...' : '💾 Add Employee'}
          </button>
          <button onClick={()=>router.back()} className="btn btn-ghost">Cancel</button>
        </div>
      </div>
    </Layout>
  )
}
