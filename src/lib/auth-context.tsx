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

type UserDoc = {
  email?: string
  role?: string
  companyId?: string
  isActive?: boolean
}

const Ctx = createContext<AuthCtx>({
  user: null,
  profile: null,
  loading: true,
  blocked: false,
  configError: firebaseConfigError,
})

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

    async function blockUser() {
      await signOut(auth)
      setUser(null)
      setProfile(null)
      setBlocked(true)
      setLoading(false)
    }

    return onAuthStateChanged(auth, async currentUser => {
      setBlocked(false)

      if (!currentUser) {
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        await currentUser.reload()
        const resolvedUser = auth.currentUser || currentUser

        if (!resolvedUser.emailVerified) {
          await blockUser()
          return
        }

        const userSnap = await getDoc(doc(db, 'users', resolvedUser.uid))
        if (!userSnap.exists()) {
          await blockUser()
          return
        }

        const userDoc = userSnap.data() as UserDoc
        if (userDoc.isActive === false) {
          await blockUser()
          return
        }

        setUser(resolvedUser)
        setProfile({
          uid: resolvedUser.uid,
          email: userDoc.email || resolvedUser.email || '',
          name: resolvedUser.displayName || userDoc.email || resolvedUser.email || '',
          photo: resolvedUser.photoURL || '',
          role: normalizeRole(userDoc.role),
          isActive: true,
          companyId: userDoc.companyId,
        })
      } catch (error) {
        console.error('Auth error:', error)
        setUser(null)
        setProfile(null)
        setBlocked(true)
      }

      setLoading(false)
    })
  }, [])

  return <Ctx.Provider value={{ user, profile, loading, blocked, configError: firebaseConfigError }}>{children}</Ctx.Provider>
}
