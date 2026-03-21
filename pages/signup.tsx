import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { FormEvent, useMemo, useState } from 'react'
import { firebaseConfigError } from '@/lib/firebase'
import { signupCompanyAdmin } from '@/lib/signup'

type FormState = {
  companyName: string
  pan: string
  gstn: string
  address: string
  email: string
  password: string
}

const initialState: FormState = {
  companyName: '',
  pan: '',
  gstn: '',
  address: '',
  email: '',
  password: '',
}

export default function SignupPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(initialState)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const formDisabled = useMemo(() => submitting || !!firebaseConfigError, [submitting])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }))
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (Object.values(form).some(value => !value.trim())) {
      setError('Please fill in all fields.')
      return
    }

    setSubmitting(true)
    try {
      await signupCompanyAdmin(form)
      setForm(initialState)
      setSuccess('Verify your email before login')
      setTimeout(() => router.push('/login'), 1500)
    } catch (err: any) {
      console.error(err)
      setError(err?.message || 'Signup failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #2a2a2a',
    background: '#111111',
    color: '#f5f0e8',
    fontSize: 14,
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: 6,
    fontSize: 12,
    color: '#a8a8a0',
    fontWeight: 600,
  }

  return (
    <>
      <Head>
        <title>Sign Up — ESOP Manager</title>
      </Head>
      <div style={{ minHeight: '100vh', background: '#0c0c0c', color: '#f5f0e8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans',system-ui" }}>
        <div style={{ width: '100%', maxWidth: 520, background: '#141414', border: '1px solid #1c1c1c', borderRadius: 18, padding: 28 }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Create your company account</div>
            <p style={{ margin: 0, color: '#8a8a84', fontSize: 14, lineHeight: 1.6 }}>
              Register your company, create the company admin user, and verify your email before logging in.
            </p>
          </div>

          {firebaseConfigError && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24', fontSize: 13, lineHeight: 1.6 }}>
              <strong>Firebase setup needed.</strong> {firebaseConfigError}
            </div>
          )}

          {error && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: 13, lineHeight: 1.6 }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80', fontSize: 13, lineHeight: 1.6 }}>
              {success}
            </div>
          )}

          <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={labelStyle} htmlFor="companyName">Company Name</label>
              <input id="companyName" value={form.companyName} onChange={e => update('companyName', e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle} htmlFor="pan">PAN</label>
              <input id="pan" value={form.pan} onChange={e => update('pan', e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle} htmlFor="gstn">GSTN</label>
              <input id="gstn" value={form.gstn} onChange={e => update('gstn', e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle} htmlFor="address">Address</label>
              <textarea id="address" value={form.address} onChange={e => update('address', e.target.value)} style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }} />
            </div>

            <div>
              <label style={labelStyle} htmlFor="email">Email</label>
              <input id="email" type="email" value={form.email} onChange={e => update('email', e.target.value)} style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle} htmlFor="password">Password</label>
              <input id="password" type="password" value={form.password} onChange={e => update('password', e.target.value)} style={inputStyle} />
            </div>

            <button type="submit" disabled={formDisabled} style={{ marginTop: 4, padding: '13px 16px', borderRadius: 10, border: 'none', background: '#d4a853', color: '#111111', fontSize: 14, fontWeight: 700, cursor: formDisabled ? 'not-allowed' : 'pointer', opacity: formDisabled ? 0.7 : 1 }}>
              {submitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p style={{ marginTop: 18, marginBottom: 0, color: '#8a8a84', fontSize: 13 }}>
            Already have an account? <Link href="/login" style={{ color: '#d4a853' }}>Go to login</Link>
          </p>
        </div>
      </div>
    </>
  )
}
