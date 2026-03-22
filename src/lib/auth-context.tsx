import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { auth, db, firebaseConfigError } from './firebase'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore'

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
  configError: string
}

const Ctx = createContext<AuthCtx>({ user: null, profile: null, loading: true, blocked: false, configError: firebaseConfigError })
export const useAuth = () => useContext(Ctx)

const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() || ''

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!auth || !db) {
      setUser(null)
      setProfile(null)
      setBlocked(false)
      setLoading(false)
      if (firebaseConfigError) console.error(firebaseConfigError)
      return
    }

    return onAuthStateChanged(auth, async u => {
      setUser(u)
      setBlocked(false)

      if (!u) { setProfile(null); setLoading(false); return }

      try {
        const email = normalizeEmail(u.email)
        if (!email) {
          await signOut(auth)
          setUser(null); setProfile(null); setBlocked(true)
          setLoading(false); return
        }

        const profileRef  = doc(db, 'profiles', u.uid)
        const profileSnap = await getDoc(profileRef)

        if (profileSnap.exists()) {
          const existing = profileSnap.data() as Profile
          if (!existing.isActive) {
            await signOut(auth)
            setUser(null); setProfile(null); setBlocked(true)
            setLoading(false); return
          }
          setProfile(existing); setLoading(false); return
        }

        const allProfiles = await getDocs(collection(db, 'profiles'))
        if (allProfiles.empty) {
          const p: Profile = {
            uid: u.uid, email, name: u.displayName || email,
            photo: u.photoURL || '', role: 'admin', isActive: true,
          }
          await setDoc(profileRef, { ...p, emailLower: email, createdAt: new Date().toISOString() })
          setProfile(p); setLoading(false); return
        }

        const directInviteSnap = await getDocs(
          query(collection(db, 'invites'), where('email', '==', email))
        )
        let inviteDoc = directInviteSnap.docs[0] || null
        if (!inviteDoc) {
          const allInvites = await getDocs(collection(db, 'invites'))
          inviteDoc = allInvites.docs.find(d => normalizeEmail(d.data().email) === email) || null
        }
        if (inviteDoc) {
          const invite = inviteDoc.data()
          const p: Profile = {
            uid: u.uid, email, name: u.displayName || email,
            photo: u.photoURL || '', role: invite.role || 'viewer', isActive: true,
            ...(invite.employeeId ? { employeeId: invite.employeeId } : {}),
          }
          await setDoc(profileRef, { ...p, emailLower: email, createdAt: new Date().toISOString() })
          await updateDoc(inviteDoc.ref, { email, emailLower: email, used: true, usedAt: new Date().toISOString(), usedBy: u.uid })
          setProfile(p); setLoading(false); return
        }

        const directEmployeeMatches = await Promise.all([
          getDocs(query(collection(db, 'employees'), where('officialEmail', '==', email))),
          getDocs(query(collection(db, 'employees'), where('personalEmail', '==', email))),
        ])
        let matchedEmp = [...directEmployeeMatches[0].docs, ...directEmployeeMatches[1].docs][0] || null
        if (!matchedEmp) {
          const allEmployees = await getDocs(collection(db, 'employees'))
          matchedEmp = allEmployees.docs.find(d => {
            const data = d.data() as any
            return normalizeEmail(data.officialEmail) === email || normalizeEmail(data.personalEmail) === email
          }) || null
        }
        if (matchedEmp) {
          const p: Profile = {
            uid: u.uid, email, name: u.displayName || email,
            photo: u.photoURL || '', role: 'employee', isActive: true,
            employeeId: matchedEmp.id,
          }
          await setDoc(profileRef, { ...p, emailLower: email, createdAt: new Date().toISOString() })
          setProfile(p); setLoading(false); return
        }

        await signOut(auth)
        setUser(null); setProfile(null); setBlocked(true)
      } catch (e) {
        console.error('Auth error:', e)
      }

      setLoading(false)
    })
  }, [])

  return <Ctx.Provider value={{ user, profile, loading, blocked, configError: firebaseConfigError }}>{children}</Ctx.Provider>
}
