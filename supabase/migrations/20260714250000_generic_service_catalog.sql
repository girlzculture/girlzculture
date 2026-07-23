-- Section 11: generic, category-aware service catalog and booking options.
-- Braiding remains the only active category today, but category rules no longer
-- leak into the shared catalog or checkout model.
begin;

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.service_categories(slug, name, description, sort_order, is_active)
values ('braiding', 'Braiding', 'Braided styles, locs, twists, and related protective services.', 10, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = now();

alter table public.master_styles
  add column if not exists category_id uuid references public.service_categories(id);
alter table public.styles
  add column if not exists category_id uuid references public.service_categories(id),
  add column if not exists option_groups jsonb not null default '[]'::jsonb;

update public.master_styles
set category_id = (select id from public.service_categories where slug = 'braiding')
where category_id is null;
update public.styles style
set category_id = master.category_id
from public.master_styles master
where style.master_style_id = master.id
  and style.category_id is distinct from master.category_id;

alter table public.master_styles alter column category_id set not null;
alter table public.styles alter column category_id set not null;
create index if not exists master_styles_category_idx on public.master_styles(category_id, is_active, sort_order);
create index if not exists styles_category_idx on public.styles(category_id, salon_id);

alter table public.bookings
  add column if not exists selected_options jsonb not null default '{}'::jsonb;

alter table public.style_materials
  add column if not exists option_type text not null default 'material',
  add column if not exists metadata jsonb not null default '{}'::jsonb;
update public.style_materials set price = 0 where coalesce(price, 0) < 0;
alter table public.style_materials drop constraint if exists style_materials_longevity_weeks_check;
alter table public.style_materials add constraint style_materials_longevity_weeks_check
  check (longevity_weeks is null or longevity_weeks between 1 and 520);
alter table public.style_materials drop constraint if exists style_materials_quality_grade_check;
alter table public.style_materials add constraint style_materials_quality_grade_check
  check (quality_grade is null or length(quality_grade) between 1 and 80);
alter table public.style_materials drop constraint if exists style_materials_price_nonnegative_check;
alter table public.style_materials add constraint style_materials_price_nonnegative_check check (coalesce(price, 0) >= 0);
alter table public.style_materials drop constraint if exists style_materials_option_type_check;
alter table public.style_materials add constraint style_materials_option_type_check check (option_type ~ '^[a-z][a-z0-9_-]{0,39}$');

create or replace function public.validate_structured_style()
returns trigger language plpgsql security invoker set search_path = public as $$
declare
  master record;
  option_row jsonb;
  group_row jsonb;
begin
  select managed.id, managed.name, managed.category, managed.category_id, category.slug as category_slug
  into master
  from public.master_styles managed
  join public.service_categories category on category.id = managed.category_id
  where managed.id = new.master_style_id and category.is_active;
  if not found then
    raise exception 'Choose a service from an active managed category.' using errcode = '23514';
  end if;

  new.name := master.name;
  new.category := master.category;
  new.category_id := master.category_id;

  if jsonb_typeof(coalesce(new.option_groups, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'Service option groups must be an array.' using errcode = '23514';
  end if;
  for group_row in select value from jsonb_array_elements(coalesce(new.option_groups, '[]'::jsonb)) loop
    if coalesce(trim(group_row->>'id'), '') !~ '^[a-z][a-z0-9_-]{0,39}$'
      or coalesce(trim(group_row->>'label'), '') = ''
      or coalesce(group_row->>'selection', 'single') not in ('single', 'multiple')
      or jsonb_typeof(coalesce(group_row->'options', '[]'::jsonb)) is distinct from 'array' then
      raise exception 'A service option group is invalid.' using errcode = '23514';
    end if;
    for option_row in select value from jsonb_array_elements(coalesce(group_row->'options', '[]'::jsonb)) loop
      if coalesce(trim(option_row->>'value'), trim(option_row->>'label'), '') = ''
        or coalesce(nullif(option_row->>'price_add','')::numeric, 0) < 0
        or abs(coalesce(nullif(option_row->>'duration_add_minutes','')::integer, 0)) > 1440 then
        raise exception 'A service option is invalid.' using errcode = '23514';
      end if;
    end loop;
  end loop;

  -- The presets below are a Braiding category rule, not a platform-wide rule.
  if master.category_slug = 'braiding' then
    for option_row in select value from jsonb_array_elements(coalesce(new.size_options,'[]'::jsonb)) loop
      if coalesce(option_row->>'label', option_row->>'value','') not in ('X-Small','Small','Small-Medium','Medium','Large','Jumbo') then
        raise exception 'Invalid braiding size option.' using errcode = '23514';
      end if;
    end loop;
    for option_row in select value from jsonb_array_elements(coalesce(new.length_options,'[]'::jsonb)) loop
      if coalesce(option_row->>'label', option_row->>'value','') not in ('Shoulder','Bra-strap','Mid-back','Waist','Butt/Hip','Tailbone','Classic','Mid-thigh','Knee') then
        raise exception 'Invalid braiding length option.' using errcode = '23514';
      end if;
    end loop;
    for option_row in select value from jsonb_array_elements(coalesce(new.addons,'[]'::jsonb)) loop
      if coalesce(option_row->>'label', option_row->>'value','') not in ('Boho curls','Beads','Color','Curly ends','Wash & blow-dry','Scalp treatment','Take-down/removal','Kids'' style','Men''s style')
        and coalesce(option_row->>'label', option_row->>'value','') not like 'Other: %' then
        raise exception 'Invalid braiding add-on option.' using errcode = '23514';
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists styles_validate_structured_input on public.styles;
create trigger styles_validate_structured_input
before insert or update of master_style_id, name, category, category_id, size_options, length_options, addons, option_groups
on public.styles for each row execute function public.validate_structured_style();

create or replace function public.validate_structured_material()
returns trigger language plpgsql security invoker set search_path = public as $$
declare category_slug text;
begin
  select category.slug into category_slug
  from public.styles style
  join public.service_categories category on category.id = style.category_id
  where style.id = new.style_id;
  if not found then raise exception 'The service category could not be verified.' using errcode = '23514'; end if;

  new.name := trim(coalesce(new.name, ''));
  if new.name = '' then raise exception 'Enter an option name.' using errcode = '23514'; end if;
  if coalesce(new.price, 0) < 0 then raise exception 'Option price cannot be negative.' using errcode = '23514'; end if;

  if category_slug = 'braiding' then
    if new.name not in ('Kanekalon (standard)','X-Pression (premium)','Pre-stretched (premium)','Human hair (luxury)','Client provides own hair') then
      raise exception 'Choose a material from the managed braiding list.' using errcode = '23514';
    end if;
    if new.longevity_weeks is null or new.longevity_weeks not between 1 and 12 then
      raise exception 'Choose braiding longevity from 1 to 12 weeks.' using errcode = '23514';
    end if;
    if new.quality_grade is null or new.quality_grade not in ('Good','Better','Best','Luxury') then
      raise exception 'Choose a valid braiding quality grade.' using errcode = '23514';
    end if;
  end if;

  if new.longevity_weeks is not null then
    new.longevity := new.longevity_weeks || case when new.longevity_weeks = 1 then ' week' else ' weeks' end;
  end if;
  if new.quality_grade is not null then new.quality_note := new.quality_grade; end if;
  return new;
end $$;

create or replace function public.replace_style_materials(p_style_id uuid, p_materials jsonb)
returns setof public.style_materials
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_style(p_style_id) and not public.is_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  delete from public.style_materials where style_id = p_style_id;
  insert into public.style_materials(
    style_id, name, price, longevity_weeks, quality_grade, longevity, quality_note, option_type, metadata
  )
  select
    p_style_id,
    value->>'name',
    coalesce((value->>'price')::numeric,0),
    nullif(value->>'longevity_weeks','')::smallint,
    nullif(value->>'quality_grade',''),
    case when nullif(value->>'longevity_weeks','') is null then null else
      (value->>'longevity_weeks') || case when (value->>'longevity_weeks')::smallint = 1 then ' week' else ' weeks' end end,
    nullif(value->>'quality_grade',''),
    coalesce(nullif(value->>'option_type',''), 'material'),
    coalesce(value->'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_materials,'[]'::jsonb));
  return query select * from public.style_materials where style_id = p_style_id order by created_at;
end $$;
revoke all on function public.replace_style_materials(uuid,jsonb) from public;
grant execute on function public.replace_style_materials(uuid,jsonb) to authenticated;

create or replace function public.propagate_master_style_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name
    or new.category is distinct from old.category
    or new.category_id is distinct from old.category_id then
    update public.styles
    set name = new.name, category = new.category, category_id = new.category_id
    where master_style_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists master_styles_propagate_name on public.master_styles;
create trigger master_styles_propagate_name
after update of name, category, category_id on public.master_styles
for each row execute function public.propagate_master_style_name();

alter table public.service_categories enable row level security;
drop policy if exists service_categories_public_read on public.service_categories;
create policy service_categories_public_read on public.service_categories
for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists service_categories_admin_write on public.service_categories;
create policy service_categories_admin_write on public.service_categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.service_categories to anon, authenticated;
grant insert, update, delete on public.service_categories to authenticated;

commit;
