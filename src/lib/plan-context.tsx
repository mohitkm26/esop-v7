import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { db } from './firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useAuth } from './auth-context'

export type Plan = 'basic' | 'pro' | 'advanced'

interface PlanCtx {
  plan: Plan
  companyId: string
  loading: boolean
  can: (feature: Feature) => boolean
}

// All gated features
export type Feature =
  | 'email_letters'
  | 'valuation'
  | 'employee_portal_auth'
  | 'esop_cost'
  | 'esop_cost_advanced'
  | 'esign'
  | 'upload_pdf'
  | 'bulk_upload'

const PLAN_FEATURES: Record<Plan, Feature[]> = {
  basic: ['bulk_upload', 'upload_pdf'],
  pro:   ['bulk_upload', 'upload_pdf', 'email_letters', 'valuation', 'employee_portal_auth'],
  advanced: ['bulk_upload', 'upload_pdf', 'email_letters', 'valuation', 'employee_portal_auth', 'esop_cost', 'esop_cost_advanced', 'esign'],
}

const Ctx = createContext<PlanCtx>({ plan: 'basic', companyId: '', loading: true, can: () => false })
export const usePlan = () => useContext(Ctx)

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth()
  const [plan, setPlan]         = useState<Plan>('basic')
  const [companyId, setCompanyId] = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user || !profile) { setLoading(false); return }

    async function loadPlan() {
      // companyId comes from the user's profile (set when company is created)
      const cid = (profile as any).companyId || user!.uid
      setCompanyId(cid)

      const companyRef = doc(db, 'companies', cid)
      const snap = await getDoc(companyRef)

      if (!snap.exists()) {
        // First time — create company record with basic plan
        await setDoc(companyRef, {
          companyId: cid,
          ownerId: user!.uid,
          plan: 'basic',
          createdAt: new Date().toISOString(),
          planExpiry: null,
          razorpayCustomerId: null,
        })
        setPlan('basic')
      } else {
        const data = snap.data()
        // Check expiry
        if (data.planExpiry && new Date(data.planExpiry) < new Date()) {
          setPlan('basic') // expired — downgrade to basic
        } else {
          setPlan((data.plan || 'basic') as Plan)
        }
      }
      setLoading(false)
    }
    loadPlan()
  }, [user, profile, authLoading])

  const can = (feature: Feature) => PLAN_FEATURES[plan].includes(feature)

  return <Ctx.Provider value={{ plan, companyId, loading, can }}>{children}</Ctx.Provider>
}

// Plan display helpers
export const PLAN_LABELS: Record<Plan, string> = {
  basic: 'Basic (Free)',
  pro: 'Pro — ₹999/yr',
  advanced: 'Advanced — ₹4,999/yr',
}

export const PLAN_COLORS: Record<Plan, string> = {
  basic: 'badge-muted',
  pro: 'badge-blue',
  advanced: 'badge-amber',
}

export const UPGRADE_MESSAGES: Record<Feature, { title: string; desc: string; plan: Plan }> = {
  email_letters:          { title: 'Email Grant Letters', desc: 'Send grant letters directly to employees by email.', plan: 'pro' },
  valuation:              { title: 'Valuation Management', desc: 'Track fair values over time and upload supporting documents.', plan: 'pro' },
  employee_portal_auth:   { title: 'Secure Employee Portal', desc: 'Employees log in with their own email to view their grants securely.', plan: 'pro' },
  esop_cost:              { title: 'ESOP Cost (IndAS/IFRS)', desc: 'Calculate P&L impact per financial year under IndAS 102, IFRS 2, and Indian GAAP.', plan: 'advanced' },
  esop_cost_advanced:     { title: 'Advanced Cost Reports', desc: 'Year-wise disclosure notes and full grant-level breakdowns.', plan: 'advanced' },
  esign:                  { title: 'eSignature (DocuSign / Zoho Sign)', desc: 'Send grant letters for digital signature and track signing status.', plan: 'advanced' },
  upload_pdf:             { title: 'PDF Upload', desc: 'Upload and extract data from PDF grant letters.', plan: 'basic' },
  bulk_upload:            { title: 'Bulk CSV Upload', desc: 'Import employees and grants from spreadsheets.', plan: 'basic' },
}
