# Business content inventory and demonstrations

Status: **PASS read-only production inventory; richer isolated demonstrations IN PROGRESS; hosted release UNVERIFIED.** This record addresses EXEC-06. No business identity, profile, booking, review, payment or customer record was changed.

The production metadata and aggregate content queries ran inside explicit read-only transactions on19September2026. They returned counts only, without business/customer names, identifiers, contact information or financial records. The query used the existing `is_marketplace_visible` predicate; visibility does not by itself establish available appointment slots or successful checkout.

| Existing inventory | Count |
| --- | ---: |
| Total / undeleted businesses |31 /31 |
| Active businesses |25 |
| Marketplace-visible businesses |25 |
| Businesses registered in the existing test-data registry |0 |
| With descriptions |24 |
| With cover photos |25 |
| With gallery content |26 |
| With published, unarchived services |24 |
| With active, published professionals |23 |
| Published, unarchived services across undeleted businesses |342 |
| Active, published professionals across undeleted businesses |71 |
| Rich-content candidates under the criterion below |20 |

The rich-content criterion is a description, cover, at least five gallery entries, at least three published/unarchived services and one active/published professional. It is an inventory measurement, not a new publication rule, quality certification or an assertion that every record is authentic. Zero registry entries does not prove that there are no historical seed/demo records. Existing identities and content must remain intact; no invented transactions or reviews can be added to make a live dashboard look populated.

The ordinary marketplace already has25 visible businesses to reuse through its existing public data path. The explicit `/site-access/business-demo` route currently supplies one isolated fictional workspace. Its next bounded change will provide three-to-five richer read-only scenarios on that route only, retaining clear sample labels and avoiding backend/customer/provider actions. This is separate from public business records and does not replace real-record acceptance of authenticated workflows. A general production-site demo banner is not reintroduced.

Production migration history was separately compared read-only with source `9fe15bd056e407da3c477b68d31e5addd255544e`:151 applied,183 repository files,32 pending,zero remote versions missing locally. DeepL `20260916204952` is already present; latest applied is opt-in memory `20260917185913`. Pending files start at `20260918024000_business_policy_editor_capacity.sql` and end at `20260919101239_business_service_contribution_reviews.sql`. The exact safe metadata comparison is retained outside Git at `../redesign-evidence/production-migration-comparison-9fe15bd.json`. No migration was applied or repaired.
