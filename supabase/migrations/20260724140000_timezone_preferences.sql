begin;

alter table public.admin_users
  add column if not exists time_zone text not null default 'America/New_York';

create or replace function public.validate_time_zone_preference()
returns trigger
language plpgsql
set search_path=public,pg_catalog
as $$
begin
  begin
    perform now() at time zone new.time_zone;
  exception when invalid_parameter_value then
    raise exception 'INVALID_TIME_ZONE';
  end;
  return new;
end;
$$;

drop trigger if exists validate_admin_time_zone on public.admin_users;
create trigger validate_admin_time_zone
before insert or update of time_zone on public.admin_users
for each row execute function public.validate_time_zone_preference();

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
)
values(
  'localization.default_admin_time_zone',
  'localization',
  'Default platform-admin timezone',
  'Timezone used for platform activity when an administrator has not selected a personal preference.',
  'text',
  '"America/New_York"',
  '"America/New_York"',
  'Published',
  'operational',
  '{"format":"iana_timezone","maxLength":80}',
  'Use a valid IANA timezone such as America/New_York. Stored timestamps remain UTC.',
  'Affects future admin display and exports; it does not rewrite stored timestamps.',
  false,
  false,
  45,
  array['Admin dashboards','Admin finance','Admin audit trails','Admin exports']
)
on conflict(setting_key) do update set
  description=excluded.description,
  validation=excluded.validation,
  help_text=excluded.help_text,
  impact_description=excluded.impact_description,
  affected_surfaces=excluded.affected_surfaces;

commit;
