alter table public.support_tickets
  add column if not exists admin_read_at timestamptz,
  add column if not exists admin_read_by uuid references auth.users(id) on delete set null;

create index if not exists support_tickets_admin_unread_idx
  on public.support_tickets (category, created_at desc)
  where admin_read_at is null;
