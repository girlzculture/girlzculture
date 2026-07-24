begin;

create table if not exists public.platform_error_affected_businesses (
  event_id uuid not null references public.platform_error_events(id) on delete cascade,
  salon_id uuid not null references public.salons(id) on delete cascade,
  occurrence_count integer not null default 1 check(occurrence_count between 1 and 1000000),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(event_id,salon_id)
);
alter table public.platform_error_affected_businesses enable row level security;
drop policy if exists platform_error_affected_businesses_admin_read
  on public.platform_error_affected_businesses;
create policy platform_error_affected_businesses_admin_read
  on public.platform_error_affected_businesses for select to authenticated
  using(public.admin_has_permission('settings'));
revoke all on table public.platform_error_affected_businesses from anon,authenticated;
grant select on table public.platform_error_affected_businesses to authenticated;
create index if not exists platform_error_affected_businesses_last_idx
  on public.platform_error_affected_businesses(last_seen_at desc,event_id);

create or replace function public.track_platform_error_affected_business()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.salon_id is not null then
    insert into public.platform_error_affected_businesses(
      event_id,salon_id,occurrence_count,first_seen_at,last_seen_at
    ) values(
      new.id,new.salon_id,
      greatest(1,new.occurrence_count-
        case when tg_op='UPDATE' then old.occurrence_count else 0 end),
      coalesce(new.first_occurred_at,now()),coalesce(new.last_occurred_at,now())
    )
    on conflict(event_id,salon_id) do update set
      occurrence_count=least(
        public.platform_error_affected_businesses.occurrence_count+
          greatest(1,new.occurrence_count-
            case when tg_op='UPDATE' then old.occurrence_count else 0 end),
        1000000
      ),
      last_seen_at=greatest(
        public.platform_error_affected_businesses.last_seen_at,
        excluded.last_seen_at
      );
  end if;
  return new;
end;
$$;
drop trigger if exists track_platform_error_affected_business
  on public.platform_error_events;
create trigger track_platform_error_affected_business
after insert or update of occurrence_count,salon_id on public.platform_error_events
for each row execute function public.track_platform_error_affected_business();

insert into public.platform_error_affected_businesses(
  event_id,salon_id,occurrence_count,first_seen_at,last_seen_at
)
select id,salon_id,occurrence_count,first_occurred_at,last_occurred_at
from public.platform_error_events
where salon_id is not null
on conflict(event_id,salon_id) do nothing;

alter table public.salon_promotion_audit
  drop constraint if exists salon_promotion_audit_promotion_id_fkey;
alter table public.salon_promotion_audit
  drop constraint if exists salon_promotion_audit_salon_id_fkey;
alter table public.salon_promotion_audit
  add column if not exists promotion_title_snapshot text,
  add column if not exists salon_name_snapshot text,
  add column if not exists city_snapshot text,
  add column if not exists state_snapshot text,
  add column if not exists zip_snapshot text;
comment on column public.salon_promotion_audit.promotion_id is
  'Immutable promotion identifier snapshot. Deliberately has no live foreign key so deletion history survives.';
comment on column public.salon_promotion_audit.salon_id is
  'Immutable salon identifier snapshot. Business and location labels remain available after deletion.';

create or replace function public.audit_salon_promotion_change()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_promotion public.salon_promotions;
  v_salon public.salons;
begin
  v_promotion:=case when tg_op='DELETE' then old else new end;
  select * into v_salon from public.salons where id=v_promotion.salon_id;
  insert into public.salon_promotion_audit(
    promotion_id,salon_id,action,before_values,after_values,acting_user_id,
    promotion_title_snapshot,salon_name_snapshot,city_snapshot,state_snapshot,
    zip_snapshot
  ) values(
    v_promotion.id,
    v_promotion.salon_id,
    case
      when tg_op='INSERT' then 'Created'
      when tg_op='DELETE' then 'Deleted'
      when new.status is distinct from old.status then new.status
      else 'Edited'
    end,
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end,
    auth.uid(),
    v_promotion.title,v_salon.name,v_salon.address_city,v_salon.address_state,
    v_salon.address_zip
  );
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

commit;
