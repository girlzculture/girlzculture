-- Read-only preflight for migration
-- 20260809160000_application_document_upload_integrity.sql.
--
-- Run this against preview first, then production, before applying the
-- migration. Both result sets must be empty. This script never updates,
-- deletes, inserts, locks, or marks a migration as applied.

-- Result set 1: a Storage path is assigned to more than one application,
-- owner, or salon. Every returned path needs a reviewed ownership decision.
select
  trim(document_path) as storage_path,
  count(distinct application.id) as application_count,
  count(distinct application.user_id) as owner_count,
  count(distinct application.salon_id) as salon_count,
  array_agg(distinct application.id order by application.id) as application_ids,
  array_agg(distinct application.user_id order by application.user_id)
    filter (where application.user_id is not null) as owner_ids,
  array_agg(distinct application.salon_id order by application.salon_id)
    filter (where application.salon_id is not null) as salon_ids
from public.salon_applications application
cross join lateral unnest(coalesce(application.document_urls, array[]::text[]))
  as documents(document_path)
where trim(document_path) <> ''
group by trim(document_path)
having count(distinct application.id) > 1
    or count(distinct application.user_id) > 1
    or count(distinct application.salon_id) > 1
order by storage_path;

-- Result set 2: the path cannot be proven to belong to the authenticated
-- application owner. Reconcile the source record and private Storage object;
-- never make the path public or weaken the owner-folder rule.
select
  application.id as application_id,
  application.user_id,
  application.salon_id,
  document_path as storage_path,
  case
    when application.user_id is null then 'missing application owner'
    when trim(document_path) <> document_path then 'leading or trailing whitespace'
    when position('..' in document_path) > 0 then 'path traversal segment'
    else 'path is outside the owner documents folder or has an invalid upload id'
  end as issue
from public.salon_applications application
cross join lateral unnest(coalesce(application.document_urls, array[]::text[]))
  as documents(document_path)
where trim(document_path) <> ''
  and (
    application.user_id is null
    or trim(document_path) <> document_path
    or position('..' in document_path) > 0
    or document_path !~ (
      '^' || application.user_id::text
      || '/documents/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-[^/]+$'
    )
  )
order by application.id, document_path;
