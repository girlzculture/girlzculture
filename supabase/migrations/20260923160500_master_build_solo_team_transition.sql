-- Project a confirmed active team entitlement into the public operator label.
-- This does not purchase a plan, alter a provider or grant an entitlement itself.
begin;
create table public.business_operator_transitions (
 id uuid primary key default gen_random_uuid(),
 salon_id uuid not null references public.salons(id) on delete restrict,
 previous_operator text not null,
 new_operator text not null check(new_operator='team'),
 previous_plan text,
 new_plan text not null,
 subscription_id uuid not null references public.subscriptions(id) on delete restrict,
 actor_id uuid references auth.users(id),
 source text not null default 'active_subscription_record',
 created_at timestamptz not null default now()
);
alter table public.business_operator_transitions enable row level security;
revoke all on public.business_operator_transitions from public,anon,authenticated;
grant select,insert on public.business_operator_transitions to service_role;
create function public.master_sync_team_operator() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare business public.salons%rowtype;
begin
 if new.tier not in ('Starter','Growth','Premium','Basic') or lower(new.status) not in ('active','trialing') then return new;end if;
 select * into business from public.salons where id=new.salon_id for update;
 if not found or business.operator_type is distinct from 'solo' then return new;end if;
 -- Existing verified subscription routes are authoritative. Scheduled or failed
 -- requests never change the tier and therefore never grant team capacity here.
 update public.salons set operator_type='team' where id=business.id;
 insert into public.business_operator_transitions(salon_id,previous_operator,new_operator,previous_plan,new_plan,subscription_id,actor_id)
 values(business.id,'solo','team',case when tg_op='UPDATE' then old.tier else business.subscription_tier end,new.tier,new.id,auth.uid());
 return new;
end $$;
revoke all on function public.master_sync_team_operator() from public,anon,authenticated;
create trigger master_sync_team_operator after insert or update of tier,status on public.subscriptions for each row execute function public.master_sync_team_operator();
update public.engine_settings set published_value='"20260923160500"'::jsonb,draft_value='"20260923160500"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
commit;
