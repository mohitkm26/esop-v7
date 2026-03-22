import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { db, auth, firebaseConfigError, googleProvider } from '@/lib/firebase'
import { signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth'
import { collection, getDocs, query, where, orderBy, doc, getDoc } from 'firebase/firestore'
import { useAuth } from '@/lib/auth-context'
import Head from 'next/head'

export default function EmployeePortal() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  const [data, setData] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [signing, setSigning] = useState(false)

  // ---------------- LOGIN ----------------
  async function handleSignIn() {
    if (!auth) {
      setErr(firebaseConfigError || 'Firebase auth is not available.')
      return
    }

    setSigning(true)
    setErr('')

    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e: any) {
      if (e?.code === 'auth/popup-closed-by-user') return

      if (
        e?.code === 'auth/popup-blocked' ||
        e?.code === 'auth/cancelled-popup-request'
      ) {
        try {
          await signInWithRedirect(auth, googleProvider)
          return
        } catch (redirectError: any) {
          setErr(redirectError?.message || 'Redirect sign-in failed.')
          return
        }
      }

      setErr(e?.message || 'Sign-in failed.')
    } finally {
      setSigning(false)
    }
  }

  // ---------------- LOAD DATA ----------------
  async function loadData(empId: string) {
    if (!db) return

    setBusy(true)
    setErr('')

    try {
      const empSnap = await getDoc(doc(db, 'employees', empId))

      if (!empSnap.exists()) {
        setErr('Employee record not found.')
        return
      }

      setData(empSnap.data())
    } catch (e: any) {
      setErr(e.message)
    }

    setBusy(false)
  }

  // ---------------- AUTH FLOW ----------------
  useEffect(() => {
    if (loading || !user || !profile) return

    // Non-employee → dashboard
    if (['admin', 'editor', 'viewer', 'companyAdmin'].includes(profile.role)) {
      router.replace('/dashboard')
      return
    }

    // Employee → load data
    if (profile.role === 'employee' && profile.employeeId) {
      loadData(profile.employeeId)
    } else {
      setErr('Your email is not linked to an employee record. Contact HR.')
    }
  }, [user, profile, loading])

  // ---------------- LOGIN SCREEN ----------------
  if (!user) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Employee Portal Login</h2>

        {err && <p style={{ color: 'red' }}>{err}</p>}

        {firebaseConfigError && (
          <p style={{ color: 'orange' }}>{firebaseConfigError}</p>
        )}

        <button onClick={handleSignIn} disabled={signing}>
          {signing ? 'Signing in...' : 'Continue with Google'}
        </button>
      </div>
    )
  }

  // ---------------- LOADING ----------------
  if (loading || busy) return <div>Loading...</div>

  // ---------------- ERROR ----------------
  if (err) {
    return (
      <div style={{ padding: 40 }}>
        <h3>Access Issue</h3>
        <p>{err}</p>
        <button onClick={() => signOut(auth!)}>Sign out</button>
      </div>
    )
  }

  // ---------------- MAIN ----------------
  return (
    <div style={{ padding: 40 }}>
      <h1>Employee Portal</h1>

      <p>Welcome: {profile?.email}</p>

      <pre>{JSON.stringify(data, null, 2)}</pre>

      <button onClick={() => signOut(auth!)}>Logout</button>
    </div>
  )
}
