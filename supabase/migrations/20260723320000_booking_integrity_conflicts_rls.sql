begin;

-- Internal booking-conflict quarantine/audit records are never read directly
-- by customers or salon users. Keep the table in the exposed public schema for
-- the existing integrity functions, but deny browser roles and require trusted
-- server-side access.
alter table public.booking_integrity_conflicts
  enable row level security;

revoke all on table public.booking_integrity_conflicts
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.booking_integrity_conflicts
  to service_role;

comment on table public.booking_integrity_conflicts is
  'Internal booking-integrity conflict audit. Direct anon/authenticated access is intentionally denied; trusted server operations use service_role.';

commit;
