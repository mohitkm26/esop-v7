/**
 * useCompanyDb — returns Firestore query helpers pre-scoped to the current company.
 * Every read/write is filtered by companyId so data is fully isolated between tenants.
 */
import { usePlan } from './plan-context'
import { db } from './firebase'
import {
  collection, query, where, getDocs, addDoc, setDoc, doc,
  orderBy as fbOrderBy, QueryConstraint, DocumentData
} from 'firebase/firestore'

export function useCompanyDb() {
  const { companyId } = usePlan()

  /** Scoped getDocs — adds where('companyId','==',cid) automatically */
  async function scopedGet(col: string, ...constraints: QueryConstraint[]) {
    if (!companyId) return []
    const q = query(collection(db, col), where('companyId','==',companyId), ...constraints)
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }

  /** Scoped addDoc — injects companyId into the document */
  async function scopedAdd(col: string, data: DocumentData) {
    if (!companyId) throw new Error('No companyId — not authenticated')
    return addDoc(collection(db, col), { ...data, companyId })
  }

  return { scopedGet, scopedAdd, companyId }
}
