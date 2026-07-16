-- Permanently qualify storage.objects.name in every path-based policy. This
-- prevents a nested table alias (for example styles s.name) from capturing
-- the outer storage object path and denying otherwise valid uploads.

begin;

drop policy if exists salon_media_owner_insert on storage.objects;
create policy salon_media_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'salon-photos'
  and (storage.foldername(storage.objects.name))[1] = 'salons'
  and (
    ((storage.foldername(storage.objects.name))[3] = 'products'
      and public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'products'))
    or ((storage.foldername(storage.objects.name))[3] is distinct from 'products' and (
      public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'photos')
      or public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'my_page')
    ))
    or public.admin_has_permission('salons')
  )
);

drop policy if exists salon_media_owner_update on storage.objects;
create policy salon_media_owner_update on storage.objects for update to authenticated
using (
  bucket_id = 'salon-photos'
  and (storage.foldername(storage.objects.name))[1] = 'salons'
  and (
    ((storage.foldername(storage.objects.name))[3] = 'products'
      and public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'products'))
    or ((storage.foldername(storage.objects.name))[3] is distinct from 'products' and (
      public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'photos')
      or public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'my_page')
    ))
    or public.admin_has_permission('salons')
  )
)
with check (
  bucket_id = 'salon-photos'
  and (storage.foldername(storage.objects.name))[1] = 'salons'
  and (
    ((storage.foldername(storage.objects.name))[3] = 'products'
      and public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'products'))
    or ((storage.foldername(storage.objects.name))[3] is distinct from 'products' and (
      public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'photos')
      or public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'my_page')
    ))
    or public.admin_has_permission('salons')
  )
);

drop policy if exists salon_media_owner_delete on storage.objects;
create policy salon_media_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'salon-photos'
  and (storage.foldername(storage.objects.name))[1] = 'salons'
  and (
    ((storage.foldername(storage.objects.name))[3] = 'products'
      and public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'products'))
    or ((storage.foldername(storage.objects.name))[3] is distinct from 'products' and (
      public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'photos')
      or public.salon_has_permission(public.safe_uuid((storage.foldername(storage.objects.name))[2]), 'my_page')
    ))
    or public.admin_has_permission('salons')
  )
);

drop policy if exists style_media_owner_write on storage.objects;
create policy style_media_owner_write on storage.objects for all to authenticated
using (
  bucket_id = 'style-photos'
  and (storage.foldername(storage.objects.name))[1] = 'styles'
  and (
    exists (
      select 1 from public.styles s
      where s.id = public.safe_uuid((storage.foldername(storage.objects.name))[2])
        and public.salon_has_permission(s.salon_id, 'styles')
    )
    or public.admin_has_permission('salons')
  )
)
with check (
  bucket_id = 'style-photos'
  and (storage.foldername(storage.objects.name))[1] = 'styles'
  and (
    exists (
      select 1 from public.styles s
      where s.id = public.safe_uuid((storage.foldername(storage.objects.name))[2])
        and public.salon_has_permission(s.salon_id, 'styles')
    )
    or public.admin_has_permission('salons')
  )
);

drop policy if exists stylist_media_owner_write on storage.objects;
create policy stylist_media_owner_write on storage.objects for all to authenticated
using (
  bucket_id = 'stylist-photos'
  and (storage.foldername(storage.objects.name))[1] = 'stylists'
  and (
    exists (
      select 1 from public.stylists s
      where s.id = public.safe_uuid((storage.foldername(storage.objects.name))[2])
        and (s.user_id = auth.uid() or public.salon_has_permission(s.salon_id, 'stylists'))
    )
    or public.admin_has_permission('salons')
  )
)
with check (
  bucket_id = 'stylist-photos'
  and (storage.foldername(storage.objects.name))[1] = 'stylists'
  and (
    exists (
      select 1 from public.stylists s
      where s.id = public.safe_uuid((storage.foldername(storage.objects.name))[2])
        and (s.user_id = auth.uid() or public.salon_has_permission(s.salon_id, 'stylists'))
    )
    or public.admin_has_permission('salons')
  )
);

drop policy if exists review_media_customer_write on storage.objects;
create policy review_media_customer_write on storage.objects for all to authenticated
using (
  bucket_id = 'review-photos'
  and (storage.foldername(storage.objects.name))[1] = 'reviews'
  and exists (
    select 1 from public.bookings b
    where b.id = public.safe_uuid((storage.foldername(storage.objects.name))[2])
      and b.customer_id = auth.uid()
      and b.status = 'Completed'
  )
)
with check (
  bucket_id = 'review-photos'
  and (storage.foldername(storage.objects.name))[1] = 'reviews'
  and exists (
    select 1 from public.bookings b
    where b.id = public.safe_uuid((storage.foldername(storage.objects.name))[2])
      and b.customer_id = auth.uid()
      and b.status = 'Completed'
  )
);

drop policy if exists application_media_owner_insert on storage.objects;
create policy application_media_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'application-media' and (storage.foldername(storage.objects.name))[1] = auth.uid()::text);

drop policy if exists application_media_owner_update on storage.objects;
create policy application_media_owner_update on storage.objects for update to authenticated
using (bucket_id = 'application-media' and (storage.foldername(storage.objects.name))[1] = auth.uid()::text)
with check (bucket_id = 'application-media' and (storage.foldername(storage.objects.name))[1] = auth.uid()::text);

drop policy if exists application_media_owner_delete on storage.objects;
create policy application_media_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'application-media' and ((storage.foldername(storage.objects.name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists application_documents_owner_insert on storage.objects;
create policy application_documents_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'application-documents' and (storage.foldername(storage.objects.name))[1] = auth.uid()::text);

drop policy if exists application_documents_owner_read on storage.objects;
create policy application_documents_owner_read on storage.objects for select to authenticated
using (bucket_id = 'application-documents' and ((storage.foldername(storage.objects.name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists application_documents_owner_delete on storage.objects;
create policy application_documents_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'application-documents' and ((storage.foldername(storage.objects.name))[1] = auth.uid()::text or public.is_admin()));

do $$
declare
  policy_expression text;
  target_policy text;
begin
  foreach target_policy in array array['stylist_media_owner_write', 'style_media_owner_write'] loop
    select coalesce(qual, '') || ' ' || coalesce(with_check, '')
      into policy_expression
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = target_policy;

    if policy_expression is null
      or position('foldername(objects.name)' in policy_expression) = 0
      or position('foldername(s.name)' in policy_expression) > 0 then
      raise exception 'Storage policy % was not created with objects.name qualification: %', target_policy, policy_expression;
    end if;
  end loop;
end $$;

commit;
