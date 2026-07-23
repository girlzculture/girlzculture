-- Section 4: centrally managed style names and structured pricing inputs.
begin;

create table if not exists public.master_styles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists master_styles_name_unique_idx on public.master_styles(lower(name));
create index if not exists master_styles_active_order_idx on public.master_styles(is_active, sort_order, name);

insert into public.master_styles(name, category, sort_order)
values
  ('Knotless Braids','Braids',10), ('Box Braids','Braids',20), ('Cornrows','Braids',30),
  ('Locs','Locs',40), ('Goddess Locs','Locs',50), ('Feed-in Braids','Braids',60),
  ('Boho Braids','Braids',70), ('Fulani/Tribal Braids','Braids',80), ('Passion Twists','Twists',90),
  ('Senegalese Twists','Twists',100), ('Kinky Twists','Twists',110), ('Butterfly Locs','Locs',120),
  ('Faux Locs','Locs',130), ('Stitch Braids','Braids',140), ('Lemonade Braids','Braids',150),
  ('Crochet Braids','Braids',160), ('Micro Braids','Braids',170), ('Kids'' Braids','Braids',180),
  ('Men''s Braids','Braids',190), ('Two-Strand Twists','Twists',200)
on conflict ((lower(name))) do update set category = excluded.category, sort_order = excluded.sort_order;

-- Preserve unmatched legacy services without silently converting their names.
insert into public.master_styles(name, category, is_active, sort_order)
select distinct trim(style.name), coalesce(nullif(trim(style.category),''),'Legacy'), false, 10000
from public.styles style
where nullif(trim(style.name),'') is not null
  and not exists (select 1 from public.master_styles master where lower(master.name) = lower(trim(style.name)))
on conflict ((lower(name))) do nothing;

alter table public.styles add column if not exists master_style_id uuid references public.master_styles(id);
update public.styles style
set master_style_id = master.id
from public.master_styles master
where style.master_style_id is null and lower(master.name) = lower(trim(style.name));
alter table public.styles alter column master_style_id set not null;
create index if not exists styles_master_style_idx on public.styles(master_style_id, salon_id);

alter table public.style_materials add column if not exists longevity_weeks smallint;
alter table public.style_materials add column if not exists quality_grade text;
update public.style_materials
set longevity_weeks = nullif(substring(coalesce(longevity,'') from '[0-9]+'),'')::smallint
where longevity_weeks is null and coalesce(longevity,'') ~ '[0-9]+';
update public.style_materials set quality_grade = initcap(quality_note)
where quality_grade is null and lower(coalesce(quality_note,'')) in ('good','better','best','luxury');

alter table public.style_materials drop constraint if exists style_materials_longevity_weeks_check;
alter table public.style_materials add constraint style_materials_longevity_weeks_check check (longevity_weeks is null or longevity_weeks between 1 and 12);
alter table public.style_materials drop constraint if exists style_materials_quality_grade_check;
alter table public.style_materials add constraint style_materials_quality_grade_check check (quality_grade is null or quality_grade in ('Good','Better','Best','Luxury'));

create or replace function public.validate_structured_style()
returns trigger language plpgsql security invoker set search_path = public as $$
declare master record; option_row jsonb;
begin
  select * into master from public.master_styles where id = new.master_style_id;
  if master.id is null then raise exception 'Choose a style from the managed master list.' using errcode = '23514'; end if;
  new.name := master.name;
  new.category := master.category;
  for option_row in select value from jsonb_array_elements(coalesce(new.size_options,'[]'::jsonb)) loop
    if coalesce(option_row->>'label', option_row->>'value','') not in ('X-Small','Small','Small-Medium','Medium','Large','Jumbo') then
      raise exception 'Invalid size option.' using errcode = '23514';
    end if;
  end loop;
  for option_row in select value from jsonb_array_elements(coalesce(new.length_options,'[]'::jsonb)) loop
    if coalesce(option_row->>'label', option_row->>'value','') not in ('Shoulder','Bra-strap','Mid-back','Waist','Butt/Hip','Tailbone','Classic','Mid-thigh','Knee') then
      raise exception 'Invalid length option.' using errcode = '23514';
    end if;
  end loop;
  for option_row in select value from jsonb_array_elements(coalesce(new.addons,'[]'::jsonb)) loop
    if coalesce(option_row->>'label', option_row->>'value','') not in ('Boho curls','Beads','Color','Curly ends','Wash & blow-dry','Scalp treatment','Take-down/removal','Kids'' style','Men''s style')
      and coalesce(option_row->>'label', option_row->>'value','') not like 'Other: %' then
      raise exception 'Invalid add-on option.' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists styles_validate_structured_input on public.styles;
create trigger styles_validate_structured_input before insert or update of master_style_id, name, category, size_options, length_options, addons
on public.styles for each row execute function public.validate_structured_style();

create or replace function public.validate_structured_material()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.name not in ('Kanekalon (standard)','X-Pression (premium)','Pre-stretched (premium)','Human hair (luxury)','Client provides own hair') then
    raise exception 'Choose a material from the managed list.' using errcode = '23514';
  end if;
  if new.longevity_weeks is null or new.longevity_weeks not between 1 and 12 then raise exception 'Choose longevity from 1 to 12 weeks.' using errcode = '23514'; end if;
  if new.quality_grade is null or new.quality_grade not in ('Good','Better','Best','Luxury') then raise exception 'Choose a valid quality grade.' using errcode = '23514'; end if;
  new.longevity := new.longevity_weeks || case when new.longevity_weeks = 1 then ' week' else ' weeks' end;
  new.quality_note := new.quality_grade;
  return new;
end $$;

drop trigger if exists style_materials_validate_structured_input on public.style_materials;
create trigger style_materials_validate_structured_input before insert or update on public.style_materials
for each row execute function public.validate_structured_material();

create or replace function public.replace_style_materials(p_style_id uuid, p_materials jsonb)
returns setof public.style_materials
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_style(p_style_id) and not public.is_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  delete from public.style_materials where style_id = p_style_id;
  insert into public.style_materials(style_id, name, price, longevity_weeks, quality_grade, longevity, quality_note)
  select
    p_style_id,
    value->>'name',
    coalesce((value->>'price')::numeric,0),
    (value->>'longevity_weeks')::smallint,
    value->>'quality_grade',
    (value->>'longevity_weeks') || case when (value->>'longevity_weeks')::smallint = 1 then ' week' else ' weeks' end,
    value->>'quality_grade'
  from jsonb_array_elements(coalesce(p_materials,'[]'::jsonb));
  return query select * from public.style_materials where style_id = p_style_id order by created_at;
end $$;
revoke all on function public.replace_style_materials(uuid,jsonb) from public;
grant execute on function public.replace_style_materials(uuid,jsonb) to authenticated;

create or replace function public.propagate_master_style_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name or new.category is distinct from old.category then
    update public.styles set name = new.name, category = new.category where master_style_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists master_styles_propagate_name on public.master_styles;
create trigger master_styles_propagate_name after update of name, category on public.master_styles
for each row execute function public.propagate_master_style_name();

update public.stylists set bio = left(bio, 250) where length(coalesce(bio,'')) > 250;
alter table public.stylists drop constraint if exists stylists_bio_length_check;
alter table public.stylists add constraint stylists_bio_length_check check (length(coalesce(bio,'')) <= 250);

create or replace function public.validate_stylist_specialties()
returns trigger language plpgsql security invoker set search_path = public as $$
declare specialty text;
begin
  for specialty in select value from jsonb_array_elements_text(coalesce(to_jsonb(new.specialties),'[]'::jsonb)) loop
    if not exists (select 1 from public.master_styles where is_active and name = specialty) then
      raise exception 'Choose stylist specialties from the managed style list.' using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists stylists_validate_specialties on public.stylists;
create trigger stylists_validate_specialties before insert or update of specialties, bio on public.stylists
for each row execute function public.validate_stylist_specialties();

create or replace function public.validate_salon_store_hours()
returns trigger language plpgsql security invoker set search_path = public as $$
declare day text; slot jsonb;
begin
  if new.hours is null then return new; end if;
  foreach day in array array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] loop
    slot := new.hours::jsonb -> day;
    if slot is null then continue; end if;
    if jsonb_typeof(slot) <> 'object' then raise exception 'Store hours must use the open, close, and closed pickers.' using errcode = '23514'; end if;
    if coalesce((slot->>'closed')::boolean,false) = false then
      if coalesce(slot->>'open','') !~ '^(?:[01][0-9]|2[0-3]):(?:00|15|30|45)$' or coalesce(slot->>'close','') !~ '^(?:[01][0-9]|2[0-3]):(?:00|15|30|45)$' then
        raise exception 'Store hours must use 15-minute picker values.' using errcode = '23514';
      end if;
      if slot->>'open' >= slot->>'close' then raise exception 'Closing time must be after opening time.' using errcode = '23514'; end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists salons_validate_store_hours on public.salons;
create trigger salons_validate_store_hours before insert or update of hours on public.salons
for each row execute function public.validate_salon_store_hours();

alter table public.master_styles enable row level security;
drop policy if exists master_styles_public_read on public.master_styles;
create policy master_styles_public_read on public.master_styles for select to anon, authenticated using (is_active or public.is_admin());
drop policy if exists master_styles_admin_write on public.master_styles;
create policy master_styles_admin_write on public.master_styles for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;
