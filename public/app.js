const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]

const state = { employees: [], summary: null, caseLevel: 'all', pendingRows: null }
const COLORS = { high: 'var(--red)', medium: 'var(--orange)', low: 'var(--yellow)', clear: 'var(--green)' }
const STAMP = { high: 'GHOST?', medium: 'REVIEW', low: 'CHECK' }

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d)) / 86400000) : null)

function toast(text, isError = false) {
  const t = $('#toast')
  t.textContent = text
  t.classList.toggle('error', isError)
  t.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => t.classList.remove('show'), 3200)
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

function setData(data) {
  state.employees = data.employees
  state.summary = data.summary
  render()
}

async function refresh() {
  try {
    setData(await api('/api/employees'))
  } catch (e) {
    $('#heroTitle').textContent = 'Could not load payroll'
    toast(e.message, true)
  }
}

/* ---------- Rendering ---------- */
function render() {
  renderOverview()
  renderCases()
  renderEmployees()
  $('#caseCount').textContent = state.employees.filter((e) => e.risk_level === 'high' || e.risk_level === 'medium').length
  $('#deptList').innerHTML = [...new Set(state.employees.map((e) => e.department).filter(Boolean))]
    .map((d) => `<option value="${esc(d)}">`).join('')
}

function renderOverview() {
  const s = state.summary
  if (!s) return
  if (!s.total) {
    $('#heroTitle').textContent = 'No payroll on file yet.'
    $('#heroText').innerHTML = 'Import a payroll CSV, add employees by hand, or load the sample payroll from the <b>Import</b> tab to start the investigation.'
  } else {
    const suspicious = s.high + s.medium
    $('#heroTitle').textContent = suspicious
      ? `${suspicious} suspicious record${suspicious === 1 ? '' : 's'} on a payroll of ${s.total}.`
      : `All ${s.total} records look clean.`
    $('#heroText').textContent = suspicious
      ? `Up to ${money(s.exposure)} in monthly salary is going to records that need verification.`
      : 'No duplicate identities, absences or payments after exit were found.'
  }

  const pct = s.monthly_payroll ? Math.round((s.exposure / s.monthly_payroll) * 100) : 0
  $('#stats').innerHTML = `
    <div class="stat"><div class="label">Employees</div><div class="value">${s.total}</div><div class="sub">${s.active} active</div></div>
    <div class="stat alert"><div class="label">High risk</div><div class="value">${s.high}</div><div class="sub">likely ghost workers</div></div>
    <div class="stat warn"><div class="label">Needs review</div><div class="value">${s.medium}</div><div class="sub">${s.low} low-risk</div></div>
    <div class="stat ${s.exposure ? 'alert' : ''}"><div class="label">Salary at risk / month</div><div class="value">${money(s.exposure)}</div><div class="sub">${pct}% of ${money(s.monthly_payroll)}</div></div>`

  const levels = ['high', 'medium', 'low', 'clear']
  $('#riskbar').innerHTML = s.total
    ? levels.map((l) => `<span style="flex:${s[l]};background:${COLORS[l]}" title="${l}: ${s[l]}"></span>`).join('')
    : ''
  $('#legend').innerHTML = levels.map((l) => `<li><i style="background:${COLORS[l]}"></i>${l[0].toUpperCase() + l.slice(1)}<b>${s[l]}</b></li>`).join('')

  const top = [...state.employees].filter((e) => e.risk_score > 0).sort((a, b) => b.risk_score - a.risk_score).slice(0, 5)
  $('#topSuspects').innerHTML = top.length
    ? top.map((e) => `<li data-edit="${e.id}"><div class="who"><b>${esc(e.full_name)}</b><small>${esc(e.employee_code)} · ${esc(e.flags[0]?.message)}</small></div><span class="pill ${e.risk_level}">${e.risk_score}</span></li>`).join('')
    : '<li class="muted" style="cursor:default">No suspects — nothing flagged.</li>'
}

function renderCases() {
  const list = state.employees
    .filter((e) => e.risk_score > 0 && (state.caseLevel === 'all' || e.risk_level === state.caseLevel))
    .sort((a, b) => b.risk_score - a.risk_score)
  $('#caseList').innerHTML = list.length
    ? list.map((e) => `
      <article class="case ${e.risk_level}" data-stamp="${STAMP[e.risk_level]}">
        <h4>${esc(e.full_name)}</h4>
        <div class="meta">${esc(e.employee_code)} · ${esc(e.department || 'No department')} · ${esc(e.position || '—')} · <span style="text-transform:capitalize">${esc(e.status)}</span></div>
        <div class="score"><div class="meter"><span style="width:${e.risk_score}%;background:${COLORS[e.risk_level]}"></span></div><b>${e.risk_score}/100</b></div>
        <div class="salary">Salary: ${money(e.salary)} / month</div>
        <ul>${e.flags.map((f) => `<li>${esc(f.message)}</li>`).join('')}</ul>
        <div class="actions">
          ${e.verified ? '' : `<button class="btn" data-verify="${e.id}">✓ Mark verified</button>`}
          ${e.status !== 'terminated' ? `<button class="btn" data-suspend="${e.id}">Suspend pay</button>` : ''}
          <button class="btn" data-edit="${e.id}">Open file</button>
        </div>
      </article>`).join('')
    : `<div class="empty"><strong>No open cases</strong>${state.employees.length ? 'Nothing matches this filter.' : 'Import or add employees to begin.'}</div>`
}

function renderEmployees() {
  const q = $('#search').value.trim().toLowerCase()
  const lvl = $('#levelFilter').value
  const rows = state.employees.filter((e) => {
    if (lvl !== 'all' && e.risk_level !== lvl) return false
    if (!q) return true
    return [e.full_name, e.employee_code, e.national_id, e.bank_account, e.phone, e.department, e.position]
      .some((v) => v && String(v).toLowerCase().includes(q))
  })
  $('#employeeRows').innerHTML = rows.length
    ? rows.map((e) => {
        const d = daysSince(e.last_attendance)
        return `<tr data-edit="${e.id}">
          <td><b>${esc(e.full_name)}</b><small>${esc(e.employee_code)}</small></td>
          <td data-label="Dept">${esc(e.department || '—')}<small>${esc(e.position || '')}</small></td>
          <td class="num" data-label="Salary">${money(e.salary)}</td>
          <td class="hide-sm"><span class="status ${esc(e.status)}">${esc(e.status)}</span></td>
          <td class="hide-sm">${e.last_attendance ? `${esc(e.last_attendance)}<small>${d} days ago</small>` : '<span class="muted">none</span>'}</td>
          <td><span class="pill ${e.risk_level}">${e.risk_level === 'clear' ? 'clear' : `${e.risk_level} · ${e.risk_score}`}</span></td>
          <td class="hide-sm" style="text-align:right"><button class="icon-btn" aria-label="Edit">✎</button></td>
        </tr>`
      }).join('')
    : `<tr><td colspan="7"><div class="empty" style="border:0"><strong>No employees found</strong>${state.employees.length ? 'Try a different search.' : 'Add an employee or import a CSV.'}</div></td></tr>`
}

/* ---------- Navigation ---------- */
function go(view) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view))
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
$$('.tab').forEach((t) => t.addEventListener('click', () => go(t.dataset.view)))
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)))
$('#caseFilter').addEventListener('click', (e) => {
  const b = e.target.closest('button')
  if (!b) return
  state.caseLevel = b.dataset.level
  $$('#caseFilter button').forEach((x) => x.classList.toggle('active', x === b))
  renderCases()
})
$('#search').addEventListener('input', renderEmployees)
$('#levelFilter').addEventListener('change', renderEmployees)

/* ---------- Employee form ---------- */
const dialog = $('#employeeDialog')
const form = $('#employeeForm')
let editingId = null

function openForm(emp) {
  editingId = emp?.id ?? null
  form.reset()
  $('#formError').hidden = true
  $('#formTitle').textContent = emp ? `Case file · ${emp.full_name}` : 'Add employee'
  $('#deleteBtn').hidden = !emp
  if (emp) {
    for (const el of form.elements) {
      if (!el.name) continue
      if (el.type === 'checkbox') el.checked = !!emp[el.name]
      else el.value = emp[el.name] ?? ''
    }
  }
  dialog.showModal()
}

function formData() {
  const out = {}
  for (const el of form.elements) {
    if (!el.name) continue
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value
  }
  return out
}

$('#addBtn').addEventListener('click', () => openForm())
form.addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'save') return
  e.preventDefault()
  const btn = $('#saveBtn')
  btn.disabled = true
  try {
    const body = formData()
    setData(editingId ? await api(`/api/employees/${editingId}`, { method: 'PUT', body }) : await api('/api/employees', { method: 'POST', body }))
    dialog.close()
    toast(editingId ? 'Employee updated' : 'Employee added')
  } catch (err) {
    $('#formError').textContent = err.message
    $('#formError').hidden = false
  } finally {
    btn.disabled = false
  }
})
$('#deleteBtn').addEventListener('click', async () => {
  if (!editingId || !confirm('Delete this employee record permanently?')) return
  try {
    setData(await api(`/api/employees/${editingId}`, { method: 'DELETE' }))
    dialog.close()
    toast('Employee deleted')
  } catch (err) { toast(err.message, true) }
})

const byId = (id) => state.employees.find((e) => e.id === Number(id))
async function quickUpdate(id, patch, message) {
  const emp = byId(id)
  if (!emp) return
  try {
    setData(await api(`/api/employees/${id}`, { method: 'PUT', body: { ...emp, ...patch } }))
    toast(message)
  } catch (err) { toast(err.message, true) }
}

document.addEventListener('click', (e) => {
  const v = e.target.closest('[data-verify]')
  if (v) return quickUpdate(v.dataset.verify, { verified: true }, 'Marked as verified')
  const s = e.target.closest('[data-suspend]')
  if (s) {
    const emp = byId(s.dataset.suspend)
    return quickUpdate(s.dataset.suspend, { status: 'suspended', notes: [emp?.notes, `Pay suspended pending verification (${new Date().toISOString().slice(0, 10)})`].filter(Boolean).join('\n') }, 'Pay suspended pending verification')
  }
  const ed = e.target.closest('[data-edit]')
  if (ed) openForm(byId(ed.dataset.edit))
})

/* ---------- CSV import ---------- */
const HEADER_MAP = {
  employee_code: ['employeecode', 'employeeid', 'empid', 'empno', 'staffno', 'staffid', 'staffnumber', 'employeenumber', 'employeeno', 'code', 'id', 'payrollno', 'ippsno'],
  full_name: ['fullname', 'name', 'employeename', 'staffname', 'names'],
  national_id: ['nationalid', 'nin', 'nationalidnumber', 'idnumber', 'ninumber', 'ssn', 'taxid'],
  bank_account: ['bankaccount', 'accountnumber', 'accountno', 'bankaccountnumber', 'acctno', 'account'],
  phone: ['phone', 'phonenumber', 'mobile', 'telephone', 'tel', 'contact'],
  department: ['department', 'dept', 'unit', 'section', 'division'],
  position: ['position', 'title', 'jobtitle', 'designation', 'role', 'post'],
  salary: ['salary', 'monthlysalary', 'grosspay', 'gross', 'basicsalary', 'netpay', 'pay', 'amount'],
  status: ['status', 'employmentstatus'],
  hire_date: ['hiredate', 'datehired', 'startdate', 'dateofappointment', 'joindate', 'datejoined'],
  termination_date: ['terminationdate', 'exitdate', 'enddate', 'dateleft', 'separationdate'],
  last_attendance: ['lastattendance', 'lastseen', 'lastclockin', 'lastpresent', 'lastattendancedate'],
  last_paid: ['lastpaid', 'lastpaymentdate', 'paydate', 'lastpaydate', 'paymentdate'],
  verified: ['verified', 'hrverified', 'physicallyverified', 'headcountverified'],
  notes: ['notes', 'comments', 'remarks'],
}

function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ','
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') inQuotes = false
      else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === delim) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

function mapRows(matrix) {
  const headers = matrix[0].map((h) => h.replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
  const index = {}
  for (const [field, aliases] of Object.entries(HEADER_MAP)) {
    const i = headers.findIndex((h) => h === field.replace(/_/g, '') || aliases.includes(h))
    if (i >= 0) index[field] = i
  }
  const rows = matrix.slice(1).map((r) => Object.fromEntries(Object.entries(index).map(([f, i]) => [f, r[i]?.trim() ?? ''])))
  return { index, rows }
}

function handleFile(file) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const matrix = parseCSV(String(reader.result))
    const preview = $('#preview')
    preview.hidden = false
    if (matrix.length < 2) {
      preview.innerHTML = '<p class="form-error">That file has no data rows.</p>'
      return
    }
    const { index, rows } = mapRows(matrix)
    if (index.employee_code == null || index.full_name == null) {
      preview.innerHTML = '<p class="form-error">Could not find an employee ID and a name column. Download the template to see the expected headers.</p>'
      return
    }
    state.pendingRows = rows
    preview.innerHTML = `
      <p><b>${esc(file.name)}</b> — ${rows.length} rows found. Columns matched:</p>
      <div class="mapping">${Object.keys(HEADER_MAP).map((f) => `<span class="${index[f] == null ? 'miss' : ''}">${f}</span>`).join('')}</div>
      <button class="btn btn-primary" id="confirmImport">Import ${rows.length} employees</button>`
    $('#confirmImport').addEventListener('click', async (ev) => {
      ev.target.disabled = true
      try {
        const data = await api('/api/employees/bulk', { method: 'POST', body: { rows: state.pendingRows } })
        setData(data)
        preview.innerHTML = `<p>Imported <b>${data.saved}</b> employees${data.skipped ? `, skipped ${data.skipped} rows without ID or name` : ''}.</p>`
        toast('Payroll imported — running detection')
        go('cases')
      } catch (err) {
        toast(err.message, true)
        ev.target.disabled = false
      }
    })
  }
  reader.readAsText(file)
}

const dz = $('#dropzone')
$('#fileInput').addEventListener('change', (e) => handleFile(e.target.files[0]))
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over') })
dz.addEventListener('dragleave', () => dz.classList.remove('over'))
dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); handleFile(e.dataTransfer.files[0]) })

$('#templateBtn').addEventListener('click', () => {
  const header = Object.keys(HEADER_MAP).join(',')
  const example = 'EMP100,Jane Doe,CF1234567,0123456789,0700000000,Finance,Accountant,1500000,active,2023-01-15,,2026-11-10,2026-10-31,yes,'
  const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'payroll-template.csv' })
  a.click()
  URL.revokeObjectURL(a.href)
})
$('#sampleBtn').addEventListener('click', async (e) => {
  e.target.disabled = true
  try {
    setData(await api('/api/sample', { method: 'POST' }))
    toast('Sample payroll loaded')
    go('overview')
  } catch (err) { toast(err.message, true) } finally { e.target.disabled = false }
})
$('#clearBtn').addEventListener('click', async () => {
  if (!confirm('Delete ALL employee records? This cannot be undone.')) return
  try { setData(await api('/api/employees', { method: 'DELETE' })); toast('All employees deleted') } catch (err) { toast(err.message, true) }
})

/* ---------- Voice assistant ---------- */
const assistant = $('#assistant')
const chat = $('#chat')
const history = []
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
let recognizer = null
let listening = false
let busy = false

function openAssistant() {
  assistant.classList.add('open')
  assistant.setAttribute('aria-hidden', 'false')
  document.body.classList.add('assistant-open')
  if (!chat.children.length) {
    addMessage('assistant', 'Hello, I am the Inspector. Ask me about suspicious employees, salary at risk, or what corrective action to take. Tap the microphone to speak.')
  }
  setTimeout(() => $('#questionInput').focus(), 300)
}
function closeAssistant() {
  assistant.classList.remove('open')
  assistant.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('assistant-open')
  stopListening()
  speechSynthesis?.cancel()
}
$$('[data-open-assistant]').forEach((b) => b.addEventListener('click', openAssistant))
$('#closeAssistant').addEventListener('click', closeAssistant)
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && assistant.classList.contains('open') && !dialog.open) closeAssistant() })

function addMessage(role, text, cls = '') {
  const el = document.createElement('div')
  el.className = `msg ${role} ${cls}`.trim()
  el.textContent = text
  if (role === 'assistant' && !cls && 'speechSynthesis' in window) {
    const replay = document.createElement('button')
    replay.className = 'replay'
    replay.textContent = '🔊 Play'
    replay.addEventListener('click', () => speak(text, true))
    el.appendChild(replay)
  }
  chat.appendChild(el)
  chat.scrollTop = chat.scrollHeight
  return el
}

function setStatus(text, live = false) {
  const s = $('#voiceStatus')
  s.textContent = text
  s.classList.toggle('live', live)
}

function speak(text, force = false) {
  if (!('speechSynthesis' in window) || (!force && !$('#speakReplies').checked)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1
  const voices = speechSynthesis.getVoices()
  const voice = voices.find((v) => v.lang?.startsWith(navigator.language?.slice(0, 2) || 'en') && /natural|google|samantha|daniel/i.test(v.name))
    || voices.find((v) => v.lang?.startsWith('en'))
  if (voice) u.voice = voice
  u.onstart = () => setStatus('Speaking… tap the mic to interrupt.')
  u.onend = () => setStatus('Tap the microphone and ask about your payroll.')
  speechSynthesis.speak(u)
}

async function ask(question) {
  question = question.trim()
  if (!question || busy) return
  busy = true
  speechSynthesis?.cancel()
  addMessage('user', question)
  const thinking = addMessage('assistant', 'Investigating', 'thinking')
  setStatus('Checking the payroll…')
  try {
    const { answer } = await api('/api/assistant', { method: 'POST', body: { question, history } })
    thinking.remove()
    addMessage('assistant', answer)
    history.push({ role: 'user', content: question }, { role: 'assistant', content: answer })
    setStatus('Tap the microphone and ask about your payroll.')
    speak(answer)
  } catch (err) {
    thinking.remove()
    addMessage('assistant', err.message)
    setStatus('Something went wrong. Try again.')
  } finally {
    busy = false
  }
}

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault()
  const input = $('#questionInput')
  ask(input.value)
  input.value = ''
})
$('#prompts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent) })

function stopListening() {
  if (recognizer && listening) recognizer.stop()
}

if (!Recognition) {
  $('#micBtn').disabled = true
  $('#micBtn').title = 'Voice input is not supported in this browser — try Chrome, Edge or Safari.'
  setStatus('Voice input isn’t supported in this browser. Type your question instead.')
} else {
  $('#micBtn').addEventListener('click', () => {
    if (listening) return stopListening()
    speechSynthesis?.cancel()
    recognizer = new Recognition()
    recognizer.lang = navigator.language || 'en-US'
    recognizer.interimResults = true
    recognizer.continuous = false
    let interimEl = null
    let finalText = ''

    recognizer.onstart = () => {
      listening = true
      $('#micBtn').classList.add('listening')
      setStatus('Listening… speak now.', true)
    }
    recognizer.onresult = (ev) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      const shown = (finalText + ' ' + interim).trim()
      if (shown) {
        interimEl ??= addMessage('user', '', 'interim')
        interimEl.textContent = shown
        chat.scrollTop = chat.scrollHeight
      }
    }
    recognizer.onerror = (ev) => {
      const msg = ev.error === 'not-allowed' ? 'Microphone permission was denied. Allow it in your browser settings.'
        : ev.error === 'no-speech' ? 'I didn’t hear anything. Tap the mic and try again.'
        : `Voice error: ${ev.error}`
      setStatus(msg)
    }
    recognizer.onend = () => {
      listening = false
      $('#micBtn').classList.remove('listening')
      interimEl?.remove()
      if (finalText.trim()) ask(finalText)
      else if (!$('#voiceStatus').textContent.startsWith('Voice error') && !$('#voiceStatus').textContent.includes('permission') && !$('#voiceStatus').textContent.includes('didn’t hear')) {
        setStatus('Tap the microphone and ask about your payroll.')
      }
    }
    try { recognizer.start() } catch { setStatus('Could not start the microphone.') }
  })
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {}

/* ---------- Init ---------- */
$('#today').textContent = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
refresh()
