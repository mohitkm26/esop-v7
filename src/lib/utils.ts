// ── Formatting ──────────────────────────────────────────────────────────────
export const fmtN = (n: number) => Number(n||0).toLocaleString('en-IN')
export const fmtC = (n: number) => '₹' + Number(n||0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
export const fmtDate = (s: string|null|undefined) => {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
}
export const toISO = (d: Date) => d.toISOString().split('T')[0]
export const today = () => toISO(new Date())

// ── Date parsing ─────────────────────────────────────────────────────────────
export function parseFlexDate(s: string): string|null {
  if (!s?.trim()) return null
  s = s.trim()
  const mon: Record<string,string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
  }
  const m = s.match(/^(\d{1,2})[-\/](\w{3})[-\/](\d{2,4})$/i)
  if (m) {
    const mo = mon[m[2].toLowerCase()]
    if (!mo) return null
    let yr = parseInt(m[3]); if (yr < 100) yr += yr < 50 ? 2000 : 1900
    return `${yr}-${mo}-${m[1].padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s); return isNaN(d.getTime()) ? null : toISO(d)
}

export function parseVestingStr(str: string): Array<{date:string,quantity:number}> {
  if (!str) return []
  return str.split(',').map(s=>s.trim()).filter(Boolean).flatMap(pair => {
    const m = pair.match(/^([\d\-A-Za-z]+)\s*:\s*(\d+(?:\.\d+)?)$/)
    if (!m) return []
    const d = parseFlexDate(m[1].trim()); const q = Math.round(parseFloat(m[2]))
    return d && q > 0 ? [{date:d,quantity:q}] : []
  }).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime())
}

// ── Vesting status computation ───────────────────────────────────────────────
// CORRECT LAPSE LOGIC:
// An option lapses if the employee exits BEFORE the vesting date.
// The exit date IS the last day of employment.
// Options that vest ON or BEFORE the exit date = vested (employee earns them).
// Options that vest AFTER the exit date = lapsed.
// If no exit date — check against today for "vested" vs "pending".
export function computeVestingStatus(
  vestDate: string,
  exitDate: string | null | undefined,
  existingStatus?: 'pending' | 'vested' | 'lapsed'
): 'pending' | 'vested' | 'lapsed' {
  if (existingStatus === 'lapsed') return 'lapsed' // manually lapsed — respect it
  if (exitDate) {
    // Vest date > exit date → employee was gone before this vest → LAPSED
    if (vestDate > exitDate) return 'lapsed'
    // Vest date <= exit date → employee was still employed on vest date → VESTED
    return 'vested'
  }
  // No exit date — active employee
  const todayStr = today()
  return vestDate <= todayStr ? 'vested' : 'pending'
}

export interface VestingEvent {
  id: string
  grantId: string
  employeeId: string
  vestDate: string
  optionsCount: number
  status: 'pending' | 'vested' | 'lapsed'
}

export interface VestingResult {
  total: number
  vested: number
  lapsed: number
  pending: number
  exercised: number
  netVested: number   // vested - lapsed - exercised (can't go negative)
  vestedValue: number
  pct: number         // % of total that has vested (not lapsed)
}

export function computeVesting(
  events: VestingEvent[],
  totalOptions: number,
  fairValue = 0,
  exercised = 0,
  exitDate?: string | null
): VestingResult {
  let vested = 0, lapsed = 0, pending = 0

  events.forEach(ev => {
    // If exitDate provided, recompute status dynamically (in case DB has stale status)
    const status = exitDate !== undefined
      ? computeVestingStatus(ev.vestDate, exitDate, ev.status)
      : ev.status

    if (status === 'lapsed') lapsed += ev.optionsCount
    else if (status === 'vested') vested += ev.optionsCount
    else pending += ev.optionsCount
  })

  const netVested = Math.max(0, vested - exercised)
  const effectiveTotal = vested + lapsed + pending

  return {
    total: totalOptions || effectiveTotal,
    vested,
    lapsed,
    pending,
    exercised,
    netVested,
    vestedValue: netVested * fairValue,
    pct: totalOptions > 0 ? Math.round((vested / totalOptions) * 100) : 0,
  }
}

// ── Valuation lookup ─────────────────────────────────────────────────────────
export function getLatestValuation(valuations: Array<{effectiveDate:string,fairValue:number}>, asOf?: string) {
  const cutoff = asOf || today()
  return valuations
    .filter(v => v.effectiveDate <= cutoff)
    .sort((a,b) => b.effectiveDate.localeCompare(a.effectiveDate))[0]?.fairValue || 0
}

// ── ESOP Cost (IndAS 102 — Intrinsic Value Method) ───────────────────────────
export interface ESOPCostResult {
  grantId: string; grantNumber: string; employeeName: string
  exercisePrice: number; grantDateFV: number; intrinsicValue: number
  totalCost: number; fyAllocation: Record<string, number>
}

export function calcESOPCost(
  grant: { id:string; grantNumber:string; grantDate:string; exercisePrice:number; totalOptions:number },
  employee: { name:string },
  events: VestingEvent[],
  grantDateFV: number
): ESOPCostResult {
  const intrinsicValue = Math.max(0, grantDateFV - (grant.exercisePrice || 0))
  const totalCost = intrinsicValue * grant.totalOptions
  const fyAllocation: Record<string,number> = {}

  events.forEach(ev => {
    if (ev.status === 'lapsed') return
    const d = new Date(ev.vestDate)
    const fyStart = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
    const fy = `FY ${fyStart}-${String(fyStart + 1).slice(2)}`
    fyAllocation[fy] = (fyAllocation[fy] || 0) + (intrinsicValue * ev.optionsCount)
  })

  return { grantId:grant.id, grantNumber:grant.grantNumber, employeeName:employee.name, exercisePrice:grant.exercisePrice||0, grantDateFV, intrinsicValue, totalCost, fyAllocation }
}

// ── Grant letter HTML ─────────────────────────────────────────────────────────
export function buildGrantLetterHTML(params: {
  grantNumber: string; employeeName: string; employeeCode: string
  grantDate: string; totalOptions: number; exercisePrice: number
  vestingSchedule: Array<{date:string,quantity:number}>
  companyName: string; notes?: string
}) {
  const { grantNumber,employeeName,employeeCode,grantDate,totalOptions,exercisePrice,vestingSchedule,companyName,notes } = params
  const rows = vestingSchedule.map(ev=>`
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${fmtDate(ev.date)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${fmtN(ev.quantity)}</td></tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:Georgia,serif;max-width:750px;margin:40px auto;color:#1a1a2e;line-height:1.8;font-size:14px}
  h1{font-size:24px;margin:0} .header{border-bottom:3px solid #d4a853;padding-bottom:20px;margin-bottom:30px}
  table{width:100%;border-collapse:collapse} th{background:#f9f6ef;padding:8px 12px;text-align:left}
  .meta td{padding:8px 14px;font-size:13px} .meta tr:nth-child(even){background:#faf8f3}
  .highlight td{background:#d4a853;color:white;font-weight:bold;font-size:16px;padding:10px 14px}
  .note{margin:20px 0;padding:12px 16px;background:#fffbf0;border-left:3px solid #d4a853}
  .sig{margin-top:60px;border-top:1px solid #eee;padding-top:20px}
</style></head><body>
<div class="header"><h1>${companyName}</h1><p style="color:#666;margin:4px 0 0">Employee Stock Option Grant Letter</p></div>
<p>Date: <strong>${fmtDate(today())}</strong> &nbsp;|&nbsp; Ref: <strong>${grantNumber}</strong></p>
<p>Dear <strong>${employeeName}</strong>,</p>
<p>We are pleased to inform you that the Board of Directors of <strong>${companyName}</strong> has approved the grant of Employee Stock Options to you under the Company's ESOP Plan, subject to the terms and conditions below.</p>
<table class="meta" style="margin:24px 0">
  <tr><td><strong>Employee Name</strong></td><td>${employeeName}</td></tr>
  <tr><td><strong>Employee Code</strong></td><td>${employeeCode}</td></tr>
  <tr><td><strong>Grant Reference</strong></td><td>${grantNumber}</td></tr>
  <tr><td><strong>Grant Date</strong></td><td>${fmtDate(grantDate)}</td></tr>
  <tr><td><strong>Exercise Price</strong></td><td>${fmtC(exercisePrice)} per option</td></tr>
  <tr class="highlight"><td>Total Options Granted</td><td>${fmtN(totalOptions)}</td></tr>
</table>
<h3 style="border-bottom:1px solid #eee;padding-bottom:8px">Vesting Schedule</h3>
<table><thead><tr><th>Vesting Date</th><th style="text-align:right">Options</th></tr></thead><tbody>${rows}</tbody></table>
${notes?`<div class="note"><strong>Conditions:</strong> ${notes}</div>`:''}
<p style="margin-top:24px">This grant is subject to the terms of the Company's ESOP Plan, your employment agreement, and applicable laws. Please retain this letter for your records.</p>
<div class="sig"><p>Authorised Signatory<br><strong>${companyName}</strong><br><br>_______________________<br>Name &amp; Designation<br>Date: ___________________</p></div>
</body></html>`
}

// ── CSV utils ────────────────────────────────────────────────────────────────
export function smartSplit(line: string) {
  const r: string[] = []; let cur='',inQ=false
  for (const c of line) {
    if (c==='"'){inQ=!inQ;continue}
    if (c===','&&!inQ){r.push(cur);cur='';continue}
    cur+=c
  }
  r.push(cur); return r
}

export function extractGrantNo(filename: string): string|null {
  const m = filename.match(/^(G-?\d{4})/i)
  return m ? m[1].toUpperCase().replace(/^G(\d)/,'G-$1') : null
}

export function downloadBlob(content: string, filename: string, type='text/csv') {
  const blob = new Blob([content],{type})
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click()
}

export function generateGrantNumber(existing: string[]): string {
  const nums = existing
    .map(n => parseInt((n || '').replace(/[^0-9]/g, '') || '0'))
    .filter(n => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return `G-${String(max + 1).padStart(4, '0')}`
}
