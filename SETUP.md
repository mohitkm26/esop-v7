# ESOP Manager — Setup Guide

## Quick Start (5 minutes)

### 1. Prerequisites
- Node.js 18+
- Firebase CLI: `npm install -g firebase-tools`

### 2. Configure Firebase
Fill in `/home/claude/esop-v6/.env.local` with your Firebase project keys.

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### 3. Deploy
```bash
npm install
npm run deploy
```

### 4. First Login
Sign in with Google → you become admin automatically → set your company plan in Users page.

---

## Custom Domain (hamoroni.com)

1. Firebase Console → Hosting → Add custom domain
2. Enter `esop.hamoroni.com` (or `app.hamoroni.com`)
3. Add the DNS records shown to your domain registrar
4. Wait 24h for propagation — done.

Note: This is done in Firebase Console, not in code. Your app name and branding can be changed in Settings → Company Name.

---

## Multi-Tenancy & Data Isolation

Each company signs up independently and gets their own `companyId` (= the admin's Firebase UID). All data (employees, grants, valuations, etc.) is scoped to this ID. Two companies logging into the same hosted URL **cannot see each other's data** — Firestore rules enforce this.

When multiple companies use this SaaS app:
- Company A: companyId = `abc123`
- Company B: companyId = `xyz789`
- Firestore reads always include `where('companyId','==',myId)` filters

---

## Plan Management

Upgrade plans from Users page (Admin only). Plans:
| Plan | Price | Features |
|------|-------|---------|
| basic | Free | Dashboard, employees, grants, CSV upload, grant letters |
| pro | ₹999/yr | + Email letters, Valuation tracking, Employee portal |
| advanced | ₹4,999/yr | + ESOP Cost (IndAS/IFRS/GAAP), eSign |

---

## Security — Invitation-Only Access

Only these users can sign in:
1. **Admin** — first user to sign in
2. **Invited users** — admin adds their email in Users page
3. **Employees** — their personal/official email is in the employees database

Everyone else is automatically blocked.

---

## Firestore Rules (Required)

In Firebase Console → Firestore → Rules, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Email Setup (Resend)

1. Sign up at resend.com (free tier: 3,000 emails/month)
2. Add and verify your domain (e.g. hamoroni.com)
3. Create API key
4. Add to Settings → HR Email fields in the app

---

## Firestore Indexes Required

In Firebase Console → Firestore → Indexes, create:

| Collection | Fields | Order |
|---|---|---|
| grants | employeeId ASC, grantDate ASC | |
| vestingEvents | employeeId ASC | |
| valuations | effectiveDate DESC | |
