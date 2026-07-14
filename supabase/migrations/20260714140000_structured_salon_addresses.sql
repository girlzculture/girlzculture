-- Structured US salon addresses; neighborhood is retained only for historical compatibility.
alter table public.salons add column if not exists address_line2 text;
alter table public.salon_applications add column if not exists address_line2 text;

-- Trigger validation is intentionally used instead of a NOT VALID check constraint.
-- It validates every new/changed address without blocking unrelated edits to legacy rows
-- that may still contain a full state name.
create or replace function public.validate_salon_structured_us_address()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  state_value text;
  zip_value text;
begin
  state_value := upper(trim(new.address_state));
  zip_value := trim(new.address_zip);

  if state_value is not null and state_value <> '' and state_value not in
    ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY') then
    raise exception using errcode = '22023', message = 'State must be a valid two-letter US state code.';
  end if;

  if zip_value is not null and zip_value <> '' and zip_value !~ '^\d{5}(-\d{4})?$' then
    raise exception using errcode = '22023', message = 'ZIP code must use 12345 or 12345-6789 format.';
  end if;

  new.address_state := nullif(state_value, '');
  new.address_zip := nullif(zip_value, '');
  return new;
end;
$$;

create or replace function public.validate_application_structured_us_address()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  state_value text := upper(trim(new.state));
  zip_value text := trim(new.zip_code);
begin
  if state_value is not null and state_value <> '' and state_value not in
    ('AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY') then
    raise exception using errcode = '22023', message = 'State must be a valid two-letter US state code.';
  end if;
  if zip_value is not null and zip_value <> '' and zip_value !~ '^\d{5}(-\d{4})?$' then
    raise exception using errcode = '22023', message = 'ZIP code must use 12345 or 12345-6789 format.';
  end if;
  new.state := state_value;
  new.zip_code := zip_value;
  return new;
end;
$$;

drop trigger if exists salons_validate_structured_address on public.salons;
create trigger salons_validate_structured_address
before insert or update of address_state, address_zip on public.salons
for each row execute function public.validate_salon_structured_us_address();

drop trigger if exists salon_applications_validate_structured_address on public.salon_applications;
create trigger salon_applications_validate_structured_address
before insert or update of state, zip_code on public.salon_applications
for each row execute function public.validate_application_structured_us_address();

drop function if exists public.validate_structured_us_address();

comment on column public.salons.address_street is 'Address line 1';
comment on column public.salons.address_line2 is 'Address line 2, suite, floor, or unit';
