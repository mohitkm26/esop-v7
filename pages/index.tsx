import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/lib/auth-context'
import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

export default function Index() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!user || !profile) { router.replace('/login'); return }
    if (profile.role === 'employee') { router.replace('/employee-portal'); return }
    
    // Check if onboarding completed
    getDoc(doc(db,'companies',user.uid)).then(snap => {
      if (!snap.exists() || !snap.data().onboarded) {
        router.replace('/onboarding')
      } else {
        router.replace('/dashboard')
      }
    }).catch(() => router.replace('/dashboard'))
  }, [loading, user, profile])

  return <div style={{minHeight:'100vh',background:'#0c0c0c',display:'flex',alignItems:'center',justifyContent:'center'}}><div className="spinner"/></div>
}
