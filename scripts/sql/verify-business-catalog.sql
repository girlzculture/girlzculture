begin;
create function pg_temp.catalog_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Catalog assertion failed: %',label; end if;end $$;
do $$
declare owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();result jsonb;denied boolean:=false;
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values(owner_a,'catalog-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'catalog-b@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,status,subscription_status,subscription_tier) values(a,owner_a,'Catalog A','catalog-a','catalog-a@example.test','Active','active','Premium'),(b,owner_b,'Catalog B','catalog-b','catalog-b@example.test','Active','active','Premium');
 insert into public.styles(id,salon_id,service_group_id,name,duration_min_hours,duration_max_hours,base_price,price_display_min,price_display_max,photos)
 select fixture.id,fixture.business,g.id,fixture.name,1,2,100,100,150,'["https://example.test/original-service.png"]'::jsonb from (values(sa,a,'Own service'),(sb,b,'Foreign service')) fixture(id,business,name) cross join lateral(select id from public.service_groups limit 1) g;
 perform pg_temp.catalog_assert((select is_featured=false from public.styles where id=sa),'existing services are not invented featured selections');
 perform set_config('request.jwt.claim.role','service_role',true);
 result:=public.save_salon_style_with_materials(a,null,jsonb_build_object('name','New featured service','service_group_id',(select service_group_id from public.styles where id=sa),'duration_min_hours',1,'duration_max_hours',1,'base_price',90,'price_display_min',90,'price_display_max',90,'is_featured',true,'is_draft',true),'[]'::jsonb);
 perform pg_temp.catalog_assert((result#>>'{record,is_featured}')::boolean and (result#>>'{record,is_draft}')::boolean,'atomic service creation includes feature flag without breaking draft creation');
 result:=public.save_salon_style_with_materials(a,sa,'{"is_featured":true}',null);
 perform pg_temp.catalog_assert((select is_featured and name='Own service' and base_price=100 and price_display_max=150 and photos='["https://example.test/original-service.png"]'::jsonb from public.styles where id=sa),'partial feature toggle preserves prices and exact media');
 perform public.save_salon_style_with_materials(a,sa,'{"name":"Edited own service"}',null);
 perform pg_temp.catalog_assert((select is_featured from public.styles where id=sa),'normal editing preserves featured choice');
 begin perform public.save_salon_style_with_materials(a,sb,'{"is_featured":true}',null);exception when sqlstate 'P0002' then denied:=true;end;
 perform pg_temp.catalog_assert(denied and (select not is_featured from public.styles where id=sb),'foreign service id rejected without mutation');
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claim.sub',owner_a::text,true);
 denied:=false;
 begin perform public.save_salon_style_with_materials(b,sb,'{"is_featured":true}',null);exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.catalog_assert(denied,'direct authenticated RPC rejects other business');
 perform public.save_salon_style_with_materials(a,sa,'{"is_featured":false}',null);
 perform pg_temp.catalog_assert((select not is_featured from public.styles where id=sa),'owner can remove own selection');
end $$;
rollback;
