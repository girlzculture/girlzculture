-- Localization completion: preserve original booking messages whenever a
-- sender explicitly previews and sends a translated version.

alter table if exists public.booking_messages
  add column if not exists original_body text,
  add column if not exists translated_body text,
  add column if not exists translation_locale text,
  add column if not exists translation_provider text,
  add column if not exists translation_previewed_at timestamptz;

update public.booking_messages
set original_body = body
where original_body is null;

alter table if exists public.booking_messages
  alter column original_body set not null;

do $$
begin
  if to_regclass('public.booking_messages') is not null
     and not exists (
       select 1 from pg_constraint
       where conrelid = 'public.booking_messages'::regclass
         and conname = 'booking_messages_translation_pair_check'
     ) then
    alter table public.booking_messages
      add constraint booking_messages_translation_pair_check
      check (
        (translated_body is null and translation_locale is null and translation_previewed_at is null)
        or
        (
          char_length(translated_body) between 1 and 2000
          and translation_locale ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'
          and translation_previewed_at is not null
        )
      );
  end if;
end $$;

comment on column public.booking_messages.original_body is
  'The sender-authored message. This is always retained even when a translated preview is sent.';
comment on column public.booking_messages.translated_body is
  'Optional provider-assisted translation explicitly previewed by the sender before send.';

