/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Monitor,
  Save,
} from "lucide-react";
import { getSessionForScope } from "@/lib/supabase";
import {
  moveHomepageSection,
  normalizeHomepageSectionOrder,
  type HomepageSectionOrderRow,
  type RequiredHomepageSectionKey,
} from "@/lib/homepageSectionOrderingCore";

const LABELS: Record<RequiredHomepageSectionKey, string> = {
  promo_rail: "Promotional rail",
  salons_near_you: "Salons Near You",
  featured_salons: "Featured Salons",
  trending_picks: "Trending Picks This Week",
};

export default function AdminHomepageMarketing(
  props: {
    salons?: unknown[];
    acceptanceInitialSections?: HomepageSectionOrderRow[];
    acceptancePublish?: (
      sections: HomepageSectionOrderRow[],
    ) => Promise<HomepageSectionOrderRow[]>;
  } = {},
) {
  const [sections, setSections] = useState<HomepageSectionOrderRow[]>(() =>
    normalizeHomepageSectionOrder(props.acceptanceInitialSections || []),
  );
  const [draggedKey, setDraggedKey] =
    useState<RequiredHomepageSectionKey | null>(null);
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function headers() {
    const session = await getSessionForScope("admin");
    if (!session) throw new Error("Admin sign-in required.");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function load() {
    const response = await fetch("/api/admin/marketing", {
      headers: await headers(),
      cache: "no-store",
    });
    const body = (await response.json()) as {
      sections?: unknown;
      error?: string;
    };
    if (!response.ok)
      throw new Error(body.error || "Unable to load homepage controls.");
    setSections(normalizeHomepageSectionOrder(body.sections));
  }

  useEffect(() => {
    if (props.acceptanceInitialSections) return;
    void load().catch((error) =>
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to load homepage controls.",
      ),
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function move(key: RequiredHomepageSectionKey, targetIndex: number) {
    setSections((current) =>
      moveHomepageSection(current, key, targetIndex),
    );
  }

  async function publish() {
    setBusy(true);
    setNotice("");
    try {
      if (props.acceptancePublish) {
        const saved = await props.acceptancePublish(sections);
        setSections(normalizeHomepageSectionOrder(saved));
        setNotice(
          "Homepage order published and verified. Mobile, tablet, and desktop now use this same order.",
        );
        return;
      }
      const response = await fetch("/api/admin/marketing", {
        method: "POST",
        headers: {
          ...(await headers()),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ kind: "section_order", sections }),
      });
      const body = (await response.json()) as {
        sections?: unknown;
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error || "Unable to publish homepage order.");
      setSections(normalizeHomepageSectionOrder(body.sections));
      setNotice(
        "Homepage order published and verified. Mobile, tablet, and desktop now use this same order.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to publish homepage order.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[14px] border border-plum/10 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Monitor className="mt-1 text-magenta" />
            <div>
              <h2 className="font-serif text-2xl text-plum">
                Homepage section order
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-ink/55">
                Drag rows or use Move Up and Move Down. One published order is
                authoritative on every device.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={preview}
            onClick={() => setPreview((current) => !current)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-plum/15 px-4 text-xs font-bold text-plum"
          >
            <Eye size={15} />
            {preview ? "Close preview" : "Preview draft order"}
          </button>
        </div>

        {preview ? (
          <div
            aria-label="Homepage order preview"
            className="mt-5 rounded-[14px] border border-dashed border-magenta/30 bg-cream/55 p-4"
          >
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-magenta">
              Draft preview · not published
            </p>
            <ol className="mt-3 space-y-2">
              {sections.map((section, index) => (
                <li
                  key={section.section_key}
                  className={`flex items-center gap-3 rounded-lg border bg-white p-3 ${
                    section.is_visible
                      ? "border-plum/10"
                      : "border-dashed border-plum/15 opacity-55"
                  }`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-plum text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="font-serif text-lg text-plum">
                    {section.title}
                  </span>
                  {!section.is_visible ? (
                    <span className="ml-auto text-[10px] font-bold uppercase text-ink/45">
                      Hidden
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {sections.map((section, index) => (
            <article
              key={section.section_key}
              draggable
              onDragStart={() => setDraggedKey(section.section_key)}
              onDragEnd={() => setDraggedKey(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedKey) move(draggedKey, index);
                setDraggedKey(null);
              }}
              className={`grid gap-3 rounded-[12px] border bg-cream/35 p-4 transition sm:grid-cols-[36px_1fr_auto] sm:items-center ${
                draggedKey === section.section_key
                  ? "border-magenta opacity-60"
                  : "border-plum/10"
              }`}
            >
              <button
                type="button"
                aria-label={`Drag ${LABELS[section.section_key]}`}
                className="hidden h-9 w-9 cursor-grab place-items-center rounded-lg text-plum/55 sm:grid"
              >
                <GripVertical size={18} />
              </button>
              <label className="text-[10px] font-bold">
                Public heading
                <input
                  value={section.title}
                  onChange={(event) =>
                    setSections((current) =>
                      current.map((row) =>
                        row.section_key === section.section_key
                          ? { ...row, title: event.target.value }
                          : row,
                      ),
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={`Move ${LABELS[section.section_key]} up`}
                  disabled={index === 0}
                  onClick={() => move(section.section_key, index - 1)}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-plum/15 bg-white text-plum disabled:opacity-30"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${LABELS[section.section_key]} down`}
                  disabled={index === sections.length - 1}
                  onClick={() => move(section.section_key, index + 1)}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-plum/15 bg-white text-plum disabled:opacity-30"
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  aria-pressed={section.is_visible}
                  onClick={() =>
                    setSections((current) =>
                      current.map((row) =>
                        row.section_key === section.section_key
                          ? { ...row, is_visible: !row.is_visible }
                          : row,
                      ),
                    )
                  }
                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-[10px] font-bold ${
                    section.is_visible
                      ? "bg-green-100 text-green-800"
                      : "bg-blush text-plum"
                  }`}
                >
                  {section.is_visible ? (
                    <Eye size={14} />
                  ) : (
                    <EyeOff size={14} />
                  )}
                  {section.is_visible ? "Shown" : "Hidden"}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-plum/10 pt-4">
          <p className="max-w-xl text-[10px] leading-4 text-ink/55">
            Publishing validates all four required sections, prevents duplicate
            positions, stores the acting administrator, and invalidates the
            public homepage cache.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void publish()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-magenta px-5 text-xs font-bold text-white disabled:opacity-55"
          >
            <Save size={15} />
            {busy ? "Publishing…" : "Save and Publish"}
          </button>
        </div>
      </section>

      <section className="rounded-[14px] border border-plum/10 bg-blush/35 p-5">
        <h3 className="font-serif text-xl text-plum">
          Promotional cards live in Content Management
        </h3>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-ink/65">
          Open the Home page in Content Management to edit all eight image or
          animated GIF cards, their links, schedules, status, order, and
          optional salon or paid-campaign association. Promotional video
          remains intentionally deferred for the pilot.
        </p>
      </section>

      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-blush/55 p-3 text-sm text-plum"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}
