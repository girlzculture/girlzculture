begin;

create sequence if not exists public.booking_public_reference_seq
  as bigint start with 1 increment by 1 no minvalue no maxvalue cache 20;

alter table public.bookings
  add column if not exists public_reference text;

create or replace function public.booking_public_reference_from_number(p_value bigint)
returns text
language plpgsql
immutable
strict
set search_path=public
as $$
declare
  v_block bigint;
  v_suffix integer;
  v_letters text:='';
  v_cursor bigint;
begin
  if p_value<1 then
    raise exception using errcode='22023',message='BOOKING_REFERENCE_VALUE_INVALID';
  end if;
  v_block:=(p_value-1)/99;
  v_suffix:=((p_value-1)%99+1)::integer;
  v_cursor:=v_block+1;
  while v_cursor>0 loop
    v_cursor:=v_cursor-1;
    v_letters:=chr(65+(v_cursor%26)::integer)||v_letters;
    v_cursor:=v_cursor/26;
  end loop;
  return 'GC-'||v_letters||'-'||lpad(v_suffix::text,2,'0');
end;
$$;

create or replace function public.next_booking_public_reference()
returns text
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_reference text;
begin
  loop
    v_reference:=public.booking_public_reference_from_number(
      nextval('public.booking_public_reference_seq')
    );
    exit when not exists(
      select 1 from public.bookings where public_reference=v_reference
    );
  end loop;
  return v_reference;
end;
$$;

update public.bookings
set public_reference=public.next_booking_public_reference()
where public_reference is null;

alter table public.bookings
  alter column public_reference set default public.next_booking_public_reference(),
  alter column public_reference set not null;

alter table public.bookings
  drop constraint if exists bookings_public_reference_format;
alter table public.bookings
  add constraint bookings_public_reference_format
  check(public_reference ~ '^GC-[A-Z]+-[0-9]{2}$');

create unique index if not exists bookings_public_reference_unique
  on public.bookings(public_reference);
create index if not exists bookings_public_reference_search_idx
  on public.bookings(public_reference text_pattern_ops);

create or replace function public.set_booking_public_reference()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.public_reference is null or trim(new.public_reference)='' then
    new.public_reference:=public.next_booking_public_reference();
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_public_reference on public.bookings;
create trigger bookings_public_reference
before insert on public.bookings
for each row execute function public.set_booking_public_reference();

revoke all on sequence public.booking_public_reference_seq
  from public,anon,authenticated;
revoke all on function public.next_booking_public_reference()
  from public,anon,authenticated;
grant usage,select on sequence public.booking_public_reference_seq
  to service_role;
grant execute on function public.next_booking_public_reference()
  to service_role;

comment on column public.bookings.public_reference is
  'Unique customer-safe display and search reference. The internal UUID remains the authorization key.';
comment on function public.booking_public_reference_from_number(bigint) is
  'Deterministically maps sequence values to GC-A-01 through GC-A-99, GC-B-01, and onward.';

commit;
