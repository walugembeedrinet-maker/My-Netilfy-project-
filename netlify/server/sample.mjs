// Demo payroll with deliberately planted ghost-worker patterns. Dates are relative to today.
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

export function sampleEmployees() {
  const base = [
    ['EMP001', 'Grace Nakato', 'CM9001A11', '0110234561', '0772100001', 'Finance', 'Accountant', 2400000, 'active', 1500, null, 2, 5, true],
    ['EMP002', 'John Okello', 'CM9001A12', '0110234562', '0772100002', 'Finance', 'Clerk', 1100000, 'active', 900, null, 1, 5, true],
    ['EMP003', 'Sarah Achieng', 'CF9001A13', '0110234563', '0772100003', 'Finance', 'Clerk', 1150000, 'active', 700, null, 3, 5, true],
    ['EMP004', 'Peter Mugisha', 'CM9001A14', '0110234564', '0772100004', 'Operations', 'Supervisor', 1800000, 'active', 2000, null, 1, 5, true],
    ['EMP005', 'Ruth Namuli', 'CF9001A15', '0110234565', '0772100005', 'Operations', 'Driver', 900000, 'active', 400, null, 2, 5, true],
    ['EMP006', 'David Ssempala', 'CM9001A16', '0110234566', '0772100006', 'Operations', 'Driver', 950000, 'active', 380, null, 4, 5, true],
    ['EMP007', 'Esther Atim', 'CF9001A17', '0110234567', '0772100007', 'Operations', 'Storekeeper', 1000000, 'active', 600, null, 1, 5, true],
    ['EMP008', 'Moses Kato', 'CM9001A18', '0110234568', '0772100008', 'Human Resources', 'HR Officer', 1700000, 'active', 1200, null, 1, 5, true],
    ['EMP009', 'Brenda Akello', 'CF9001A19', '0110234569', '0772100009', 'Human Resources', 'Assistant', 1000000, 'active', 300, null, 2, 5, true],
    ['EMP010', 'Isaac Waiswa', 'CM9001A20', '0110234570', '0772100010', 'Human Resources', 'Assistant', 980000, 'active', 250, null, 1, 5, true],
    // Ghost patterns
    ['EMP011', 'Joseph Lubega', 'CM9001A21', '0110234562', '0772100011', 'Operations', 'Driver', 950000, 'active', 200, null, 140, 5, false], // shares John's bank account, long absence
    ['EMP012', 'Agnes Nansubuga', null, null, null, 'Finance', 'Clerk', 1200000, 'active', 120, null, null, 5, false], // no identifiers, never attended
    ['EMP013', 'Henry Byaruhanga', 'CM9001A23', '0110234573', '0772100013', 'Operations', 'Loader', 900000, 'terminated', 1800, 120, 125, 5, true], // terminated but still paid
    ['EMP014', 'Grace Nakato', 'CM9001A11', '0110234574', '0772100014', 'Operations', 'Clerk', 1100000, 'active', 150, null, 65, 5, false], // duplicate name + national ID
    ['EMP015', 'Simon Opio', 'CM9001A25', '0110234575', '0772100008', 'Human Resources', 'Consultant', 5200000, 'active', 90, null, 40, 5, false], // salary outlier, shares HR officer phone
    ['EMP016', 'Lydia Nambi', 'CF9001A26', '0110234576', '0772100016', 'Finance', 'Auditor', 1300000, 'terminated', 1000, 200, 210, 200, true], // properly exited
  ]
  return base.map(([code, name, nid, bank, phone, dept, pos, salary, status, hiredAgo, termAgo, attAgo, paidAgo, verified]) => ({
    employee_code: code,
    full_name: name,
    national_id: nid,
    bank_account: bank,
    phone,
    department: dept,
    position: pos,
    salary,
    status,
    hire_date: ago(hiredAgo),
    termination_date: termAgo == null ? null : ago(termAgo),
    last_attendance: attAgo == null ? null : ago(attAgo),
    last_paid: ago(paidAgo),
    verified,
    notes: null,
  }))
}
