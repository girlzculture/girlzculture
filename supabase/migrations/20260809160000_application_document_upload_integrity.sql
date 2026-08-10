-- Durable salon-application supporting-document lifecycle.
--
-- A signed Storage URL is not proof that an object was uploaded, verified, or
-- selected by its owner.  This registry makes prepare -> finalize -> attach a
-- database-enforced state machine.  The application trigger is the final
-- authority, including when a caller bypasses the HTTP route.

begin;

create table if not exists public.application_document_uploads (
  id uuid primary key,
  -- Keep the registry row after identity/salon deletion until the bounded
  -- cleanup job removes its private Storage object. Cascading this evidence
  -- would orphan the object with no authoritative storage_path to clean.
  user_id uuid references auth.users(id) on delete set null,
  salon_id uuid references public.salons(id) on delete set null,
  application_id uuid references public.salon_applications(id) on delete set null,
  bucket_id text not null default 'application-documents',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  status text not null default 'Prepared',
  prepared_at timestamptz not null default now(),
  finalized_at timestamptz,
  attached_at timestamptz,
  abandoned_at timestamptz,
  expired_at timestamptz,
  cleaned_at timestamptz,
  expires_at timestamptz default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_document_uploads_bucket_check
    check (bucket_id = 'application-documents'),
  constraint application_document_uploads_mime_check
    check (mime_type in ('application/pdf','image/jpeg','image/png')),
  constraint application_document_uploads_size_check
    check (size_bytes > 0 and size_bytes <= 10485760),
  constraint application_document_uploads_status_check
    check (status in ('Prepared','Finalized','Attached','Abandoned','Expired'))
);

create unique index if not exists application_document_uploads_path_unique
  on public.application_document_uploads(storage_path);
create index if not exists application_document_uploads_owner_active_idx
  on public.application_document_uploads(user_id,status,expires_at);
create index if not exists application_document_uploads_cleanup_idx
  on public.application_document_uploads(status,expires_at)
  where cleaned_at is null;
create index if not exists application_document_uploads_application_idx
  on public.application_document_uploads(application_id)
  where application_id is not null;

alter table public.application_document_uploads enable row level security;
revoke all on public.application_document_uploads from public,anon,authenticated;
grant select,insert,update,delete on public.application_document_uploads to service_role;

comment on table public.application_document_uploads is
  'Private authoritative prepare/finalize/attach registry for salon-application supporting documents.';

-- Preserve legitimate documents attached before this registry existed.  The
-- backfill only populates the new table and never changes an application or a
-- Storage object.
do $$
begin
  if exists (
    select 1
    from (
      select
        trim(document_path) storage_path,
        count(distinct application.id) application_count,
        count(distinct application.user_id) owner_count,
        count(distinct application.salon_id) salon_count
      from public.salon_applications application
      cross join lateral unnest(coalesce(application.document_urls,array[]::text[]))
        as documents(document_path)
      where trim(document_path)<>''
      group by trim(document_path)
    ) duplicate
    where duplicate.application_count>1
       or duplicate.owner_count>1
       or duplicate.salon_count>1
  ) then
    raise exception using errcode='23505',
      message='A legacy application document path is assigned to more than one application. Reconcile the duplicate path before applying this migration.';
  end if;

  if exists (
    select 1
    from public.salon_applications application
    cross join lateral unnest(coalesce(application.document_urls,array[]::text[]))
      as documents(document_path)
    where trim(document_path)<>''
      and (
        application.user_id is null
        or trim(document_path)<>document_path
        or position('..' in document_path)>0
        or document_path !~ (
          '^' || application.user_id::text
          || '/documents/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[^/]+$'
        )
      )
  ) then
    raise exception using errcode='22023',
      message='A legacy application document path is malformed or outside its owner folder. Reconcile the path before applying this migration.';
  end if;
end;
$$;

insert into public.application_document_uploads(
  id,user_id,salon_id,application_id,storage_path,file_name,mime_type,
  size_bytes,status,prepared_at,finalized_at,attached_at,expires_at,
  created_at,updated_at
)
select distinct on (document_path)
  gen_random_uuid(),application.user_id,application.salon_id,application.id,
  document_path,
  left(coalesce(nullif(regexp_replace(document_path,'^.*/',''),''),'legacy-document'),120),
  case
    when lower(document_path) like '%.pdf' then 'application/pdf'
    when lower(document_path) like '%.png' then 'image/png'
    else 'image/jpeg'
  end,
  1,'Attached',application.submitted_at,application.submitted_at,
  application.submitted_at,null,application.submitted_at,now()
from public.salon_applications application
cross join lateral unnest(coalesce(application.document_urls,array[]::text[]))
  as documents(document_path)
where trim(document_path)<>''
on conflict (storage_path) do nothing;

create or replace function public.prepare_application_document_upload(
  p_upload_id uuid,
  p_user_id uuid,
  p_salon_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_active_count integer;
  v_upload public.application_document_uploads%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('application-document:' || p_user_id::text,0)
  );

  if not exists (
    select 1
    from public.salons salon
    join public.platform_identities identity
      on identity.user_id=salon.user_id
    where salon.id=p_salon_id
      and salon.user_id=p_user_id
      and identity.status='Active'
      and identity.primary_role='salon_owner'
  ) then
    raise exception using errcode='42501',
      message='Sign in with the salon-owner account that owns this application.';
  end if;
  if p_upload_id is null or p_storage_path is null or p_file_name is null
     or trim(coalesce(p_storage_path,''))<>p_user_id::text || '/documents/' || p_upload_id::text || '-' || trim(coalesce(p_file_name,''))
     or position('..' in p_storage_path)>0
     or position('/' in substring(p_storage_path from length(p_user_id::text || '/documents/' || p_upload_id::text || '-') + 1))>0 then
    raise exception using errcode='22023',
      message='The supporting-document upload reference is invalid.';
  end if;
  if lower(coalesce(p_mime_type,'')) not in ('application/pdf','image/jpeg','image/png')
     or p_size_bytes is null or p_size_bytes<=0 or p_size_bytes>10485760 then
    raise exception using errcode='22023',
      message='Upload a PDF, JPG, or PNG supporting document no larger than 10 MB.';
  end if;

  update public.application_document_uploads
  set status='Expired',expired_at=coalesce(expired_at,now()),updated_at=now()
  where user_id=p_user_id
    and status in ('Prepared','Finalized')
    and expires_at<=now();

  select count(*) into v_active_count
  from public.application_document_uploads
  where user_id=p_user_id
    and status in ('Prepared','Finalized')
    and expires_at>now();
  if v_active_count>=5 then
    raise exception using errcode='22023',
      message='You can have up to five pending supporting documents. Remove one before uploading another.';
  end if;

  insert into public.application_document_uploads(
    id,user_id,salon_id,storage_path,file_name,mime_type,size_bytes,
    status,prepared_at,expires_at,created_at,updated_at
  ) values (
    p_upload_id,p_user_id,p_salon_id,p_storage_path,trim(p_file_name),
    lower(p_mime_type),p_size_bytes,'Prepared',now(),
    now()+interval '30 minutes',now(),now()
  ) returning * into v_upload;

  return jsonb_build_object(
    'upload_id',v_upload.id,
    'path',v_upload.storage_path,
    'status',v_upload.status,
    'expires_at',v_upload.expires_at
  );
end;
$$;

create or replace function public.finalize_application_document_upload(
  p_upload_id uuid,
  p_user_id uuid,
  p_salon_id uuid,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_upload public.application_document_uploads%rowtype;
begin
  if not exists (
    select 1
    from public.salons salon
    join public.platform_identities identity
      on identity.user_id=salon.user_id
    where salon.id=p_salon_id
      and salon.user_id=p_user_id
      and identity.status='Active'
      and identity.primary_role='salon_owner'
  ) then
    raise exception using errcode='42501',
      message='Sign in with the salon-owner account that owns this application.';
  end if;
  select * into v_upload
  from public.application_document_uploads
  where id=p_upload_id
  for update;
  if not found
     or v_upload.user_id is distinct from p_user_id
     or v_upload.salon_id is distinct from p_salon_id
     or v_upload.storage_path is distinct from p_storage_path then
    raise exception using errcode='22023',
      message='The prepared supporting-document upload was not found.';
  end if;
  if v_upload.status not in ('Prepared','Finalized') then
    raise exception using errcode='22023',
      message='This supporting-document upload can no longer be finalized.';
  end if;
  if v_upload.expires_at<=now() then
    raise exception using errcode='22023',
      message='This supporting-document upload expired. Upload the file again.';
  end if;
  if v_upload.mime_type<>lower(coalesce(p_mime_type,''))
     or v_upload.size_bytes<>p_size_bytes then
    raise exception using errcode='22023',
      message='The supporting document does not match the prepared upload.';
  end if;

  update public.application_document_uploads
  set status='Finalized',finalized_at=coalesce(finalized_at,now()),
      expires_at=now()+interval '24 hours',updated_at=now()
  where id=p_upload_id
  returning * into v_upload;

  return jsonb_build_object(
    'upload_id',v_upload.id,
    'path',v_upload.storage_path,
    'status',v_upload.status,
    'expires_at',v_upload.expires_at
  );
end;
$$;

create or replace function public.abandon_application_document_upload(
  p_upload_id uuid,
  p_user_id uuid,
  p_salon_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_changed boolean := false;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('application-document:' || p_user_id::text,0)
  );
  if not exists (
    select 1
    from public.salons salon
    join public.platform_identities identity
      on identity.user_id=salon.user_id
    where salon.id=p_salon_id
      and salon.user_id=p_user_id
      and identity.status='Active'
      and identity.primary_role='salon_owner'
  ) then
    raise exception using errcode='42501',
      message='Sign in with the salon-owner account that owns this application.';
  end if;
  update public.application_document_uploads
  set status='Abandoned',abandoned_at=coalesce(abandoned_at,now()),
      expires_at=least(expires_at,now()),updated_at=now()
  where id=p_upload_id and user_id=p_user_id and salon_id=p_salon_id
    and status in ('Prepared','Finalized');
  v_changed := found;
  return v_changed;
end;
$$;

create or replace function public.enforce_application_document_attachments()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_documents text[] := coalesce(new.document_urls,array[]::text[]);
  v_unique_count integer;
  v_valid_count integer;
begin
  if cardinality(v_documents)>5 then
    raise exception using errcode='22023',
      message='You can attach up to five supporting documents.';
  end if;
  if exists (
    select 1 from unnest(v_documents) as selected_path(path)
    where trim(path)=''
  ) then
    raise exception using errcode='22023',
      message='A supporting-document reference is invalid.';
  end if;
  select count(distinct path) into v_unique_count
  from unnest(v_documents) as selected_path(path);
  if v_unique_count<>cardinality(v_documents) then
    raise exception using errcode='22023',
      message='The same supporting document cannot be attached twice.';
  end if;

  -- Lock the selected rows so a concurrent abandon/submit cannot race this
  -- application transaction.
  perform 1
  from public.application_document_uploads upload
  where upload.storage_path=any(v_documents)
  for update;

  select count(*) into v_valid_count
  from public.application_document_uploads upload
  where upload.storage_path=any(v_documents)
    and upload.user_id=new.user_id
    and upload.salon_id=new.salon_id
    and (
      (upload.status='Finalized' and upload.expires_at>now())
      or (upload.status='Attached' and upload.application_id=new.id)
    );
  if v_valid_count<>cardinality(v_documents) then
    raise exception using errcode='22023',
      message='Upload and verify every supporting document before submitting.';
  end if;

  update public.application_document_uploads
  set status='Abandoned',application_id=null,attached_at=null,
      abandoned_at=coalesce(abandoned_at,now()),expires_at=now(),updated_at=now()
  where application_id=new.id and status='Attached'
    and not (storage_path=any(v_documents));

  update public.application_document_uploads
  set status='Attached',application_id=new.id,
      attached_at=coalesce(attached_at,now()),expires_at=null,updated_at=now()
  where storage_path=any(v_documents)
    and user_id=new.user_id and salon_id=new.salon_id;
  return new;
end;
$$;

drop trigger if exists salon_applications_enforce_document_attachments
  on public.salon_applications;
create trigger salon_applications_enforce_document_attachments
after insert or update of document_urls,user_id,salon_id
on public.salon_applications
for each row execute function public.enforce_application_document_attachments();

create or replace function public.abandon_deleted_application_documents()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.application_document_uploads
  set status='Abandoned',application_id=null,attached_at=null,
      abandoned_at=coalesce(abandoned_at,now()),expires_at=now(),updated_at=now()
  where application_id=old.id and status='Attached';
  return old;
end;
$$;

drop trigger if exists salon_applications_abandon_deleted_documents
  on public.salon_applications;
create trigger salon_applications_abandon_deleted_documents
before delete on public.salon_applications
for each row execute function public.abandon_deleted_application_documents();

revoke all on function public.prepare_application_document_upload(uuid,uuid,uuid,text,text,text,bigint)
  from public,anon,authenticated;
revoke all on function public.finalize_application_document_upload(uuid,uuid,uuid,text,text,bigint)
  from public,anon,authenticated;
revoke all on function public.abandon_application_document_upload(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.prepare_application_document_upload(uuid,uuid,uuid,text,text,text,bigint)
  to service_role;
grant execute on function public.finalize_application_document_upload(uuid,uuid,uuid,text,text,bigint)
  to service_role;
grant execute on function public.abandon_application_document_upload(uuid,uuid,uuid)
  to service_role;

update public.engine_settings
set published_value='"20260809160000"'::jsonb,
    draft_value='"20260809160000"'::jsonb,
    updated_at=now()
where setting_key='integrations.expected_migration';

notify pgrst,'reload schema';
commit;
