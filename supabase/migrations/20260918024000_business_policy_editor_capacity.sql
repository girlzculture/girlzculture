begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Preserve immutable published revisions and booking snapshots. New drafts can
-- retain every legacy field alongside up to 12,000 characters of policy prose,
-- including multibyte languages. No existing policy is rewritten or published.
alter table public.business_policy_revisions
  drop constraint business_policy_revisions_policy_check;
alter table public.business_policy_revisions
  add constraint business_policy_revisions_policy_check
  check (jsonb_typeof(policy) = 'object' and octet_length(policy::text) <= 64000);

commit;
