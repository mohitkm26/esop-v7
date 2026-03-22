import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { auth, db, firebaseConfigError } from './firebase'
import { onAuthStateChanged, User, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

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

function normalizeRole(role?: string): Profile['role'] {
  if (role === 'companyAdmin' || role === 'admin') return 'admin'
  if (role === 'editor') return 'editor'
  if (role === 'employee') return 'employee'
  return 'viewer'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
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

    async function blockCurrentUser() {
      await signOut(auth)
      setUser(null)
      setProfile(null)
      setBlocked(true)
      setLoading(false)
    }

    return onAuthStateChanged(auth, async currentUser => {
      setUser(currentUser)
      setBlocked(false)

      if (!currentUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        await currentUser.reload()
        const verifiedUser = auth.currentUser || currentUser

        if (!verifiedUser.emailVerified) {
          await blockCurrentUser()
          return
        }

        const userSnap = await getDoc(doc(db, 'users', verifiedUser.uid))
        if (!userSnap.exists()) {
          await blockCurrentUser()
          return
        }

        const userData = userSnap.data() as {
          email?: string
          role?: string
          companyId?: string
          isActive?: boolean
        }

        if (userData.isActive === false) {
          await blockCurrentUser()
          return
        }

        setUser(verifiedUser)
        setProfile({
          uid: verifiedUser.uid,
          email: userData.email || verifiedUser.email || '',
          name: verifiedUser.displayName || userData.email || verifiedUser.email || '',
          photo: verifiedUser.photoURL || '',
          role: normalizeRole(userData.role),
          isActive: true,
          companyId: userData.companyId,
        })
      } catch (e) {
        console.error('Auth error:', e)
        setUser(null)
        setProfile(null)
        setBlocked(true)
      }

      setLoading(false)
    })
  }, [])

  return <Ctx.Provider value={{ user, profile, loading, blocked, configError: firebaseConfigError }}>{children}</Ctx.Provider>
}
