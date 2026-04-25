-- TMS Vault — members table
-- Run this once in the Supabase Dashboard: SQL Editor → New query → paste → Run

CREATE TABLE IF NOT EXISTS members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        UNIQUE NOT NULL,
  first_name TEXT        NOT NULL DEFAULT '',
  last_name  TEXT        NOT NULL DEFAULT '',
  services   TEXT[]      NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security — members may only SELECT their own row
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_select_own"
  ON members
  FOR SELECT
  USING (auth.email() = email);

-- Allow the service-role to manage all rows (used server-side)
CREATE POLICY "service_role_all"
  ON members
  FOR ALL
  USING     (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── After running the above, add members like this: ─────────────
-- INSERT INTO members (email, first_name, last_name, services)
-- VALUES
--   ('tom@example.com', 'Tom', 'Smith', ARRAY['Health Share', 'FICA', 'Cash Discount']),
--   ('jane@example.com', 'Jane', 'Doe',  ARRAY['FICA', 'Payroll', 'Benefits']);

-- ── Supabase Dashboard settings ─────────────────────────────────
-- Authentication → URL Configuration:
--   Site URL:              https://vault.tms-solutions-group.com   (or http://localhost:3099 for dev)
--   Redirect URLs (add):   https://vault.tms-solutions-group.com/dashboard
--                          http://localhost:3099/dashboard
-- Authentication → Providers → Email:
--   ✓ Enable Email provider
--   ✓ Disable sign-ups  (so only pre-seeded members can sign in)
