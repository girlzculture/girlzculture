-- NULL = all services (backwards compatible); {} = no assigned services.
alter table public.stylists add column assigned_service_ids uuid[];
comment on column public.stylists.assigned_service_ids is 'Own-business services offered for new appointments. NULL includes all current and future services; an empty array includes none.';

create function public.validate_professional_service_assignments() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='UPDATE' and new.salon_id is distinct from old.salon_id then raise exception 'PROFESSIONAL_BUSINESS_IMMUTABLE'; end if;
  if tg_op='INSERT' or (new.assigned_service_ids,new.is_active,new.is_draft,new.archived_at) is distinct from (old.assigned_service_ids,old.is_active,old.is_draft,old.archived_at) then
    -- Same lock as reservation insertion. A change cannot race the final check.
    perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||new.salon_id::text,0));
  end if;
  if (tg_op='INSERT' and new.assigned_service_ids is not null) or (tg_op='UPDATE' and new.assigned_service_ids is distinct from old.assigned_service_ids) then
    if auth.role()='authenticated' and not (public.salon_has_permission(new.salon_id,'stylists') and public.salon_has_permission(new.salon_id,'styles')) and not public.admin_has_permission('salons') then
      raise insufficient_privilege using message='PROFESSIONAL_ASSIGNMENT_FORBIDDEN';
    end if;
    if cardinality(new.assigned_service_ids)>1000 or exists(select 1 from unnest(new.assigned_service_ids) as assignment(service_id) where assignment.service_id is null or not exists(select 1 from public.styles s where s.id=assignment.service_id and s.salon_id=new.salon_id)) then
      raise check_violation using message='PROFESSIONAL_SERVICE_SCOPE_INVALID';
    end if;
    if new.assigned_service_ids is not null then new.assigned_service_ids:=array(select distinct assignment.service_id from unnest(new.assigned_service_ids) as assignment(service_id) order by assignment.service_id); end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_professional_service_assignments() from public,anon,authenticated;
create trigger validate_professional_services before insert or update on public.stylists for each row execute function public.validate_professional_service_assignments();

create function public.guard_checkout_professional_service() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare professional public.stylists%rowtype;
begin
  -- Do not invalidate payment completion or booked terms after a later edit.
  if tg_op='UPDATE' and (new.salon_id,new.style_id,new.stylist_id,new.appointment_datetime) is not distinct from (old.salon_id,old.style_id,old.stylist_id,old.appointment_datetime) and not (new.status='Pending' and old.status<>'Pending') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('p0-calendar:'||new.salon_id::text,0));
  if new.style_id is not null and not exists(select 1 from public.styles where id=new.style_id and salon_id=new.salon_id) then raise check_violation using message='PROFESSIONAL_SERVICE_UNAVAILABLE'; end if;
  if new.stylist_id is not null then
    select * into professional from public.stylists where id=new.stylist_id and salon_id=new.salon_id;
    if not found or professional.is_active is false or professional.is_draft is true or professional.archived_at is not null
      or (professional.assigned_service_ids is not null and not coalesce(new.style_id=any(professional.assigned_service_ids),false)) then
      raise check_violation using message='PROFESSIONAL_SERVICE_UNAVAILABLE';
    end if;
  elsif exists(select 1 from public.stylists where salon_id=new.salon_id and archived_at is null and assigned_service_ids is not null) then
    -- A null stylist must not bypass explicitly configured assignments.
    raise check_violation using message='PROFESSIONAL_SERVICE_UNAVAILABLE';
  end if;
  return new;
end $$;
revoke all on function public.guard_checkout_professional_service() from public,anon,authenticated;
create trigger ab_professional_service before insert or update on public.booking_checkout_intents for each row execute function public.guard_checkout_professional_service();

update public.engine_settings set published_value='"20260918112223"'::jsonb,draft_value='"20260918112223"'::jsonb,updated_at=now() where setting_key='integrations.expected_migration';
