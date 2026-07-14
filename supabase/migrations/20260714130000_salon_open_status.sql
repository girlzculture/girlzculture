-- Same-day owner closure override. Normal published hours remain the default.
alter table public.salons add column if not exists is_closed_override boolean not null default false;
alter table public.salons add column if not exists closed_override_date date;
alter table public.salons add column if not exists closed_override_updated_at timestamptz;
alter table public.salons add constraint salons_closed_override_date_required
  check (not is_closed_override or closed_override_date is not null) not valid;
alter table public.salons validate constraint salons_closed_override_date_required;
create index if not exists salons_closed_override_idx on public.salons(closed_override_date) where is_closed_override;
comment on column public.salons.closed_override_date is 'Salon-local calendar date explicitly closed by the owner; ignored on later dates.';
