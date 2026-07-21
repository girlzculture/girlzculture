begin;

create table if not exists public.test_data_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check(length(trim(name)) between 3 and 100),
  environment text not null check(environment in ('development','preview','production')),
  status text not null default 'Open' check(status in ('Open','Partially cleared','Cleared')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  cleared_at timestamptz
);
create table if not exists public.test_data_registry (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.test_data_batches(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  record_label text not null,
  metadata jsonb not null default '{}'::jsonb,
  registered_by uuid references auth.users(id) on delete set null,
  registered_at timestamptz not null default now(),
  unique(record_type,record_id)
);
create table if not exists public.test_data_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.test_data_batches(id) on delete restrict,
  selected_types text[] not null,
  preview jsonb not null,
  result jsonb not null,
  status text not null check(status in ('Completed','Partially completed','Failed')),
  executed_by uuid references auth.users(id) on delete set null,
  executed_at timestamptz not null default now()
);
create index if not exists test_data_registry_batch_type_idx on public.test_data_registry(batch_id,record_type,registered_at);
create index if not exists test_data_cleanup_runs_batch_idx on public.test_data_cleanup_runs(batch_id,executed_at desc);

alter table public.test_data_batches enable row level security;
alter table public.test_data_registry enable row level security;
alter table public.test_data_cleanup_runs enable row level security;
drop policy if exists test_data_batches_admin_read on public.test_data_batches;
drop policy if exists test_data_registry_admin_read on public.test_data_registry;
drop policy if exists test_data_runs_admin_read on public.test_data_cleanup_runs;
create policy test_data_batches_admin_read on public.test_data_batches for select to authenticated using(public.admin_has_permission('settings'));
create policy test_data_registry_admin_read on public.test_data_registry for select to authenticated using(public.admin_has_permission('settings'));
create policy test_data_runs_admin_read on public.test_data_cleanup_runs for select to authenticated using(public.admin_has_permission('settings'));

create or replace function public.execute_test_batch_cleanup(
  p_batch_id uuid,
  p_selected_types text[],
  p_actor_user_id uuid,
  p_confirmation text,
  p_preview jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_batch public.test_data_batches%rowtype;
  v_entry public.test_data_registry%rowtype;
  v_enabled boolean:=false;
  v_actions jsonb:='[]'::jsonb;
  v_action text;
  v_id uuid;
  v_remaining integer;
  v_run_id uuid;
begin
  if not exists(select 1 from public.admin_users where coalesce(user_id,id)=p_actor_user_id and status='Active' and is_super_admin) then raise exception 'Only a Super Admin can clear labeled test data.'; end if;
  select coalesce((published_value #>> '{}')::boolean,false) into v_enabled from public.engine_settings where setting_key='maintenance.test_data_enabled' and status='Published';
  if not v_enabled then raise exception 'Enable the Test-data maintenance tool in The Engine before clearing a batch.'; end if;
  select * into v_batch from public.test_data_batches where id=p_batch_id for update;
  if not found then raise exception 'Test batch not found.'; end if;
  if p_confirmation is distinct from ('DELETE '||v_batch.name) then raise exception 'Type the required batch confirmation exactly.'; end if;
  if v_batch.environment='production' and p_confirmation is distinct from ('DELETE '||v_batch.name) then raise exception 'Production test batches require exact confirmation.'; end if;

  for v_entry in select * from public.test_data_registry where batch_id=p_batch_id and record_type=any(p_selected_types) order by case record_type when 'support_ticket' then 1 when 'review' then 2 when 'booking' then 3 when 'salon_product' then 4 when 'salon_promotion' then 5 when 'style' then 6 when 'stylist' then 7 when 'salon_application' then 8 when 'featured_campaign' then 9 when 'trending_campaign' then 10 when 'promo_code' then 11 when 'newsletter_subscriber' then 12 when 'blog_post' then 13 when 'location_market' then 14 when 'salon' then 15 else 50 end for update
  loop
    v_id:=v_entry.record_id::uuid;v_action:='Skipped: unsupported protected record';
    if v_entry.record_type='support_ticket' then delete from public.support_tickets where id=v_id;v_action:='Deleted test support request';
    elsif v_entry.record_type='review' then delete from public.reviews where id=v_id;v_action:='Deleted test review';
    elsif v_entry.record_type='booking' then
      if exists(select 1 from public.bookings where id=v_id and (lower(coalesce(deposit_status,'')) in ('paid','succeeded','refunded') or coalesce(stripe_payment_id,'')<>'')) then update public.bookings set status='Cancelled',guest_name='Test customer removed',guest_email=null,guest_phone=null where id=v_id;v_action:='Anonymized and retained paid test booking';
      else delete from public.bookings where id=v_id;v_action:='Deleted unpaid test booking';end if;
    elsif v_entry.record_type='salon_product' then delete from public.salon_products where id=v_id;v_action:='Deleted test product';
    elsif v_entry.record_type='salon_promotion' then delete from public.salon_promotions where id=v_id;v_action:='Deleted test promotion';
    elsif v_entry.record_type='style' then if exists(select 1 from public.bookings where style_id=v_id) then update public.styles set archived_at=now() where id=v_id;v_action:='Archived service with booking history';else delete from public.styles where id=v_id;v_action:='Deleted test service';end if;
    elsif v_entry.record_type='stylist' then if exists(select 1 from public.bookings where stylist_id=v_id) then update public.stylists set archived_at=now() where id=v_id;v_action:='Archived stylist with booking history';else delete from public.stylists where id=v_id;v_action:='Deleted test stylist';end if;
    elsif v_entry.record_type='salon_application' then delete from public.salon_applications where id=v_id;v_action:='Deleted test application';
    elsif v_entry.record_type='featured_campaign' then update public.featured_salon_campaigns set status='Paused',updated_at=now() where id=v_id;v_action:='Paused and retained featured campaign audit';
    elsif v_entry.record_type='trending_campaign' then update public.trending_video_campaigns set status='Draft',updated_at=now() where id=v_id;v_action:='Drafted and retained trending campaign audit';
    elsif v_entry.record_type='promo_code' then if exists(select 1 from public.promo_code_redemptions where promo_code_id=v_id) then update public.promo_codes set is_active=false,archived_at=now(),updated_at=now() where id=v_id;v_action:='Archived promo code with redemption history';else delete from public.promo_codes where id=v_id;v_action:='Deleted unused test promo code';end if;
    elsif v_entry.record_type='newsletter_subscriber' then delete from public.newsletter_subscribers where id=v_id;v_action:='Deleted test subscriber';
    elsif v_entry.record_type='blog_post' then delete from public.blog_posts where id=v_id;v_action:='Deleted test blog post';
    elsif v_entry.record_type='location_market' then if exists(select 1 from public.salons where market_id=v_id) then update public.location_markets set is_active=false,archived_at=now(),updated_at=now() where id=v_id;v_action:='Archived market assigned to salons';else delete from public.location_markets where id=v_id;v_action:='Deleted unused test market';end if;
    elsif v_entry.record_type='salon' then update public.salons set status='Offboarded',is_discoverable=false where id=v_id;v_action:='Offboarded test salon; retained required history';
    end if;
    if v_action not like 'Skipped:%' then delete from public.test_data_registry where id=v_entry.id;end if;
    v_actions:=v_actions||jsonb_build_array(jsonb_build_object('record_type',v_entry.record_type,'record_id',v_entry.record_id,'label',v_entry.record_label,'action',v_action));
  end loop;
  select count(*) into v_remaining from public.test_data_registry where batch_id=p_batch_id;
  update public.test_data_batches set status=case when v_remaining=0 then 'Cleared' else 'Partially cleared' end,cleared_at=case when v_remaining=0 then now() else null end where id=p_batch_id;
  insert into public.test_data_cleanup_runs(batch_id,selected_types,preview,result,status,executed_by) values(p_batch_id,p_selected_types,coalesce(p_preview,'{}'::jsonb),jsonb_build_object('actions',v_actions,'remaining',v_remaining),case when v_remaining=0 then 'Completed' else 'Partially completed' end,p_actor_user_id) returning id into v_run_id;
  return jsonb_build_object('run_id',v_run_id,'batch_id',p_batch_id,'actions',v_actions,'remaining',v_remaining);
end $$;
revoke all on function public.execute_test_batch_cleanup(uuid,text[],uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.execute_test_batch_cleanup(uuid,text[],uuid,text,jsonb) to service_role;

commit;
