import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { auth, db } from './firebase'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

interface Profile {
  uid: string
  email: string
  name: string
  role: string
  isActive: boolean
  companyId?: string
}

interface AuthCtx {
  user: User | null
  profile: Profile | null
  loading: boolean
  blocked: boolean
}

const Ctx = createContext<AuthCtx>({
  user: null,
  profile: null,
  loading: true,
  blocked: false
})

export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!auth || !db) {
      setLoading(false)
      return
    }

    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setBlocked(false)

      if (!u) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        // ✅ Enforce email verification
        if (!u.emailVerified) {
          await signOut(auth)
          setBlocked(true)
          setLoading(false)
          return
        }

        // ✅ Fetch user from users collection
        const userRef = doc(db, 'users', u.uid)
        const userSnap = await getDoc(userRef)

        if (!userSnap.exists()) {
          await signOut(auth)
          setBlocked(true)
          setLoading(false)
          return
        }

        const userData = userSnap.data() as Profile

        if (!userData.isActive) {
          await signOut(auth)
          setBlocked(true)
          setLoading(false)
          return
        }

        setProfile(userData)
      } catch (err) {
        console.error('Auth error:', err)
      }

      setLoading(false)
    })
  }, [])

  return (
    <Ctx.Provider value={{ user, profile, loading, blocked }}>
      {children}
    </Ctx.Provider>
  )
}
