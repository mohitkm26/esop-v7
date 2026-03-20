import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { auth, db } from './firebase'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore'

export interface Profile {
  uid: string
  email: string
  name: string
  photo: string
  role: 'admin' | 'editor' | 'viewer' | 'employee'
  isActive: boolean
  companyId?: string
  employeeId?: string
}

interface AuthCtx {
  user: User | null
  profile: Profile | null
  loading: boolean
  blocked: boolean
}

const Ctx = createContext<AuthCtx>({ user: null, profile: null, loading: true, blocked: false })
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, async u => {
      setUser(u)
      setBlocked(false)

      if (!u) { setProfile(null); setLoading(false); return }

      try {
        const profileRef  = doc(db, 'profiles', u.uid)
        const profileSnap = await getDoc(profileRef)

        // ── A. Returning user ────────────────────────────────────────────
        if (profileSnap.exists()) {
          const existing = profileSnap.data() as Profile
          if (!existing.isActive) {
            await signOut(auth)
            setUser(null); setProfile(null); setBlocked(true)
            setLoading(false); return
          }
          setProfile(existing); setLoading(false); return
        }

        // ── B. First ever user → becomes admin ───────────────────────────
        const allProfiles = await getDocs(collection(db, 'profiles'))
        if (allProfiles.empty) {
          const p: Profile = {
            uid: u.uid, email: u.email!, name: u.displayName || u.email!,
            photo: u.photoURL || '', role: 'admin', isActive: true,
          }
          await setDoc(profileRef, { ...p, createdAt: new Date().toISOString() })
          setProfile(p); setLoading(false); return
        }

        // ── C. Check invite list ─────────────────────────────────────────
        const inviteSnap = await getDocs(
          query(collection(db, 'invites'), where('email', '==', u.email!.toLowerCase()))
        )
        if (!inviteSnap.empty) {
          const invite = inviteSnap.docs[0].data()
          const p: Profile = {
            uid: u.uid, email: u.email!, name: u.displayName || u.email!,
            photo: u.photoURL || '', role: invite.role || 'viewer', isActive: true,
            ...(invite.employeeId ? { employeeId: invite.employeeId } : {}),
          }
          await setDoc(profileRef, { ...p, createdAt: new Date().toISOString() })
          setProfile(p); setLoading(false); return
        }

        // ── D. Check employee records (official or personal email match) ──
        const [r1, r2] = await Promise.all([
          getDocs(query(collection(db, 'employees'), where('officialEmail', '==', u.email!))),
          getDocs(query(collection(db, 'employees'), where('personalEmail', '==', u.email!))),
        ])
        const matchedEmp = [...r1.docs, ...r2.docs][0]
        if (matchedEmp) {
          const p: Profile = {
            uid: u.uid, email: u.email!, name: u.displayName || u.email!,
            photo: u.photoURL || '', role: 'employee', isActive: true,
            employeeId: matchedEmp.id,
          }
          await setDoc(profileRef, { ...p, createdAt: new Date().toISOString() })
          setProfile(p); setLoading(false); return
        }

        // ── E. No match at all → block ────────────────────────────────────
        await signOut(auth)
        setUser(null); setProfile(null); setBlocked(true)
      } catch (e) { console.error('Auth error:', e) }

      setLoading(false)
    })
  }, [])

  return <Ctx.Provider value={{ user, profile, loading, blocked }}>{children}</Ctx.Provider>
}
