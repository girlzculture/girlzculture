begin;
create function pg_temp.task_assert(ok boolean,label text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Task assertion: %',label;end if;end $$;
create function pg_temp.task_reject(command text,expected text)returns void language plpgsql as $$declare rejected boolean:=false;begin begin execute command;exception when others then if position(expected in sqlerrm)>0 then rejected:=true;else raise;end if;end;perform pg_temp.task_assert(rejected,expected);end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();owner_a uuid:=gen_random_uuid();owner_b uuid:=gen_random_uuid();task uuid:=gen_random_uuid();first uuid:=gen_random_uuid();next_id uuid;state jsonb;before_state jsonb;goal text:='Create a walk-in for Alma Aba, Thursday September 24, 3:30 PM, any stylist, any service';
begin
 insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)values(owner_a,'task-owner-a@example.test','',now(),'{"role":"salon_owner"}'),(owner_b,'task-owner-b@example.test','',now(),'{"role":"salon_owner"}');
 insert into public.salons(id,user_id,name,slug,email,subscription_status,subscription_tier)values(a,owner_a,'Task A','task-a','task-owner-a@example.test','active','Premium'),(b,owner_b,'Task B','task-b','task-owner-b@example.test','active','Premium');
 insert into public.subscriptions(salon_id,tier,status)values(a,'Premium','active'),(b,'Premium','active');
 state:=public.advance_gc_assistant_task(task,a,owner_a,0,'prepare_manual_appointment','bookings',first,goal);
 perform pg_temp.task_assert(state->>'revision'='1' and state#>>'{user_context,0,text}'=goal,'exact goal retained');
 perform pg_temp.task_assert(public.advance_gc_assistant_task(task,a,owner_a,0,'prepare_manual_appointment','bookings',first,goal)=state,'exact retry creates no second turn');
 perform pg_temp.task_reject(format('select public.advance_gc_assistant_task(%L,%L,%L,1,%L,%L,%L,%L)',task,a,owner_b,'prepare_manual_appointment','bookings',gen_random_uuid(),goal),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.task_reject(format('select public.advance_gc_assistant_task(%L,%L,%L,0,%L,%L,%L,%L)',gen_random_uuid(),a,owner_a,'prepare_manual_appointment','bookings',gen_random_uuid(),goal),'ASSISTANT_TASK_CHANGED');
 perform pg_temp.task_reject(format('select public.advance_gc_assistant_task(%L,%L,%L,1,%L,%L,%L,%L)',task,a,owner_a,'prepare_manual_appointment','bookings',first,'Change the original silently'),'ASSISTANT_TASK_CHANGED');
 for n in 1..16 loop state:=public.advance_gc_assistant_task(task,a,owner_a,n,'prepare_manual_appointment','bookings',gen_random_uuid(),'Follow-up '||n);end loop;
 perform pg_temp.task_assert(jsonb_array_length(state->'user_context')=17 and state#>>'{user_context,0,text}'=goal,'all user context remains after sixteen follow-ups');
 perform pg_temp.task_assert(jsonb_array_length(state->'request_ids')=6,'bounded fresh fact lookup independently of full task context');
 perform pg_temp.task_reject(format('select public.end_gc_assistant_task(%L,%L,%L,17,null)',task,b,owner_b),'ASSISTANT_ACCESS_DENIED');
 perform pg_temp.task_reject(format('select public.end_gc_assistant_task(%L,%L,%L,2,null)',task,a,owner_a),'ASSISTANT_TASK_CHANGED');
 perform pg_temp.task_reject(format('select public.end_gc_assistant_task(%L,%L,%L,17,%L)',task,a,owner_a,first),'ASSISTANT_TASK_NOT_COMPLETED');
 insert into public.gc_assistant_requests(id,salon_id,requested_by,locale,tool,arguments,risk_class,permission,digest)
 values(first,a,owner_a,'en','prepare_manual_appointment','{}',3,'bookings',repeat('a',64));
 perform pg_temp.task_assert(public.end_gc_assistant_task(task,a,owner_a,17,null),'explicit cancellation');
 perform pg_temp.task_assert((select failure_code='ASSISTANT_TASK_CANCELLED' from public.gc_assistant_requests where id=first),'cancellation invalidates the old prepared action');
 perform pg_temp.task_reject(format('select public.confirm_gc_assistant_request(%L,%L,%L,%L)',first,a,owner_a,repeat('a',64)),'ASSISTANT_PREVIEW_EXPIRED');
 perform pg_temp.task_assert((select status='cancelled' and user_context='[]' and request_ids='{}' from public.gc_assistant_active_tasks where id=task),'ended task clears personal prose');
 perform pg_temp.task_assert(public.end_gc_assistant_task(task,a,owner_a,17,null),'cancel replay is idempotent');
 task:=gen_random_uuid();next_id:=gen_random_uuid();
 state:=public.advance_gc_assistant_task(task,a,owner_a,0,'prepare_manual_appointment','bookings',next_id,goal);
 perform pg_temp.task_assert(state->>'revision'='1','owner starts next task after ending the prior one');
 insert into public.gc_assistant_requests(id,salon_id,requested_by,locale,tool,arguments,risk_class,permission,digest,confirmed_at)
 values(next_id,a,owner_a,'en','prepare_manual_appointment','{}',3,'bookings',repeat('a',64),now());
 perform pg_temp.task_assert(public.end_gc_assistant_task(task,a,owner_a,1,next_id),'confirmed own request completes the task');
 perform pg_temp.task_assert((select status='completed' and user_context='[]' from public.gc_assistant_active_tasks where id=task),'completion clears personal prose');
 perform pg_temp.task_assert(not has_table_privilege('authenticated','public.gc_assistant_active_tasks','select') and not has_function_privilege('authenticated','public.advance_gc_assistant_task(uuid,uuid,uuid,bigint,text,text,uuid,text)','execute'),'private task state cannot bypass server authorization');
end $$;
rollback;
select 'Assistant active task: 19 scope, continuity, stale-session and explicit-ending checks passed.';
