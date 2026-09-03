"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FileText, MapPin } from "lucide-react";
import { formatZonedDateTime } from "@/lib/dateTime";
import { displayStoredPlan } from "@/lib/plans";

type Row = Record<string, unknown>;

type Salon360Data = {
  salon?: Row;
  application?: Row | null;
  team?: Row[];
  documents?: Row[];
  services?: Row[];
  stylists?: Row[];
  products?: Row[];
  recent_bookings?: Row[];
  recent_reviews?: Row[];
  support_tickets?: Row[];
  management_events?: Row[];
  registration_identity?: Row | null;
};

const tabs = [
  "Overview",
  "Registration & Contacts",
  "Business & Location",
  "Operations",
  "Documents",
  "Audit History",
] as const;
type Tab = (typeof tabs)[number];

const text = (value: unknown) => String(value ?? "").trim();
const value = (...items: unknown[]) =>
  items.map(text).find(Boolean) || "Not recorded";
const when = (input: unknown, zone: unknown = "America/New_York") =>
  input
    ? formatZonedDateTime(String(input), String(zone || "America/New_York"))
    : "Not recorded";
function address(row?: Row | null) {
  if (!row) return "Not recorded";
  return value(
    row.formatted_address,
    [
      row.address_street || row.street_address || row.address,
      row.address_line2 || row.suite_unit,
      row.address_city || row.city,
      row.address_state || row.state,
      row.address_zip || row.zip || row.zip_code,
    ]
      .filter(Boolean)
      .join(", "),
  );
}
function Definition({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-cream p-4">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink/50">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-plum">
        {children || "Not recorded"}
      </dd>
    </div>
  );
}
function Grid({ values }: { values: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {values.map(([label, item]) => (
        <Definition label={label} key={label}>
          {item}
        </Definition>
      ))}
    </dl>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[13px] border border-plum/10 bg-white p-4 sm:p-5">
      <h3 className="font-serif text-xl text-plum">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AdminSalon360Sections({ data }: { data: Salon360Data }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const salon = data.salon || {};
  const application = data.application || {};
  const identity = data.registration_identity || {};
  const zone = salon.time_zone || "America/New_York";
  const services = Array.isArray(data.services) ? data.services : [];
  const stylists = Array.isArray(data.stylists) ? data.stylists : [];
  const products = Array.isArray(data.products) ? data.products : [];
  const team = Array.isArray(data.team) ? data.team : [];
  const documents = Array.isArray(data.documents) ? data.documents : [];
  const bookings = Array.isArray(data.recent_bookings) ? data.recent_bookings : [];
  const reviews = Array.isArray(data.recent_reviews) ? data.recent_reviews : [];
  const tickets = Array.isArray(data.support_tickets) ? data.support_tickets : [];
  const management = Array.isArray(data.management_events)
    ? data.management_events
    : [];
  const owner =
    team.find((member) => /owner/i.test(text(member.role))) || team[0];
  const originalOwnerName = value(
    application.owner_name,
    application.applicant_name,
    application.contact_name,
    application.full_name,
  );
  const currentEmail = value(
    salon.email,
    salon.contact_email,
    owner?.email,
    identity.email,
  );
  const currentPhone = value(
    salon.phone,
    salon.contact_phone,
    owner?.phone,
    identity.phone,
  );

  return (
    <section className="rounded-[13px] border border-plum/10 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-magenta">
            Salon 360
          </p>
          <h3 className="font-serif text-2xl text-plum">
            Complete registration and operating record
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-ink/60">
            Current business information is shown first. The original application
            remains preserved separately as historical evidence.
          </p>
        </div>
        {salon.slug ? (
          <Link
            href={`/salon/${salon.slug}`}
            target="_blank"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta"
          >
            Public profile <ExternalLink size={13} />
          </Link>
        ) : null}
      </div>
      <div className="-mx-1 mt-5 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setTab(item)}
            className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-bold ${
              tab === item
                ? "bg-magenta text-white"
                : "border border-plum/15 bg-white text-plum"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {tab === "Overview" ? (
          <>
            <Grid
              values={[
                ["Registered / public name", value(salon.name, application.salon_name, application.business_name)],
                ["Primary email on file", currentEmail],
                ["Primary phone on file", currentPhone],
                ["Current address", address(salon)],
                ["Owner / registrant", value(owner?.name, originalOwnerName)],
                ["Original application", value(application.id)],
                ["Application submitted", when(application.submitted_at, zone)],
                ["Approved / reviewed", when(application.reviewed_at || application.approved_at, zone)],
                ["Timezone", value(salon.time_zone)],
                ["Services", services.length],
                ["Stylists / team users", `${stylists.length} stylists · ${team.length} users`],
                ["Products", products.length],
              ]}
            />
            <div className="grid gap-4 xl:grid-cols-2">
              <Section title="Recent bookings">
                <div className="space-y-2">
                  {bookings.slice(0, 6).map((booking) => (
                    <Link
                      href={`/admin/bookings/${booking.id}?return=${encodeURIComponent(`/admin/salons/${salon.id}`)}`}
                      key={text(booking.id)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-plum/10 p-3 text-xs"
                    >
                      <span>
                        <b className="text-plum">
                          {value(booking.public_reference, booking.confirmation_code, text(booking.id).slice(0, 8))}
                        </b>
                        <span className="mt-1 block text-ink/55">
                          {when(booking.appointment_datetime, zone)}
                        </span>
                      </span>
                      <span>{value(booking.status)}</span>
                    </Link>
                  ))}
                  {!bookings.length ? (
                    <p className="text-sm text-ink/55">No booking history yet.</p>
                  ) : null}
                </div>
              </Section>
              <Section title="Support and review signals">
                <Grid
                  values={[
                    ["Reviews retained", reviews.length],
                    ["Support records", tickets.length],
                    ["Current rating", value(salon.rating_overall, "New")],
                    ["Review count", Number(salon.review_count || reviews.length)],
                  ]}
                />
              </Section>
            </div>
          </>
        ) : null}

        {tab === "Registration & Contacts" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="Current authoritative contacts">
              <Grid
                values={[
                  ["Owner / account holder", value(owner?.name, salon.owner_name, originalOwnerName)],
                  ["Email on file", currentEmail],
                  ["Phone on file", currentPhone],
                  ["Login identity", value(identity.email, owner?.email, salon.user_id)],
                  ["Secondary contact", value(salon.secondary_contact_name, application.secondary_contact_name)],
                  ["Secondary email", value(salon.secondary_contact_email, application.secondary_contact_email)],
                  ["Secondary phone", value(salon.secondary_contact_phone, application.secondary_contact_phone)],
                  ["Owner account ID", value(salon.user_id, identity.user_id)],
                ]}
              />
            </Section>
            <Section title="Original application snapshot">
              <Grid
                values={[
                  ["Registrant name", originalOwnerName],
                  ["Application email", value(application.email, application.contact_email, application.owner_email)],
                  ["Application phone", value(application.phone, application.contact_phone, application.owner_phone)],
                  ["Legal business name", value(application.legal_business_name, application.registered_business_name, application.business_name)],
                  ["Entity type", value(application.business_entity_type, application.entity_type)],
                  ["Selected plan", displayStoredPlan(application.selected_plan)],
                  ["Application status", value(application.status)],
                  ["Application ID", value(application.id)],
                ]}
              />
              {application.id ? (
                <Link
                  href={`/admin/submissions/${application.id}`}
                  className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-magenta px-4 text-xs font-bold text-magenta"
                >
                  Open original application
                </Link>
              ) : null}
            </Section>
          </div>
        ) : null}

        {tab === "Business & Location" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="Current operational business information">
              <Grid
                values={[
                  ["Business name", value(salon.name)],
                  ["Current address", address(salon)],
                  ["Suite / unit", value(salon.address_line2, salon.suite_unit)],
                  ["City / state / ZIP", [salon.address_city, salon.address_state, salon.address_zip].filter(Boolean).join(", ") || "Not recorded"],
                  ["Neighborhood / borough", value(salon.neighborhood, salon.borough)],
                  ["Timezone", value(salon.time_zone)],
                  ["Coordinates", salon.latitude != null && salon.longitude != null ? `${salon.latitude}, ${salon.longitude}` : "Not recorded"],
                  ["Website", value(salon.website_url, salon.website)],
                  ["Instagram", value(salon.instagram_url)],
                  ["TikTok", value(salon.tiktok_url)],
                  ["Google Business", value(salon.google_business_url)],
                  ["Business hours", salon.hours && typeof salon.hours === "object" ? `${Object.keys(salon.hours as Row).length} days configured` : "Not recorded"],
                ]}
              />
              <p className="mt-4 flex items-center gap-2 rounded-lg bg-cream p-3 text-xs text-ink/65">
                <MapPin size={15} /> {address(salon)}
              </p>
            </Section>
            <Section title="Original submitted location">
              <Grid
                values={[
                  ["Submitted address", address(application)],
                  ["Submitted city", value(application.address_city, application.city)],
                  ["Submitted state", value(application.address_state, application.state)],
                  ["Submitted ZIP", value(application.address_zip, application.zip_code, application.zip)],
                  ["Submitted website", value(application.website_url, application.website)],
                  ["Submitted social profile", value(application.instagram_url, application.social_media_url)],
                ]}
              />
            </Section>
          </div>
        ) : null}

        {tab === "Operations" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Section title="Services and staff">
              <div className="space-y-2">
                {services.slice(0, 12).map((service) => (
                  <div key={text(service.id)} className="flex items-center justify-between gap-3 rounded-lg border border-plum/10 p-3 text-xs">
                    <span>
                      <b>{value(service.customer_facing_name, service.name)}</b>
                      <span className="mt-1 block text-ink/55">
                        {value(service.status, service.is_active === false ? "Inactive" : "Active")}
                      </span>
                    </span>
                    <span>${Number(service.base_price || service.price_display_min || 0).toFixed(2)}</span>
                  </div>
                ))}
                {!services.length ? <p className="text-sm text-ink/55">No services recorded.</p> : null}
              </div>
            </Section>
            <Section title="Team and linked stylist profiles">
              <div className="space-y-2">
                {team.slice(0, 12).map((member) => (
                  <div key={text(member.id)} className="rounded-lg border border-plum/10 p-3 text-xs">
                    <b>{value(member.name, member.email)}</b>
                    <p className="mt-1 text-ink/55">
                      {value(member.role)} · {value(member.status)} · {value(member.email)}
                    </p>
                  </div>
                ))}
                {!team.length ? <p className="text-sm text-ink/55">No team users recorded.</p> : null}
              </div>
            </Section>
          </div>
        ) : null}

        {tab === "Documents" ? (
          <Section title="Application documents">
            <div className="grid gap-3 sm:grid-cols-2">
              {documents.map((document) => (
                <article key={text(document.id)} className="rounded-xl border border-plum/10 p-4 text-xs">
                  <div className="flex items-start gap-3">
                    <FileText className="shrink-0 text-magenta" size={18} />
                    <div className="min-w-0">
                      <b className="block break-words text-plum">{value(document.file_name, document.storage_path)}</b>
                      <p className="mt-1 text-ink/55">
                        {value(document.mime_type)} · {Number(document.size_bytes || 0).toLocaleString()} bytes
                      </p>
                      <p className="mt-1 text-ink/55">
                        {value(document.status)} · attached {when(document.attached_at || document.created_at, zone)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
              {!documents.length ? (
                <p className="text-sm text-ink/55">No supporting documents are linked to this application.</p>
              ) : null}
            </div>
          </Section>
        ) : null}

        {tab === "Audit History" ? (
          <Section title="Salon record activity">
            <div className="space-y-3">
              {management.map((event) => (
                <article key={text(event.id)} className="border-l-2 border-magenta pl-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <b className="text-plum">
                      {value(event.action)} · {value(event.record_label, event.record_type)}
                    </b>
                    <span className="text-ink/45">{when(event.created_at, zone)}</span>
                  </div>
                  {event.reason ? <p className="mt-1 text-ink/65">{text(event.reason)}</p> : null}
                  <p className="mt-1 text-ink/45">Reference {value(event.record_id, event.id)}</p>
                </article>
              ))}
              {!management.length ? (
                <p className="text-sm text-ink/55">No record-management activity is linked to this salon yet.</p>
              ) : null}
            </div>
          </Section>
        ) : null}
      </div>
    </section>
  );
}
