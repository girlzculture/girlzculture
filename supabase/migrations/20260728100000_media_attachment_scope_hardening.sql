-- Scope automatic media attachment to the record owner or salon.
--
-- The original trigger searched the complete NEW row for a staged public URL,
-- but did not prove that the matching media asset belonged to the same salon
-- or authorization scope. Keep the backwards-compatible trigger (needed when
-- a new parent record is saved after a staged upload), while preventing a URL
-- copied from another salon or non-admin account from changing that account's
-- media inventory. Editorial assets may move between two currently authorized
-- administrators because Content Management supports collaborative editing.

begin;

alter table public.blog_posts
  add column if not exists updated_by uuid references auth.users(id)
    on delete set null;

create or replace function public.attach_registered_media()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_record_id text;
  v_salon_id uuid;
  v_owner_id uuid;
  v_admin_permission text;
begin
  v_record_id := coalesce(
    v_row ->> 'id',
    v_row ->> 'slug',
    v_row ->> 'section_key',
    ''
  );

  if tg_table_name = 'salons' then
    v_salon_id := nullif(v_row ->> 'id', '')::uuid;
  elsif tg_table_name in (
    'styles',
    'stylists',
    'salon_products',
    'reviews'
  ) then
    v_salon_id := nullif(v_row ->> 'salon_id', '')::uuid;
  end if;

  if tg_table_name = 'reviews' then
    v_owner_id := nullif(v_row ->> 'customer_id', '')::uuid;
  elsif tg_table_name in (
    'content_pages',
    'blog_posts',
    'homepage_sections'
  ) then
    v_owner_id := nullif(v_row ->> 'updated_by', '')::uuid;
  end if;

  if tg_table_name in ('content_pages', 'blog_posts') then
    v_admin_permission := 'content';
  elsif tg_table_name = 'homepage_sections' then
    v_admin_permission := 'marketing';
  end if;

  update public.media_assets media
  set status = 'Attached',
      attached_record_type = tg_table_name,
      attached_record_id = v_record_id,
      archived_at = null
  where media.status = 'Staged'
    and position(media.public_url in v_row::text) > 0
    and (
      (
        tg_table_name in ('salons', 'styles', 'stylists', 'salon_products')
        and v_salon_id is not null
        and media.salon_id = v_salon_id
      )
      or (
        tg_table_name = 'reviews'
        and v_owner_id is not null
        and media.owner_user_id = v_owner_id
        and (
          media.salon_id is null
          or media.salon_id = v_salon_id
        )
      )
      or (
        tg_table_name in ('content_pages', 'blog_posts', 'homepage_sections')
        and v_owner_id is not null
        and media.bucket_id = 'content-media'
        and media.salon_id is null
        and exists (
          select 1
          from public.admin_users saving_administrator
          where coalesce(
              saving_administrator.user_id,
              saving_administrator.id
            ) = v_owner_id
            and coalesce(saving_administrator.status, 'Active') = 'Active'
            and (
              coalesce(saving_administrator.is_super_admin, false)
              or coalesce(
                saving_administrator.permissions ->> v_admin_permission,
                'false'
              ) = 'true'
              or coalesce(
                saving_administrator.permissions ->> 'settings',
                'false'
              ) = 'true'
            )
        )
        and exists (
          select 1
          from public.admin_users asset_owner_administrator
          where coalesce(
              asset_owner_administrator.user_id,
              asset_owner_administrator.id
            ) = media.owner_user_id
            and coalesce(
              asset_owner_administrator.status,
              'Active'
            ) = 'Active'
            and (
              coalesce(
                asset_owner_administrator.is_super_admin,
                false
              )
              or coalesce(
                asset_owner_administrator.permissions
                  ->> v_admin_permission,
                'false'
              ) = 'true'
              or coalesce(
                asset_owner_administrator.permissions ->> 'settings',
                'false'
              ) = 'true'
            )
        )
      )
    );

  return new;
end
$$;

revoke all on function public.attach_registered_media()
  from public, anon, authenticated;

comment on function public.attach_registered_media() is
  'Attaches only staged media owned by the same salon or review customer, or by an active authorized platform administrator when another active authorized platform administrator saves editorial content.';

commit;
