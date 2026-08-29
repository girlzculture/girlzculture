/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { FormEvent, useEffect, useState } from "react";
import { Archive, PackageSearch, Pencil, Search, Tag } from "lucide-react";
import NumericInput from "@/components/forms/NumericInput";
import SafeImage from "@/components/site/SafeImage";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";

type Row = Record<string, any>;

function localDateTime(value?: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 15 * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function relation(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

async function authHeaders(json = false) {
  const session = await getSessionForScope("admin");
  if (!session) throw new Error("Your admin session has expired.");
  return {
    Authorization: `Bearer ${session.access_token}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

const blankForm = () => ({
  id: "",
  product_id: "",
  status: "Draft",
  sort_order: 1,
  starts_at: localDateTime(),
  ends_at: "",
  entitlement_source: "",
  entitlement_reference: "",
  entitlement_id: "",
  internal_note: "",
  reason: "",
});

export default function AdminFeaturedProducts() {
  const [placements, setPlacements] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Row | null>(null);
  const [form, setForm] = useState(blankForm);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/homepage-products", {
      headers: await authHeaders(),
      cache: "no-store",
    });
    const body = (await readApiResponse(
      response,
      "Featured Products could not be loaded.",
    )) as { placements?: Row[]; error?: string };
    if (!response.ok) throw new Error(body.error);
    setPlacements(Array.isArray(body.placements) ? body.placements : []);
  }

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void load().catch((error) =>
          setNotice(
            error instanceof Error
              ? error.message
              : "Featured Products could not be loaded.",
          ),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2 || form.id) {
      const timer = window.setTimeout(() => setProducts([]), 0);
      return () => window.clearTimeout(timer);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/admin/homepage-products?mode=products&q=${encodeURIComponent(query)}`,
            {
              headers: await authHeaders(),
              cache: "no-store",
              signal: controller.signal,
            },
          );
          const body = (await readApiResponse(
            response,
            "Products could not be searched.",
          )) as { products?: Row[] };
          if (response.ok)
            setProducts(Array.isArray(body.products) ? body.products : []);
        } catch {
          // The protected endpoint records unexpected lookup failures.
        }
      })();
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.id, query]);

  function edit(placement: Row) {
    const product = relation(placement.product) as Row;
    setSelectedProduct(product || null);
    setQuery(product?.name || "");
    setForm({
      id: placement.id,
      product_id: placement.product_id,
      status: placement.status,
      sort_order: placement.sort_order,
      starts_at: localDateTime(placement.starts_at),
      ends_at: placement.ends_at ? localDateTime(placement.ends_at) : "",
      entitlement_source: "",
      entitlement_reference: "",
      entitlement_id: placement.entitlement_id || "",
      internal_note: placement.internal_note || "",
      reason: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.product_id) {
      setNotice("Search for and choose an eligible pickup product.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/homepage-products", {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify(form),
      });
      const body = (await readApiResponse(
        response,
        "The Featured Product could not be saved.",
      )) as { placement_id?: string; error?: string };
      if (!response.ok) throw new Error(body.error);
      await load();
      setForm(blankForm());
      setSelectedProduct(null);
      setQuery("");
      setNotice("Featured Product saved and its audit history was updated.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The Featured Product could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function archive(placement: Row) {
    const product = relation(placement.product) as Row;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/homepage-products", {
        method: "POST",
        headers: await authHeaders(true),
        body: JSON.stringify({
          id: placement.id,
          product_id: placement.product_id,
          status: "Archived",
          sort_order: placement.sort_order,
          starts_at: placement.starts_at,
          ends_at: placement.ends_at,
          entitlement_id: placement.entitlement_id,
          internal_note: placement.internal_note,
          reason: "Archived from Featured Products administration.",
        }),
      });
      const body = (await readApiResponse(
        response,
        "The placement could not be archived.",
      )) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      await load();
      setNotice(`${product?.name || "Product"} was archived.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The placement could not be archived.",
      );
    } finally {
      setBusy(false);
    }
  }

  const chosenSalon = relation(selectedProduct?.salon) as Row | undefined;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-[14px] border border-plum/10 bg-white p-5">
        <div className="flex items-center gap-3">
          <PackageSearch className="text-magenta" />
          <div>
            <h2 className="font-serif text-2xl text-plum">
              Featured Products
            </h2>
            <p className="text-xs text-ink/55">
              Curate real, pickup-ready inventory. Active placements require a
              Premium salon or verified funding.
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {placements.length ? (
            placements.map((placement) => {
              const product = relation(placement.product) as Row;
              const salon = relation(product?.salon) as Row;
              const image =
                product?.photo_url ||
                (Array.isArray(product?.images) ? product.images[0] : "") ||
                "/images/braids-knotless.jpg";
              return (
                <article
                  key={placement.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-plum/10 bg-cream/35 p-3"
                >
                  <SafeImage
                    src={image}
                    fallbackSrc="/images/braids-knotless.jpg"
                    alt=""
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate font-serif text-plum">
                      {product?.name || "Unavailable product"}
                    </b>
                    <span className="block text-[10px] text-ink/55">
                      {salon?.name || "Unknown salon"} · Position{" "}
                      {placement.sort_order}
                    </span>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${
                        placement.status === "Active"
                          ? "bg-teal/10 text-teal"
                          : "bg-blush text-plum"
                      }`}
                    >
                      {placement.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => edit(placement)}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-plum/10 text-plum"
                    aria-label={`Edit ${product?.name || "placement"}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    disabled={busy || placement.status === "Archived"}
                    onClick={() => void archive(placement)}
                    className="grid h-10 w-10 place-items-center rounded-lg border border-plum/10 text-magenta gc-disabled-control"
                    aria-label={`Archive ${product?.name || "placement"}`}
                  >
                    <Archive size={15} />
                  </button>
                </article>
              );
            })
          ) : (
            <div className="rounded-xl border border-dashed border-plum/15 p-8 text-center text-sm text-ink/55">
              No product placements have been configured.
            </div>
          )}
        </div>
      </section>

      <form
        onSubmit={save}
        className="h-fit rounded-[14px] border border-plum/10 bg-white p-5"
      >
        <h3 className="font-serif text-xl text-plum">
          {form.id ? "Edit placement" : "Add product placement"}
        </h3>
        <label className="mt-4 block text-[10px] font-bold text-ink">
          Product
          <span className="relative mt-1 block">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40"
            />
            <input
              disabled={Boolean(form.id)}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedProduct(null);
                setForm((current) => ({ ...current, product_id: "" }));
              }}
              placeholder="Search pickup products"
              className="min-h-11 w-full rounded-lg border border-plum/15 pl-9 pr-3 text-xs disabled:bg-cream/50"
            />
          </span>
        </label>
        {!form.id && products.length ? (
          <div className="mt-2 max-h-52 space-y-1 overflow-auto rounded-lg border border-plum/10 p-1">
            {products.map((product) => {
              const salon = relation(product.salon) as Row;
              return (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => {
                    setSelectedProduct(product);
                    setQuery(product.name);
                    setProducts([]);
                    setForm((current) => ({
                      ...current,
                      product_id: product.id,
                    }));
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-blush/40"
                >
                  <span>
                    <b className="block">{product.name}</b>
                    <span className="text-[10px] text-ink/50">
                      {salon?.name} · {salon?.subscription_tier || "No tier"}
                    </span>
                  </span>
                  <span className="font-bold text-teal">
                    ${Number(product.sale_price ?? product.price).toFixed(2)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {selectedProduct ? (
          <p className="mt-2 rounded-lg bg-blush/35 p-3 text-[10px] text-plum">
            <Tag size={13} className="mr-1 inline" />
            {selectedProduct.name} from {chosenSalon?.name}. Current inventory:{" "}
            {selectedProduct.track_inventory
              ? selectedProduct.inventory_quantity
              : "not tracked"}.
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[10px] font-bold">
            Status
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal"
            >
              {["Draft", "Scheduled", "Active", "Paused", "Archived"].map(
                (status) => (
                  <option key={status}>{status}</option>
                ),
              )}
            </select>
          </label>
          <label className="text-[10px] font-bold">
            Position
            <NumericInput
              integer
              min={1}
              max={100}
              value={form.sort_order}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  sort_order: Number(value || 0),
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal"
            />
          </label>
          <label className="text-[10px] font-bold">
            Starts
            <input
              required
              type="datetime-local"
              value={form.starts_at}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  starts_at: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal"
            />
          </label>
          <label className="text-[10px] font-bold">
            Ends (optional)
            <input
              type="datetime-local"
              value={form.ends_at}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ends_at: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal"
            />
          </label>
        </div>
        <details className="mt-4 rounded-lg border border-plum/10 p-3">
          <summary className="cursor-pointer text-xs font-bold text-plum">
            Verified funding (non-Premium salons)
          </summary>
          <div className="mt-3 grid gap-3">
            <select
              value={form.entitlement_source}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  entitlement_source: event.target.value,
                }))
              }
              className="min-h-11 rounded-lg border border-plum/15 px-3 text-xs"
            >
              <option value="">Premium plan eligibility</option>
              <option value="stripe_payment">Stripe payment</option>
              <option value="verified_invoice">Verified invoice</option>
              <option value="platform_credit">Platform credit</option>
            </select>
            <input
              value={form.entitlement_reference}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  entitlement_reference: event.target.value,
                }))
              }
              placeholder="Verified reference"
              className="min-h-11 rounded-lg border border-plum/15 px-3 text-xs"
            />
          </div>
        </details>
        <label className="mt-4 block text-[10px] font-bold">
          Internal note
          <textarea
            value={form.internal_note}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                internal_note: event.target.value,
              }))
            }
            className="mt-1 min-h-20 w-full rounded-lg border border-plum/15 p-3 text-xs font-normal"
          />
        </label>
        {form.id ? (
          <label className="mt-3 block text-[10px] font-bold">
            Change reason
            <input
              required
              minLength={5}
              value={form.reason}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
              className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal"
            />
          </label>
        ) : null}
        <div className="mt-5 flex gap-2">
          {form.id ? (
            <button
              type="button"
              onClick={() => {
                setForm(blankForm());
                setSelectedProduct(null);
                setQuery("");
              }}
              className="min-h-11 flex-1 rounded-lg border border-plum/15 text-xs font-bold text-plum"
            >
              Cancel
            </button>
          ) : null}
          <button
            disabled={busy}
            className="min-h-11 flex-[2] rounded-lg bg-magenta text-xs font-bold text-white gc-disabled-control"
          >
            {busy ? "Saving…" : "Save Featured Product"}
          </button>
        </div>
        {notice ? (
          <p
            role="status"
            className="mt-4 rounded-lg bg-blush/45 p-3 text-xs text-plum"
          >
            {notice}
          </p>
        ) : null}
      </form>
    </div>
  );
}
