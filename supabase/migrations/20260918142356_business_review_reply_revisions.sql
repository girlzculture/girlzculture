begin;
alter table public.reviews add column if not exists reply_revision integer not null default 0 check(reply_revision>=0);
create table public.business_review_reply_versions(
 id uuid primary key default gen_random_uuid(),
 salon_id uuid not null references public.salons(id) on delete cascade,
 review_id uuid not null references public.reviews(id) on delete cascade,
 actor_id uuid not null,
 request_id uuid not null,
 input_hash text not null,
 previous_reply text,
 submitted_reply text not null,
 content_status text not null check(content_status in ('pending','published')),
 result jsonb not null,
 created_at timestamptz not null default now(),
 unique(salon_id,actor_id,request_id)
);
alter table public.business_review_reply_versions enable row level security;
revoke all on public.business_review_reply_versions from public,anon,authenticated,service_role;
grant select on public.business_review_reply_versions to service_role;
create index business_review_reply_versions_review_idx on public.business_review_reply_versions(review_id,id);

-- Also advance the revision when the existing moderator/legacy reply path
-- publishes text, so an open owner editor cannot overwrite a later decision.
create function public.bump_business_review_reply_revision() returns trigger language plpgsql set search_path=public as $$
begin
 if new.salon_reply is distinct from old.salon_reply then new.reply_revision:=old.reply_revision+1; end if;
 return new;
end $$;
create trigger reviews_reply_revision before update on public.reviews for each row execute function public.bump_business_review_reply_revision();
revoke all on function public.bump_business_review_reply_revision() from public,anon,authenticated;

create function public.save_business_review_reply(
 p_salon uuid,p_review uuid,p_actor uuid,p_request uuid,p_revision integer,
 p_reply text,p_moderation text,p_reason text default null,p_source text default null
) returns jsonb language plpgsql security definer set search_path=public,auth as $$
declare r public.reviews%rowtype; membership public.salon_team_members%rowtype; identity public.platform_identities%rowtype;
 replay public.business_review_reply_versions%rowtype; reply text:=trim(coalesce(p_reply,'')); actor_role text; fingerprint text;
 pending boolean:=p_moderation='Pending'; output jsonb; previous text; queue_status text;
begin
 if p_request is null or p_revision is null or p_revision<0 or length(reply) not between 1 and 2000 or p_moderation not in ('Clear','Pending') or p_moderation is null then raise exception 'REVIEW_REPLY_INPUT_INVALID'; end if;
 perform 1 from public.salons where id=p_salon for share;
 select * into identity from public.platform_identities where user_id=p_actor for share;
 if not found or identity.status<>'Active' then raise exception 'REVIEW_REPLY_FORBIDDEN'; end if;
 if identity.primary_role='salon_owner' and exists(select 1 from public.salons where id=p_salon and user_id=p_actor) then actor_role:='salon_owner';
 else
   select * into membership from public.salon_team_members where salon_id=p_salon and user_id=p_actor for share;
   if not found or identity.primary_role<>'salon_team' or membership.status<>'Active' or not coalesce((membership.permissions->>'reviews')::boolean,false) then raise exception 'REVIEW_REPLY_FORBIDDEN'; end if;
   actor_role:='salon_team';
 end if;
 select * into r from public.reviews where id=p_review and salon_id=p_salon for update;
 if not found then raise exception 'REVIEW_NOT_FOUND'; end if;
 fingerprint:=md5(jsonb_build_array(p_review,p_revision,reply)::text);
 select * into replay from public.business_review_reply_versions where salon_id=p_salon and actor_id=p_actor and request_id=p_request;
 if found then
   if replay.input_hash<>fingerprint then raise exception 'REVIEW_REPLY_REQUEST_REUSED'; end if;
   -- Return the current public state, never restore a superseded response.
   return replay.result||jsonb_build_object('review',to_jsonb(r)||jsonb_build_object('reply_queue',
     (select coalesce(jsonb_agg(jsonb_build_object('submitted_reply',submitted_reply,'status',status,'updated_at',updated_at)),'[]') from public.review_reply_moderation_queue where review_id=r.id)), 'replayed',true);
 end if;
 if r.reply_revision<>p_revision then raise exception 'REVIEW_REPLY_STALE'; end if;
 if r.archived_at is not null or r.moderation_status<>'Published' or coalesce(r.dispute_status,'None')='Removed' then raise exception 'REVIEW_REPLY_NOT_VISIBLE'; end if;
 previous:=r.salon_reply;
 select status into queue_status from public.review_reply_moderation_queue where review_id=r.id for update;
 if pending then
   insert into public.review_reply_moderation_queue(review_id,submitted_reply,detection_reason,detection_source,submitted_by)
   values(r.id,reply,left(p_reason,500),case when lower(coalesce(p_source,''))='system' then 'system' else 'provider' end,p_actor)
   on conflict(review_id) do update set submitted_reply=excluded.submitted_reply,status='Pending',detection_reason=excluded.detection_reason,detection_source=excluded.detection_source,submitted_by=p_actor,decision_reason=null,reviewed_by=null,reviewed_at=null,updated_at=now();
   update public.reviews set reply_revision=reply_revision+1 where id=r.id returning * into r;
 else
   if queue_status='Pending' then
     update public.review_reply_moderation_queue set status='Rejected',decision_reason='Superseded by a later clear salon reply.',reviewed_by=null,reviewed_at=now(),updated_at=now() where review_id=r.id;
   end if;
   update public.reviews set salon_reply=reply,reply_revision=reply_revision+1 where id=r.id returning * into r;
 end if;
 insert into public.review_moderation_events(review_id,action,actor_role,actor_user_id,reason)
 values(r.id,case when pending then 'reply_pending' else 'reply_published' end,actor_role,p_actor,case when pending then 'Salon reply held for human moderation.' when previous is not null then 'Salon reply updated; original submission retained in private history.' else null end);
 output:=jsonb_build_object('review',to_jsonb(r)||jsonb_build_object('reply_queue',
   (select coalesce(jsonb_agg(jsonb_build_object('submitted_reply',submitted_reply,'status',status,'updated_at',updated_at)),'[]') from public.review_reply_moderation_queue where review_id=r.id)),
   'content_status',case when pending then 'pending' else 'published' end);
 insert into public.business_review_reply_versions(salon_id,review_id,actor_id,request_id,input_hash,previous_reply,submitted_reply,content_status,result)
 values(p_salon,r.id,p_actor,p_request,fingerprint,previous,reply,case when pending then 'pending' else 'published' end,output);
 return output;
end $$;
revoke all on function public.save_business_review_reply(uuid,uuid,uuid,uuid,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_business_review_reply(uuid,uuid,uuid,uuid,integer,text,text,text,text) to service_role;
update public.engine_settings set published_value='"20260918142356"',draft_value='"20260918142356"',updated_at=now() where setting_key='integrations.expected_migration';
commit;
