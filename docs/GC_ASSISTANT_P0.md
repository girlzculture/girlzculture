# GC Assistant P0

Status: **AUTOMATED ONLY** for deterministic tools. **BLOCKED** for real multilingual model/provider acceptance: no approved isolated backend/provider configuration or AI credentials are assigned.

One GC Assistant panel is available throughout the owner dashboard. Typed input, provider-unavailable fallback, authorized quick reads, setup assistance, structured previews and explicit confirmation use the existing owner workflows. Normal dashboard controls remain usable when the provider is unavailable.

## Execution boundary

Owner request → Engine-governed intent planning → fixed strict tool schema → fresh canonical identity/tenant/permission and plan check → read or persisted proposal → explicit confirmation → atomic deterministic write and audit → localized result. The model never receives a database client, SQL tool, credentials or authority to choose a tenant. Catalog and booking identities come from authorized data; proposed foreign/stale records fail validation.

| Tool | Permission | Risk / confirmation |
| --- | --- | --- |
| `get_business_summary` | overview | 1, immediate read |
| `get_bookings` | bookings | 1, immediate read |
| `get_availability` | availability | 1, immediate read |
| `get_business_profile` | my_page | 1, immediate read |
| `get_services_and_prices` | styles | 1, immediate read |
| `get_business_policies` | my_page | 1, immediate read |
| `prepare_business_profile_update` | my_page; availability for hours; owner-only social links | 4 for public changes; explicit immediate confirmation |
| `prepare_availability_block` | availability | 3; exact interval/time zone/scope preview and confirmation |
| `prepare_service` | styles | 3; service draft preview and confirmation |
| `prepare_customer_message` | bookings | 4; original message and booking preview, explicit send confirmation |
| `prepare_business_policy_update` | my_page | 4; original policy review, platform acknowledgment and publish confirmation |

The registry in `gcAssistantCore.ts` is authoritative for field-level schemas and risk. Inputs have fixed enums, bounded arrays/text, real calendar dates, bounded date ranges and no extra tenant/SQL keys. Service drafts reuse platform catalog identities, canonical length/add-on formats and platform deposit rules. A custom name follows the existing custom-service path. Availability uses the existing override RPC and its advisory lock. Profile and social changes preserve existing moderation/review controls. Customer messages use the existing booking conversation and notification systems.

Request UUIDs, proposal digests, stored before-state, expiry and SQL row locks protect confirmation. Confirmation revalidates normalized execution payload and authoritative state; an expired, revoked, conflicting or stale preview cannot write. Duplicate confirmation returns the committed result. Mutations and their audit events share a transaction; failure records retain safe codes. Audit metadata is visible in the existing Platform Admin AI manager; private payload inspection requires support access.

Rejections before proposal persistence or before SQL execution also use the existing protected Engine error/event system. They record the authenticated actor/business, locale, request ID, stage, known tool/risk, argument digest and stable failure code. Rejected private prose and raw prompts are not copied into monitoring. A failed confirmation's request ID links to its already-persisted normalized arguments and before-state. The response body and X-Request-ID use the exact canonical Engine reference. Rate-limit rejections preserve Retry-After without producing an incident-write amplification loop; the existing rate limiter remains authoritative.

The launcher occupies a dedicated owner toolbar rather than overlapping ordinary controls. The shared dashboard-layout provider preserves the conversation across routes. Account changes clear private in-memory history. Long returned lists disclose their remaining results through an expandable section. Service-name filtering happens before the database cap; literal percent/underscore input cannot become wildcard search authority. Availability retains canonical professional IDs for subsequent scoped actions while presenting human names and local times.

## Provider governance and languages

The Engine feature starts disabled. The existing approved provider/model governance must explicitly permit it and supply positive configured input/output cost rates. Before a request, a conservative cost reservation checks per-user rate and global daily/monthly budgets under a shared lock. Calls have bounded context/output, a 20-second timeout and `store: false`. Failed providers cannot bypass budgets or issue writes. No unnecessary raw provider payloads are retained.

Planning is instructed to use the selected `en`, `fr`, `wo`, `es` or `zh-CN` locale, ask concise clarifications when needed and treat business/customer prose as untrusted data. Browser fixtures prove presentation and confirmation behavior, not real natural-language understanding. Live five-language/code-switching acceptance is still required with an approved provider.

The five-locale Chromium/WebKit skill journey exercises all six reads and five preview/confirm actions, verifies unchanged state before confirmation, checks each resulting fixture record, and covers setup clarification, Class 5 navigation and provider fallback. Independent server tests and real disposable PostgreSQL assertions verify the authoritative execution boundary. These complementary tests do not claim that a scripted planner is a real model. Facts rendering translates only structured enum fields and canonical length choices; user names/prose that happen to match an enum remain original.

Follow-up planning may use at most 30 booking selection records from a prior authorized read, filtered by the actor's freshly checked permission. These include identity, reference, name, appointment and status; they exclude contacts, payment details and private message bodies. This lets a request such as “tell Sarah” resolve an already-authorized identity. Ambiguity still requires clarification, and confirmation rechecks the displayed customer identity. Prior prepared message bodies are not replayed to the planner.

## Exclusions and setup

Class 5 requests can only navigate/explain: refunds, payouts, billing changes, Stripe, security permissions, ownership, deletion, suspension and legal acceptance are not tools. Neither Assistant nor chat handles raw card data. Marketing/ranking/platform-policy changes are excluded. No public phone receptionist, voice storage or automatic customer replies were added.

Set up with GC Assistant uses the same planner/proposals for hours, profile/social text and service drafts, with existing spreadsheet import/media routes available. No scraping or shadow catalog is introduced. Full multi-step setup acceptance with the real provider remains outstanding. There is no automatic Undo where the existing workflows cannot safely guarantee it; normal editors remain authoritative.
