begin;

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
  return 'GC'||v_letters||lpad(v_suffix::text,2,'0');
end;
$$;

alter table public.bookings drop constraint if exists bookings_public_reference_format;

-- Existing GC-A-01 references become GCA01; UUIDs and all relationships are
-- unchanged. The previous format is unique, so this transformation is unique.
update public.bookings
set public_reference=replace(public_reference,'-','')
where public_reference ~ '^GC-[A-Z]+-[0-9]{2}$';

alter table public.bookings add constraint bookings_public_reference_format
  check(public_reference ~ '^GC[A-Z]+[0-9]{2}$');

comment on column public.bookings.public_reference is
  'Compact unique display/search reference (GCA01 onward). Never an authorization credential.';
comment on function public.booking_public_reference_from_number(bigint) is
  'Concurrency-safe sequence mapping: GCA01-GCA99, GCB01, through GCZ99, GCAA01 and onward.';

commit;
