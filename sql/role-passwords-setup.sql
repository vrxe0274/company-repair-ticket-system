-- role_passwords: bcrypt-hashed per-role password overrides.
--
-- When a row exists for a role, verify-login uses the stored hash instead of
-- the ADMIN_PASSWORD / STAFF_PASSWORD / TECH_PASSWORD env secrets. This lets
-- Admin and Technician change their shared password at runtime via the
-- change-password Edge Function without needing a CLI secrets-set + redeploy.
--
-- No public RLS policies — only the service-role key (Edge Functions) can
-- read or write this table.
--
-- Run once in the Supabase SQL editor or via migration.

create table if not exists role_passwords (
  role          text        primary key,
  password_hash text        not null,
  updated_at    timestamptz not null default now(),
  constraint role_passwords_role_check
    check (role in ('Admin', 'Staff', 'Technician'))
);

alter table role_passwords enable row level security;
-- (intentionally no public policies)
