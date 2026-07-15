begin;

insert into public.service_categories(slug, name, description, is_active)
values
  ('braiding', 'Braiding', 'Braided and protective styles.', true),
  ('kids', 'Kids', 'Services designed for children.', true),
  ('locs', 'Locs', 'Loc installation, styling, and maintenance.', true),
  ('mens', E'Men\'s', E'Men\'s grooming and protective styles.', true),
  ('natural-hair', 'Natural Hair', 'Natural hair care and styling.', true),
  ('twists', 'Twists', 'Protective twist services.', true),
  ('weaves', 'Weaves', 'Weave installation and maintenance.', true)
on conflict (slug) do update
set name = excluded.name, description = excluded.description, is_active = true, updated_at = now();

create table if not exists public.service_groups (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, name)
);

create table if not exists public.service_addons (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, name)
);

insert into public.service_groups(category_id, name)
select distinct master.category_id, trim(master.category)
from public.master_styles master
where master.category_id is not null and nullif(trim(master.category), '') is not null
on conflict (category_id, name) do nothing;

insert into public.service_groups(category_id, name)
select category.id, seed.group_name
from (values
  ('braiding', 'Protective Styles'), ('kids', 'Kids Styles'),
  ('locs', 'Locs'), ('mens', E'Men\'s Styles'),
  ('natural-hair', 'Natural Hair'), ('twists', 'Twists'),
  ('weaves', 'Weaves')
) as seed(category_slug, group_name)
join public.service_categories category on category.slug = seed.category_slug
on conflict (category_id, name) do update set is_active = true, updated_at = now();

insert into public.service_addons(category_id, name)
select category.id, seed.name
from public.service_categories category
cross join (values
  ('Beads'), ('Boho Curls'), ('Color'), ('Curly Ends'),
  ('Hair Jewelry'), ('Other'), ('Scalp Treatment'),
  ('Take-down/removal'), ('Wash & blow-dry')
) as seed(name)
where category.slug = 'braiding'
on conflict (category_id, name) do update set is_active = true, updated_at = now();

alter table public.master_styles
  add column if not exists service_group_id uuid references public.service_groups(id) on delete restrict;

update public.master_styles master
set service_group_id = groups.id
from public.service_groups groups
where master.service_group_id is null
  and groups.category_id = master.category_id
  and lower(groups.name) = lower(master.category);

alter table public.master_styles alter column service_group_id set not null;
create index if not exists master_styles_group_name_idx on public.master_styles(service_group_id, name);
create index if not exists service_groups_category_name_idx on public.service_groups(category_id, name);
create index if not exists service_addons_category_name_idx on public.service_addons(category_id, name);

create or replace function public.validate_master_service_catalog()
returns trigger language plpgsql security invoker set search_path = public as $$
declare managed_group record;
begin
  new.name := trim(new.name);
  select groups.id, groups.name, groups.category_id
  into managed_group
  from public.service_groups groups
  join public.service_categories categories on categories.id = groups.category_id
  where groups.id = new.service_group_id and groups.is_active and categories.is_active;
  if not found then
    raise exception 'Choose an active service group.' using errcode = '23514';
  end if;
  new.category := managed_group.name;
  new.category_id := managed_group.category_id;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists master_styles_validate_catalog on public.master_styles;
create trigger master_styles_validate_catalog
before insert or update of name, category, category_id, service_group_id
on public.master_styles for each row execute function public.validate_master_service_catalog();

update public.master_styles master
set service_group_id = groups.id
from public.service_groups groups
join public.service_categories category on category.id = groups.category_id
where (master.category = 'Braids' and master.name not in (E'Kids\' Braids', E'Men\'s Braids') and category.slug = 'braiding' and groups.name = 'Protective Styles')
   or (master.category = 'Locs' and category.slug = 'locs' and groups.name = 'Locs')
   or (master.category = 'Twists' and category.slug = 'twists' and groups.name = 'Twists')
   or (master.name = E'Kids\' Braids' and category.slug = 'kids' and groups.name = 'Kids Styles')
   or (master.name = E'Men\'s Braids' and category.slug = 'mens' and groups.name = E'Men\'s Styles');

insert into public.master_styles(name, category, category_id, service_group_id, is_active, sort_order)
select seed.name, groups.name, groups.category_id, groups.id, true, 0
from (values
  ('Knotless Braids', 'braiding', 'Protective Styles'), ('Box Braids', 'braiding', 'Protective Styles'),
  ('Cornrows', 'braiding', 'Protective Styles'), ('Boho Braids', 'braiding', 'Protective Styles'),
  ('Crochet Braids', 'braiding', 'Protective Styles'), ('Feed-in Braids', 'braiding', 'Protective Styles'),
  ('Fulani Braids', 'braiding', 'Protective Styles'), ('Lemonade Braids', 'braiding', 'Protective Styles'),
  ('Stitch Braids', 'braiding', 'Protective Styles'), ('Locs', 'locs', 'Locs'),
  ('Goddess Locs', 'locs', 'Locs'), ('Faux Locs', 'locs', 'Locs'),
  ('Passion Twists', 'twists', 'Twists'), ('Senegalese Twists', 'twists', 'Twists')
) as seed(name, category_slug, group_name)
join public.service_categories category on category.slug = seed.category_slug
join public.service_groups groups on groups.category_id = category.id and groups.name = seed.group_name
on conflict ((lower(name))) do update
set service_group_id = excluded.service_group_id,
    category_id = excluded.category_id,
    category = excluded.category,
    is_active = true,
    updated_at = now();

update public.service_groups groups
set is_active = false, updated_at = now()
where groups.name in ('Braids', 'Locs', 'Twists')
  and groups.category_id = (select id from public.service_categories where slug = 'braiding')
  and not exists (select 1 from public.master_styles master where master.service_group_id = groups.id);

create or replace function public.sync_service_group_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.master_styles set category = new.name, updated_at = now() where service_group_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists service_groups_sync_master_styles on public.service_groups;
create trigger service_groups_sync_master_styles
after update of name on public.service_groups
for each row execute function public.sync_service_group_name();

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
  where managed.id = new.master_style_id and managed.is_active and category.is_active;
  if not found then
    raise exception 'Choose a service from the active managed catalog.' using errcode = '23514';
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
  end if;
  for option_row in select value from jsonb_array_elements(coalesce(new.addons,'[]'::jsonb)) loop
    if not exists (
      select 1 from public.service_addons addon
      where addon.category_id = master.category_id
        and addon.is_active
        and lower(addon.name) = lower(coalesce(option_row->>'label', option_row->>'value',''))
    ) then
      raise exception 'Choose add-ons from the active managed catalog.' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

alter table public.service_groups enable row level security;
alter table public.service_addons enable row level security;

drop policy if exists service_groups_public_read on public.service_groups;
create policy service_groups_public_read on public.service_groups for select to anon, authenticated
using (is_active or public.admin_has_permission('content'));
drop policy if exists service_groups_admin_write on public.service_groups;
create policy service_groups_admin_write on public.service_groups for all to authenticated
using (public.admin_has_permission('content')) with check (public.admin_has_permission('content'));

drop policy if exists service_addons_public_read on public.service_addons;
create policy service_addons_public_read on public.service_addons for select to anon, authenticated
using (is_active or public.admin_has_permission('content'));
drop policy if exists service_addons_admin_write on public.service_addons;
create policy service_addons_admin_write on public.service_addons for all to authenticated
using (public.admin_has_permission('content')) with check (public.admin_has_permission('content'));

grant select on public.service_groups, public.service_addons to anon, authenticated;
grant insert, update, delete on public.service_groups, public.service_addons to authenticated;

commit;
