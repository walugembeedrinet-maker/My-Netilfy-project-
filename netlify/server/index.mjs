import { Hono } from 'hono'
import { getDatabase } from '@netlify/database'
import Anthropic from '@anthropic-ai/sdk'
import { analyze, summarize } from './detect.mjs'
import { sampleEmployees } from './sample.mjs'

export const config = { path: '/api/*' }

const db = getDatabase()
const anthropic = new Anthropic()
const app = new Hono()

const FIELDS = [
  'employee_code', 'full_name', 'national_id', 'bank_account', 'phone', 'department', 'position',
  'salary', 'status', 'hire_date', 'termination_date', 'last_attendance', 'last_paid', 'verified', 'notes',
]

const SELECT = `
  SELECT id, employee_code, full_name, national_id, bank_account, phone, department, position,
         salary::float8 AS salary, status, hire_date::text AS hire_date,
         termination_date::text AS termination_date, last_attendance::text AS last_attendance,
         last_paid::text AS last_paid, verified, notes, updated_at
  FROM employees ORDER BY full_name`

const str = (v, max = 200) => {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}
const date = (v) => {
  const s = str(v, 40)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const bool = (v) => v === true || /^(true|yes|y|1|verified)$/i.test(String(v ?? '').trim())

function clean(input) {
  const status = /^(terminated|inactive|exited|left|resigned|dismissed)$/i.test(String(input.status ?? '').trim())
    ? 'terminated'
    : /^suspended$/i.test(String(input.status ?? '').trim()) ? 'suspended' : 'active'
  const salary = Number(String(input.salary ?? '0').replace(/[^0-9.\-]/g, ''))
  return {
    employee_code: str(input.employee_code, 60),
    full_name: str(input.full_name),
    national_id: str(input.national_id, 60),
    bank_account: str(input.bank_account, 60),
    phone: str(input.phone, 40),
    department: str(input.department, 100),
    position: str(input.position, 100),
    salary: Number.isFinite(salary) && salary >= 0 ? salary : 0,
    status,
    hire_date: date(input.hire_date),
    termination_date: date(input.termination_date),
    last_attendance: date(input.last_attendance),
    last_paid: date(input.last_paid),
    verified: bool(input.verified),
    notes: str(input.notes, 1000),
  }
}

async function loadAll() {
  const { rows } = await db.pool.query(SELECT)
  const employees = analyze(rows)
  return { employees, summary: summarize(employees) }
}

async function upsert(records) {
  // Postgres rejects duplicate conflict keys inside one statement, so keep the last row per code.
  const unique = [...new Map(records.map((r) => [r.employee_code, r])).values()]
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const values = db.sql.values(chunk.map((r) => FIELDS.map((f) => r[f])))
    await db.sql`
      INSERT INTO employees (employee_code, full_name, national_id, bank_account, phone, department, position,
        salary, status, hire_date, termination_date, last_attendance, last_paid, verified, notes)
      VALUES ${values}
      ON CONFLICT (employee_code) DO UPDATE SET
        full_name = EXCLUDED.full_name, national_id = EXCLUDED.national_id, bank_account = EXCLUDED.bank_account,
        phone = EXCLUDED.phone, department = EXCLUDED.department, position = EXCLUDED.position,
        salary = EXCLUDED.salary, status = EXCLUDED.status, hire_date = EXCLUDED.hire_date,
        termination_date = EXCLUDED.termination_date, last_attendance = EXCLUDED.last_attendance,
        last_paid = EXCLUDED.last_paid, verified = EXCLUDED.verified, notes = EXCLUDED.notes,
        updated_at = NOW()`
  }
  return unique.length
}

app.get('/api/employees', async (c) => c.json(await loadAll()))

app.post('/api/employees', async (c) => {
  const r = clean(await c.req.json())
  if (!r.employee_code || !r.full_name) return c.json({ error: 'Employee ID and full name are required.' }, 400)
  const existing = await db.sql`SELECT id FROM employees WHERE employee_code = ${r.employee_code}`
  if (existing.length) return c.json({ error: `Employee ID ${r.employee_code} already exists.` }, 409)
  await upsert([r])
  return c.json(await loadAll(), 201)
})

app.put('/api/employees/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const r = clean(await c.req.json())
  if (!r.employee_code || !r.full_name) return c.json({ error: 'Employee ID and full name are required.' }, 400)
  const clash = await db.sql`SELECT id FROM employees WHERE employee_code = ${r.employee_code} AND id <> ${id}`
  if (clash.length) return c.json({ error: `Employee ID ${r.employee_code} is used by another record.` }, 409)
  const updated = await db.sql`
    UPDATE employees SET employee_code = ${r.employee_code}, full_name = ${r.full_name},
      national_id = ${r.national_id}, bank_account = ${r.bank_account}, phone = ${r.phone},
      department = ${r.department}, position = ${r.position}, salary = ${r.salary}, status = ${r.status},
      hire_date = ${r.hire_date}, termination_date = ${r.termination_date},
      last_attendance = ${r.last_attendance}, last_paid = ${r.last_paid}, verified = ${r.verified},
      notes = ${r.notes}, updated_at = NOW()
    WHERE id = ${id} RETURNING id`
  if (!updated.length) return c.json({ error: 'Employee not found.' }, 404)
  return c.json(await loadAll())
})

app.delete('/api/employees/:id', async (c) => {
  await db.sql`DELETE FROM employees WHERE id = ${Number(c.req.param('id'))}`
  return c.json(await loadAll())
})

app.post('/api/employees/bulk', async (c) => {
  const body = await c.req.json()
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : []
  const valid = []
  let skipped = 0
  for (const row of rows) {
    const r = clean(row)
    if (r.employee_code && r.full_name) valid.push(r)
    else skipped++
  }
  const saved = valid.length ? await upsert(valid) : 0
  return c.json({ saved, skipped, ...(await loadAll()) })
})

app.post('/api/sample', async (c) => {
  await upsert(sampleEmployees().map(clean))
  return c.json(await loadAll())
})

app.delete('/api/employees', async (c) => {
  await db.sql`DELETE FROM employees`
  return c.json(await loadAll())
})

app.post('/api/assistant', async (c) => {
  const body = await c.req.json()
  const question = str(body.question, 1000)
  if (!question) return c.json({ error: 'Please ask a question.' }, 400)
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-8)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))

  const { employees, summary } = await loadAll()
  const flagged = employees
    .filter((e) => e.risk_score > 0)
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 60)
    .map((e) => `${e.employee_code} | ${e.full_name} | ${e.department ?? '-'} | salary ${e.salary} | ${e.status} | risk ${e.risk_score} (${e.risk_level}) | ${e.flags.map((f) => f.message).join('; ')}`)
  const roster = employees
    .slice(0, 400)
    .map((e) => `${e.employee_code} | ${e.full_name} | ${e.department ?? '-'} | ${e.position ?? '-'} | salary ${e.salary} | ${e.status} | last attendance ${e.last_attendance ?? 'none'} | verified ${e.verified ? 'yes' : 'no'} | risk ${e.risk_score}`)

  const system = `You are "Inspector", the voice assistant of a payroll ghost-worker detection app.
Ghost workers are fake, duplicate, absent or exited employees who still receive salary.
Answer using ONLY the payroll data below. Your reply is read aloud, so: plain sentences, no markdown, no bullet symbols, no tables.
Keep it short (2-5 sentences) unless the user asks for detail. Give names and employee IDs when relevant, and suggest a concrete corrective action (e.g. physical headcount, freeze salary, verify bank details) for suspicious cases.
If the data is empty, tell the user to upload a payroll CSV, add employees, or load the sample data.
Today's date: ${new Date().toISOString().slice(0, 10)}.

SUMMARY: ${JSON.stringify(summary)}

FLAGGED EMPLOYEES (code | name | dept | salary | status | risk | reasons):
${flagged.join('\n') || 'none'}

ROSTER (first ${roster.length} of ${employees.length}):
${roster.join('\n') || 'empty'}`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 600,
      system,
      messages: [...history, { role: 'user', content: question }],
    })
    const answer = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
    return c.json({ answer: answer || 'Sorry, I could not come up with an answer.' })
  } catch (err) {
    console.error('assistant error', err)
    return c.json({ error: 'The assistant is unavailable right now. Please try again.' }, 502)
  }
})

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Something went wrong on the server.' }, 500)
})

export default app
