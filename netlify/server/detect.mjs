// Ghost-worker detection rules. Each rule adds weighted risk points and a readable reason.
const DAY = 86400000

const norm = (v) => (v == null ? '' : String(v).toLowerCase().replace(/[\s\-_.]/g, ''))
const nameKey = (v) => (v == null ? '' : String(v).toLowerCase().replace(/[^a-z]/g, ''))
const toDate = (v) => (v ? new Date(v) : null)

function median(nums) {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function groupBy(list, keyFn) {
  const map = new Map()
  for (const e of list) {
    const k = keyFn(e)
    if (!k) continue
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(e)
  }
  return map
}

export function analyze(employees, now = new Date()) {
  const results = new Map(employees.map((e) => [e.id, { score: 0, flags: [] }]))
  const add = (e, points, code, message) => {
    const r = results.get(e.id)
    r.score += points
    r.flags.push({ code, points, message })
  }

  const onPayroll = (e) => e.status !== 'terminated' || isPaidAfterExit(e)
  const isPaidAfterExit = (e) => {
    const t = toDate(e.termination_date)
    const p = toDate(e.last_paid)
    return e.status === 'terminated' && t && p && p > t
  }

  // Shared identifiers
  const dupRules = [
    ['bank_account', 'DUP_BANK', 35, 'Bank account shared with'],
    ['national_id', 'DUP_NATIONAL_ID', 40, 'National ID shared with'],
    ['phone', 'DUP_PHONE', 15, 'Phone number shared with'],
  ]
  for (const [field, code, pts, label] of dupRules) {
    for (const group of groupBy(employees, (e) => norm(e[field])).values()) {
      if (group.length < 2) continue
      for (const e of group) {
        const others = group.filter((o) => o.id !== e.id).map((o) => `${o.full_name} (${o.employee_code})`)
        add(e, pts, code, `${label} ${others.join(', ')}`)
      }
    }
  }

  for (const group of groupBy(employees, (e) => nameKey(e.full_name)).values()) {
    if (group.length < 2) continue
    for (const e of group) add(e, 15, 'DUP_NAME', `Same name as ${group.length - 1} other record(s)`)
  }

  // Department salary outliers
  const byDept = groupBy(employees.filter((e) => Number(e.salary) > 0), (e) => (e.department || 'unassigned').toLowerCase())
  const deptMedian = new Map([...byDept].map(([k, g]) => [k, g.length >= 3 ? median(g.map((e) => Number(e.salary))) : 0]))

  for (const e of employees) {
    if (isPaidAfterExit(e)) {
      add(e, 50, 'PAID_AFTER_EXIT', `Paid on ${fmt(e.last_paid)} after termination on ${fmt(e.termination_date)}`)
    }
    if (!onPayroll(e)) continue

    const att = toDate(e.last_attendance)
    if (!att) add(e, 25, 'NO_ATTENDANCE', 'No attendance record at all')
    else {
      const days = Math.floor((now - att) / DAY)
      if (days >= 90) add(e, 30, 'ABSENT_90', `No attendance for ${days} days`)
      else if (days >= 30) add(e, 15, 'ABSENT_30', `No attendance for ${days} days`)
    }

    if (!e.national_id) add(e, 15, 'MISSING_ID', 'Missing national ID')
    if (!e.bank_account) add(e, 10, 'MISSING_BANK', 'Missing bank account')
    if (!e.phone) add(e, 5, 'MISSING_PHONE', 'Missing phone number')
    if (!e.verified) add(e, 10, 'UNVERIFIED', 'Not physically verified by HR')

    const med = deptMedian.get((e.department || 'unassigned').toLowerCase())
    if (med && Number(e.salary) > med * 2.5) {
      add(e, 15, 'SALARY_OUTLIER', `Salary is ${(Number(e.salary) / med).toFixed(1)}× the department median`)
    }

    const hire = toDate(e.hire_date)
    if (hire && hire > now) add(e, 20, 'FUTURE_HIRE', `Hire date ${fmt(e.hire_date)} is in the future`)
  }

  return employees.map((e) => {
    const r = results.get(e.id)
    const score = Math.min(100, r.score)
    const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : score > 0 ? 'low' : 'clear'
    return { ...e, risk_score: score, risk_level: level, flags: r.flags }
  })
}

export function summarize(analyzed) {
  const count = (lvl) => analyzed.filter((e) => e.risk_level === lvl).length
  const atRisk = analyzed.filter((e) => e.risk_level === 'high' || e.risk_level === 'medium')
  return {
    total: analyzed.length,
    active: analyzed.filter((e) => e.status !== 'terminated').length,
    high: count('high'),
    medium: count('medium'),
    low: count('low'),
    clear: count('clear'),
    monthly_payroll: analyzed.filter((e) => e.status !== 'terminated').reduce((s, e) => s + Number(e.salary || 0), 0),
    exposure: atRisk.reduce((s, e) => s + Number(e.salary || 0), 0),
  }
}

function fmt(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '—'
}
