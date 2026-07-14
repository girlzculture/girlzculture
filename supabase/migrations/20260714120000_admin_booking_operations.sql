-- Immutable audit trail for platform-admin booking operations.
create extension if not exists pgcrypto;

create table if not exists public.booking_audit_log (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action text not null check (action in ('created','modified','rescheduled','status_changed','cancelled','refunded')),
  reason text,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists booking_audit_log_booking_idx on public.booking_audit_log(booking_id, created_at desc);
create index if not exists booking_audit_log_actor_idx on public.booking_audit_log(actor_user_id, created_at desc);
alter table public.booking_audit_log enable row level security;
drop policy if exists booking_audit_log_admin_read on public.booking_audit_log;
create policy booking_audit_log_admin_read on public.booking_audit_log for select to authenticated using (public.admin_has_permission('bookings'));
-- Browser clients never insert or alter audit rows; protected server routes use service role.

comment on table public.booking_audit_log is 'Append-only before/after audit records for every platform-admin booking mutation.';
