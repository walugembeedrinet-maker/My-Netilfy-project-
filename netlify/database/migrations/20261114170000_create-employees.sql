CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  national_id TEXT,
  bank_account TEXT,
  phone TEXT,
  department TEXT,
  position TEXT,
  salary NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  hire_date DATE,
  termination_date DATE,
  last_attendance DATE,
  last_paid DATE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX employees_bank_account_idx ON employees (bank_account);
CREATE INDEX employees_national_id_idx ON employees (national_id);
