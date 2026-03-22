import { deleteApp, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, sendEmailVerification, signOut } from 'firebase/auth'
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseConfig, firebaseConfigError } from './firebase'

export interface SignupPayload {
  companyName: string
  pan: string
  gstn: string
  address: string
  email: string
  password: string
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export async function signupCompanyAdmin(payload: SignupPayload) {
  if (firebaseConfigError || !db) {
    throw new Error(firebaseConfigError || 'Firebase is not configured.')
  }

  const email = normalizeEmail(payload.email)
  const secondaryApp = initializeApp(firebaseConfig, `signup-${Date.now()}`)
  const secondaryAuth = getAuth(secondaryApp)

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, payload.password)
    await sendEmailVerification(cred.user)

    const companyRef = await addDoc(collection(db, 'companies'), {
      name: payload.companyName.trim(),
      pan: payload.pan.trim(),
      gstn: payload.gstn.trim(),
      address: payload.address.trim(),
      plan: 'free',
      createdAt: serverTimestamp(),
      isActive: true,
    })

    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email,
      role: 'companyAdmin',
      companyId: companyRef.id,
      isActive: true,
      createdAt: serverTimestamp(),
    })

    await signOut(secondaryAuth)
    return { email }
  } finally {
    await deleteApp(secondaryApp)
  }
}
