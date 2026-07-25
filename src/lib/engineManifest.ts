export type EngineCategory = {
  id: string;
  label: string;
  description: string;
  permission: "settings" | "content" | "marketing" | "support" | "subscriptions";
  links?: Array<{ label: string; href: string; help: string }>;
};

export type EngineSection = {
  id: string;
  label: string;
  description: string;
  categories: string[];
  links?: Array<{ label: string; href: string; help: string }>;
};

export const ENGINE_CATEGORIES: EngineCategory[] = [
  { id: "branding_design", label: "Branding & Design", description: "Brand colors, identity presentation, approved layout choices, and visual defaults.", permission: "settings" },
  { id: "navigation_menus", label: "Navigation & Menus", description: "Customer-facing labels, destinations, order, and visibility for approved navigation slots.", permission: "content", links: [{ label: "Edit page and footer content", href: "/admin/content", help: "Manage published labels and footer destinations." }] },
  { id: "pages_sections", label: "Pages & Page Sections", description: "Editorial pages, SEO fields, calls to action, section visibility, and constrained layouts.", permission: "content", links: [{ label: "Open Content Management", href: "/admin/content", help: "Create, preview, publish, archive, and restore page content." }] },
  { id: "homepage_composition", label: "Homepage Composition", description: "Homepage rows, card limits, linked records, visibility, and approved presentation variants.", permission: "marketing", links: [{ label: "Manage homepage", href: "/admin/marketing?workspace=homepage", help: "Manage homepage rows and featured content." }] },
  { id: "service_taxonomies", label: "Service Catalog & Taxonomies", description: "Service categories, service names, aliases, option groups, materials, add-ons, and inclusions.", permission: "content", links: [{ label: "Manage service catalog", href: "/admin/content?workspace=catalog", help: "Edit ordinary catalog records with dependency previews." }] },
  { id: "salon_lifecycle", label: "Salon Setup & Lifecycle", description: "Application, setup-completion, approval, activation, discoverability, and offboarding rules.", permission: "settings", links: [{ label: "Manage salons", href: "/admin/salons", help: "Review individual salon status and lifecycle actions." }] },
  { id: "booking_availability", label: "Booking & Availability Rules", description: "Safe scheduling bounds, buffers, availability rules, reminders, cancellation choices, and booking presentation.", permission: "settings", links: [{ label: "Review bookings", href: "/admin/bookings", help: "Operational booking records remain historically protected." }] },
  { id: "payments_subscriptions", label: "Payments, Deposits & Subscription Presentation", description: "Validated deposit display, plan presentation, and payment-provider configuration status. Financial history is never editable here.", permission: "subscriptions", links: [{ label: "Open subscriptions", href: "/admin/subscriptions", help: "Review subscription state and protected billing history." }, { label: "Open finance", href: "/admin/finance", help: "Inspect deposits, refunds, and the billing ledger." }] },
  { id: "search_discovery", label: "Search, Discovery & Location", description: "Deterministic search vocabulary, aliases, phrases, misspellings, ranking boosts, stop words, and discovery defaults.", permission: "settings", links: [{ label: "Preview salon discovery", href: "/salons", help: "Open the customer-facing deterministic search experience." }] },
  { id: "markets_service_areas", label: "Markets & Service Areas", description: "Supported countries, markets, cities, boroughs, service areas, centers, and activation state.", permission: "settings", links: [{ label: "Manage location records", href: "/admin/salons", help: "View salon-to-market assignments before lifecycle changes." }] },
  { id: "media_uploads", label: "Media & Upload Rules", description: "Upload limits, approved formats, image renditions, focal points, video posters, and storage status.", permission: "settings" },
  { id: "languages_translations", label: "Languages & Translations", description: "Supported locales, direction, order, interface translations, fallback coverage, review, publication, and rollback.", permission: "content" },
  { id: "notifications_templates", label: "Notifications & Templates", description: "Customer-safe subjects, templates, delivery timing, and channel switches. Provider secrets stay in deployment settings.", permission: "content", links: [{ label: "Review customer support", href: "/admin/support", help: "Inspect support delivery context and replies." }] },
  { id: "trust_quality", label: "Trust, Reviews & Quality Rules", description: "Trust labels, verification presentation, quality thresholds, moderation choices, and review health.", permission: "settings", links: [{ label: "Open quality reports", href: "/admin/quality", help: "Review the records affected by published thresholds." }, { label: "Moderate reviews", href: "/admin/reviews", help: "Manage review lifecycle with audit history." }] },
  { id: "promotions_campaigns", label: "Promotions & Campaigns", description: "Promotion availability, bounded rollout, homepage campaigns, featured salons, and trending content.", permission: "marketing", links: [{ label: "Open Marketing", href: "/admin/marketing", help: "Create and audit promotions and paid placements." }] },
  { id: "customer_support", label: "Customer Support Configuration", description: "Support categories, statuses, service targets, response templates, complaint reasons, and escalation presentation.", permission: "support", links: [{ label: "Open support inbox", href: "/admin/support", help: "Read and respond to customer requests." }, { label: "Open complaints", href: "/admin/complaints", help: "Review verified complaints and protected history." }] },
  { id: "users_roles", label: "Users, Roles & Permissions", description: "Role presentation, bounded permissions, identity health, and protected deletion workflows. Authentication secrets remain inaccessible.", permission: "settings", links: [{ label: "Manage admin team", href: "/admin/settings", help: "Add users and assign explicit permissions." }] },
  { id: "ai_automation", label: "AI & Automation", description: "Provider-neutral, disabled-by-default assistance with budgets, review gates, usage, prompts, testing, and deterministic fallback.", permission: "settings" },
  { id: "test_data_maintenance", label: "Test Data & Maintenance", description: "Explicitly labeled test batches, dependency preview, protected cleanup, and maintenance confirmations.", permission: "settings" },
  { id: "integrations_system", label: "Integrations & System Status", description: "Plain-language health for migrations, database, storage, payments, maps, notifications, translation, deployment, and optional AI.", permission: "settings" },
  { id: "configuration_history", label: "Configuration History, Publishing & Recovery", description: "Drafts, published versions, actor history, import/export, conflict handling, rollback, and last-known-good recovery.", permission: "settings" },
];

export const ENGINE_CATEGORY_IDS = new Set(ENGINE_CATEGORIES.map((category) => category.id));

// Founder-facing information architecture. These workflow sections deliberately
// group the lower-level categories used by persisted settings, so reorganizing
// the Engine does not rewrite configuration history or break published records.
export const ENGINE_SECTIONS: EngineSection[] = [
  { id: "overview", label: "Overview", description: "Platform readiness, configuration progress, urgent errors, and direct links to the work that needs attention.", categories: [] },
  { id: "brand_design", label: "Brand & Design", description: "Logos, colors, typography, imagery, upload rules, and approved presentation choices.", categories: ["branding_design", "media_uploads"] },
  { id: "pages_navigation", label: "Pages & Navigation", description: "Public page structure, homepage composition, navigation labels, destinations, order, and visibility.", categories: ["navigation_menus", "pages_sections", "homepage_composition"], links: [{ label: "Open Content Management", href: "/admin/content", help: "Preview, draft, review, publish, archive, and restore public pages." }] },
  { id: "content_wording", label: "Content & Wording", description: "Editorial wording, SEO fields, calls to action, trust language, and reusable public copy.", categories: ["pages_sections", "trust_quality"], links: [{ label: "Edit public content", href: "/admin/content", help: "Manage public content without editing application code." }] },
  { id: "languages", label: "Languages & Translations", description: "Supported languages, fallbacks, translation review, publication, coverage, and rollback.", categories: ["languages_translations"] },
  { id: "salon_operations", label: "Salon Setup & Operations", description: "Applications, setup completion, approval, activation, discoverability, and offboarding.", categories: ["salon_lifecycle"], links: [{ label: "Manage salons", href: "/admin/salons", help: "Review salon identity, status, ownership, and lifecycle." }] },
  { id: "services_catalog", label: "Services & Catalog", description: "Service taxonomy, names, aliases, sizes, lengths, materials, add-ons, and inclusions.", categories: ["service_taxonomies"], links: [{ label: "Manage catalog records", href: "/admin/content?workspace=catalog", help: "Edit structured catalog records and review dependencies." }] },
  { id: "bookings", label: "Bookings & Cancellations", description: "Availability, buffers, booking limits, rescheduling, completion, cancellation, and reminder rules.", categories: ["booking_availability"], links: [{ label: "Review bookings", href: "/admin/bookings", help: "Inspect operational booking records and lifecycle evidence." }] },
  { id: "payments", label: "Payments, Plans & Refunds", description: "Deposits, subscriptions, plan presentation, refunds, payouts, and payment configuration status.", categories: ["payments_subscriptions"], links: [{ label: "Open Finance", href: "/admin/finance", help: "Reconcile customer payments, refunds, salon liabilities, and provider evidence." }, { label: "Open Subscriptions", href: "/admin/subscriptions", help: "Review plan state and protected billing history." }] },
  { id: "promotions", label: "Promotions & Campaigns", description: "Promotion availability, limits, targeting, homepage campaigns, featured salons, and trending content.", categories: ["promotions_campaigns", "homepage_composition"], links: [{ label: "Open Marketing", href: "/admin/marketing", help: "Create, schedule, and audit promotions and placements." }] },
  { id: "locations", label: "Locations & Discovery", description: "Markets, service areas, location search, ranking vocabulary, aliases, and discovery behavior.", categories: ["markets_service_areas", "search_discovery"], links: [{ label: "Preview salon discovery", href: "/salons", help: "Open the customer-facing location and service search." }] },
  { id: "notifications", label: "Notifications & Communications", description: "Customer-safe templates, subjects, delivery timing, channels, and support communication.", categories: ["notifications_templates"], links: [{ label: "Open support inbox", href: "/admin/support", help: "Read and respond to support conversations." }] },
  { id: "ai", label: "AI & Automation", description: "Disabled-by-default assistance, budgets, review gates, prompts, provider state, testing, and deterministic fallback.", categories: ["ai_automation"] },
  { id: "integrations", label: "Integrations", description: "Database, storage, payments, email, SMS, maps, AI, media, push, deployment, and domain connections.", categories: ["integrations_system"] },
  { id: "system_health", label: "System Health & Errors", description: "Visible integration health, migration state, deduplicated operational failures, impact, and recovery actions.", categories: ["integrations_system"] },
  { id: "data_management", label: "Data Management", description: "Record lifecycles, test data, protected cleanup, import/export, configuration history, and recovery.", categories: ["test_data_maintenance", "configuration_history"] },
  { id: "security_access", label: "Security & Access", description: "Roles, permissions, identity health, protected deletion, authentication controls, and audit boundaries.", categories: ["users_roles"], links: [{ label: "Manage admin team", href: "/admin/settings", help: "Add users and grant explicit, limited permissions." }] },
  { id: "help", label: "Help & Documentation", description: "Searchable founder guidance for every section, field, publication workflow, integration, and error response.", categories: [] },
];
