-- Booking-linked conversations and customer appointment preferences.

alter table public.bookings
  add column if not exists client_notes text,
  add column if not exists client_provides_material boolean not null default false,
  add column if not exists material_price_adjustment numeric(10,2) not null default 0,
  add column if not exists material_duration_adjustment_minutes integer not null default 0;

alter table public.styles
  add column if not exists own_material_price_reduction numeric(10,2) not null default 0,
  add column if not exists own_material_duration_reduction_minutes integer not null default 0;

create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','salon','admin')),
  body text not null check (char_length(body) between 1 and 2000),
  read_by_customer_at timestamptz,
  read_by_salon_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists booking_messages_booking_created_idx
  on public.booking_messages (booking_id, created_at);
create index if not exists booking_messages_salon_created_idx
  on public.booking_messages (salon_id, created_at desc);

alter table public.booking_messages enable row level security;

drop policy if exists "Booking participants read messages" on public.booking_messages;
create policy "Booking participants read messages"
on public.booking_messages for select to authenticated
using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_messages.booking_id
      and (
        b.customer_id = auth.uid()
        or exists (select 1 from public.salons s where s.id = b.salon_id and s.user_id = auth.uid())
        or public.salon_has_permission(b.salon_id, 'bookings')
        or public.admin_has_permission('support')
      )
  )
);

-- Inserts are deliberately performed by the authorized server route. This
-- prevents clients from spoofing sender roles or another booking participant.
revoke insert, update, delete on public.booking_messages from anon, authenticated;
grant select on public.booking_messages to authenticated;

comment on table public.booking_messages is
  'Private conversations tied to a real booking; participants are authorized server-side and by RLS.';
