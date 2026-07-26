"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarPlus,
  Check,
  LockKeyhole,
  Minus,
  Package,
  Plus,
  Store,
  Trash2,
  Truck,
} from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import { supabase } from "@/lib/supabase";
import {
  clearProductCart,
  readProductCart,
  updateProductCartQuantity,
  writeProductCart,
  type ProductCart,
} from "@/lib/productCart";
import {
  formatUsPhoneInput,
  isValidEmail,
  isValidUsPhone,
} from "@/lib/validation";

type Product = {
  id: string;
  name: string;
  price: number;
  sale_price?: number | null;
  photo_url?: string | null;
  images?: string[] | null;
  pickup_enabled?: boolean;
  shipping_enabled?: boolean;
  shipping_price?: number;
  max_quantity_per_order?: number;
  track_inventory?: boolean;
  inventory_quantity?: number;
};

type Props = {
  salon: { id: string; slug: string; name: string };
  products: Product[];
};

const money = (value: number) => `$${value.toFixed(2)}`;

export default function ProductCheckoutClient({ salon, products }: Props) {
  const searchParams = useSearchParams();
  const [cart, setCart] = useState<ProductCart | null>(null);
  const [fulfillment, setFulfillment] = useState<"Pickup" | "Shipping">(
    "Pickup",
  );
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [shipping, setShipping] = useState({
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
  });
  const [message, setMessage] = useState(
    searchParams.get("payment") === "cancelled"
      ? "Checkout was cancelled. Your items were not purchased."
      : "",
  );
  const [saving, setSaving] = useState(
    () => Boolean(searchParams.get("commerce_session")),
  );
  const [confirmed, setConfirmed] = useState<{
    order?: {
      public_reference?: string;
      fulfillment_status?: string;
      total_amount?: number;
      fulfillment_method?: string;
    };
    booking?: { public_reference?: string; confirmation_code?: string };
  } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()),
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readProductCart();
      setCart(stored?.salonId === salon.id ? stored : null);
      if (stored?.salonId === salon.id) {
        setFulfillment(stored.fulfillmentMethod || "Pickup");
        if (stored.shippingAddress) {
          setShipping({
            line1: stored.shippingAddress.line1 || "",
            line2: stored.shippingAddress.line2 || "",
            city: stored.shippingAddress.city || "",
            state: stored.shippingAddress.state || "",
            postal_code: stored.shippingAddress.postal_code || "",
          });
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [salon.id]);

  useEffect(() => {
    const sessionId = searchParams.get("commerce_session");
    if (!sessionId) return;
    let cancelled = false;
    const poll = async (attempt = 0): Promise<void> => {
      const response = await fetch(
        `/api/stripe/commerce-status?session_id=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "The order status is unavailable.");
      if (cancelled) return;
      if (body.status === "Paid" && body.order) {
        setConfirmed({ order: body.order, booking: body.booking });
        clearProductCart();
        setCart(null);
        setSaving(false);
        return;
      }
      if (attempt < 8) {
        window.setTimeout(() => void poll(attempt + 1), 1200);
        return;
      }
      setMessage(
        "Payment was received and the order is still being finalized. Refresh this page in a moment.",
      );
      setSaving(false);
    };
    void poll().catch(() => {
      if (!cancelled) {
        setMessage("We couldn't confirm the order yet. Refresh in a moment.");
        setSaving(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const rows = useMemo(
    () =>
      (cart?.items || [])
        .map((item) => {
          const product = products.find((entry) => entry.id === item.productId);
          if (!product) return null;
          const price = Number(product.sale_price ?? product.price ?? 0);
          const maximum = Math.max(
            1,
            Math.min(
              Number(product.max_quantity_per_order || 10),
              product.track_inventory
                ? Number(product.inventory_quantity || 0)
                : 1000,
            ),
          );
          return {
            item,
            product,
            price,
            quantity: Math.min(item.quantity, maximum),
            maximum,
          };
        })
        .filter(Boolean) as Array<{
        item: ProductCart["items"][number];
        product: Product;
        price: number;
        quantity: number;
        maximum: number;
      }>,
    [cart, products],
  );
  const pickupAvailable =
    rows.length > 0 && rows.every((row) => row.product.pickup_enabled);
  const shippingAvailable =
    rows.length > 0 && rows.every((row) => row.product.shipping_enabled);
  const subtotal = rows.reduce(
    (sum, row) => sum + row.price * row.quantity,
    0,
  );
  const shippingAmount =
    fulfillment === "Shipping"
      ? rows.reduce(
          (sum, row) => sum + Number(row.product.shipping_price || 0),
          0,
        )
      : 0;

  useEffect(() => {
    if (pickupAvailable || !shippingAvailable) return;
    const timer = window.setTimeout(() => setFulfillment("Shipping"), 0);
    return () => window.clearTimeout(timer);
  }, [pickupAvailable, shippingAvailable]);

  useEffect(() => {
    if (!cart) return;
    writeProductCart({
      ...cart,
      fulfillmentMethod: fulfillment,
      shippingAddress: shipping,
    });
  }, [cart, fulfillment, shipping]);

  function quantity(productId: string, next: number) {
    setCart(updateProductCartQuantity(productId, next));
  }

  async function checkout(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!rows.length) {
      setMessage("Your cart is empty.");
      return;
    }
    if (!contact.name.trim()) {
      setMessage("Enter your name.");
      return;
    }
    if (!isValidEmail(contact.email)) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (contact.phone && !isValidUsPhone(contact.phone)) {
      setMessage("Enter a valid US phone number.");
      return;
    }
    if (
      fulfillment === "Shipping" &&
      (!shipping.line1 ||
        !shipping.city ||
        !/^[A-Za-z]{2}$/.test(shipping.state) ||
        !/^\d{5}(?:-\d{4})?$/.test(shipping.postal_code))
    ) {
      setMessage("Enter a complete US shipping address.");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetch("/api/stripe/commerce-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          salon_id: salon.id,
          guest_name: contact.name,
          guest_email: contact.email,
          guest_phone: contact.phone,
          fulfillment_method: fulfillment,
          shipping_address: shipping,
          items: rows.map((row) => ({
            product_id: row.product.id,
            quantity: row.quantity,
          })),
          product_promotion_id: cart?.promotionId || null,
          idempotency_key: idempotencyKey,
          website: "",
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setIdempotencyKey(
          typeof crypto !== "undefined"
            ? crypto.randomUUID()
            : `${Date.now()}`,
        );
        throw new Error(body.error || "Unable to start checkout.");
      }
      if (body.noPaymentRequired) {
        setConfirmed({
          order: body.order || {
            public_reference: body.order_id,
            fulfillment_status: "New",
            total_amount: 0,
            fulfillment_method: fulfillment,
          },
        });
        clearProductCart();
        setCart(null);
        setSaving(false);
        return;
      }
      if (!body.url) throw new Error("No secure checkout page was returned.");
      window.location.assign(body.url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to start checkout.",
      );
      setSaving(false);
    }
  }

  if (confirmed?.order) {
    return (
      <section className="mx-auto max-w-2xl rounded-[20px] border border-plum/10 bg-white/85 p-7 text-center shadow-[0_18px_50px_rgba(13,17,20,0.07)] sm:p-12">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-magenta text-white">
          <Check size={38} />
        </span>
        <h1 className="mt-6 font-serif text-4xl font-semibold text-plum">
          Your order is confirmed.
        </h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          {salon.name} received your{" "}
          {String(
            confirmed.order.fulfillment_method || fulfillment,
          ).toLowerCase()}{" "}
          order.
        </p>
        <div className="mt-6 rounded-xl bg-blush/45 p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-magenta">
            Order reference
          </p>
          <p className="mt-1 font-serif text-2xl font-bold text-plum">
            {confirmed.order.public_reference || "Finalizing"}
          </p>
          {confirmed.booking ? (
            <p className="mt-3 text-xs text-ink/65">
              Appointment:{" "}
              <b>
                {confirmed.booking.public_reference ||
                  confirmed.booking.confirmation_code}
              </b>
            </p>
          ) : null}
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href={`/salon/${salon.slug}`}
            className="rounded-[10px] border border-plum/15 px-5 py-3 text-sm font-bold text-plum"
          >
            Back to Salon
          </Link>
          <Link
            href="/account?tab=orders"
            className="rounded-[10px] bg-magenta px-5 py-3 text-sm font-bold text-white"
          >
            View My Orders
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={checkout} className="grid gap-6 lg:grid-cols-[1fr_.72fr]">
      <div className="space-y-6">
        <section className="rounded-[18px] border border-plum/10 bg-white/80 p-5 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-magenta">
                One-salon cart
              </p>
              <h2 className="mt-1 font-serif text-2xl text-plum">
                Products from {salon.name}
              </h2>
            </div>
            <Package className="text-plum/35" />
          </div>
          <div className="mt-5 divide-y divide-plum/10">
            {rows.map(({ item, product, price, quantity: value, maximum }) => (
              <div
                key={product.id}
                className="grid grid-cols-[64px_1fr_auto] gap-3 py-4"
              >
                <div className="relative h-16 overflow-hidden rounded-lg bg-blush/40">
                  {product.photo_url || product.images?.[0] ? (
                    <SafeImage
                      src={String(product.photo_url || product.images?.[0])}
                      fallbackSrc={String(
                        product.photo_url || product.images?.[0],
                      )}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div>
                  <b className="text-sm">{product.name}</b>
                  <p className="mt-1 text-xs text-ink/55">{money(price)} each</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease ${product.name}`}
                      onClick={() => quantity(product.id, value - 1)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-plum/15"
                    >
                      <Minus size={12} />
                    </button>
                    <b className="min-w-5 text-center text-xs">{value}</b>
                    <button
                      type="button"
                      aria-label={`Increase ${product.name}`}
                      disabled={value >= maximum}
                      onClick={() => quantity(product.id, value + 1)}
                      className="grid h-7 w-7 place-items-center rounded-md border border-plum/15 disabled:opacity-40"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <b className="text-sm">{money(price * value)}</b>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => quantity(product.id, 0)}
                    className="mt-3 block w-full text-right text-magenta"
                  >
                    <Trash2 size={15} className="ml-auto" />
                  </button>
                </div>
              </div>
            ))}
            {!rows.length ? (
              <div className="py-10 text-center text-sm text-ink/55">
                Your cart is empty.{" "}
                <Link
                  href={`/salon/${salon.slug}#products`}
                  className="font-bold text-magenta"
                >
                  Browse products
                </Link>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[18px] border border-plum/10 bg-white/80 p-5 sm:p-7">
          <h2 className="font-serif text-2xl text-plum">How should we get it to you?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!pickupAvailable}
              onClick={() => setFulfillment("Pickup")}
              className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-40 ${fulfillment === "Pickup" ? "border-magenta bg-blush/35" : "border-plum/10"}`}
            >
              <Store className="text-magenta" size={20} />
              <b className="mt-2 block text-sm">Salon pickup</b>
              <span className="text-[11px] text-ink/55">
                The salon confirms when it is ready.
              </span>
            </button>
            <button
              type="button"
              disabled={!shippingAvailable}
              onClick={() => setFulfillment("Shipping")}
              className={`rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-40 ${fulfillment === "Shipping" ? "border-magenta bg-blush/35" : "border-plum/10"}`}
            >
              <Truck className="text-magenta" size={20} />
              <b className="mt-2 block text-sm">US shipping</b>
              <span className="text-[11px] text-ink/55">
                Tracking is supplied after shipment.
              </span>
            </button>
          </div>
        </section>

        <section className="rounded-[18px] border border-plum/10 bg-white/80 p-5 sm:p-7">
          <h2 className="font-serif text-2xl text-plum">Contact details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              value={contact.name}
              onChange={(name) => setContact({ ...contact, name })}
            />
            <Field
              label="Email"
              type="email"
              value={contact.email}
              onChange={(email) => setContact({ ...contact, email })}
            />
            <Field
              label="US phone"
              type="tel"
              value={contact.phone}
              onChange={(phone) =>
                setContact({ ...contact, phone: formatUsPhoneInput(phone) })
              }
            />
          </div>
          {fulfillment === "Shipping" ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Street address"
                  value={shipping.line1}
                  onChange={(line1) => setShipping({ ...shipping, line1 })}
                />
              </div>
              <div className="sm:col-span-2">
                <Field
                  label="Apartment or suite (optional)"
                  value={shipping.line2}
                  onChange={(line2) => setShipping({ ...shipping, line2 })}
                />
              </div>
              <Field
                label="City"
                value={shipping.city}
                onChange={(city) => setShipping({ ...shipping, city })}
              />
              <Field
                label="State"
                maxLength={2}
                value={shipping.state}
                onChange={(state) =>
                  setShipping({
                    ...shipping,
                    state: state.toUpperCase().replace(/[^A-Z]/g, ""),
                  })
                }
              />
              <Field
                label="ZIP code"
                value={shipping.postal_code}
                onChange={(postal_code) =>
                  setShipping({ ...shipping, postal_code })
                }
              />
            </div>
          ) : null}
        </section>
      </div>

      <aside className="h-fit rounded-[18px] border border-plum/10 bg-white/90 p-5 shadow-[0_18px_50px_rgba(13,17,20,0.06)] sm:p-7 lg:sticky lg:top-6">
        <h2 className="font-serif text-2xl text-plum">Order summary</h2>
        <div className="mt-5 space-y-3 text-sm">
          <Line label="Products" value={money(subtotal)} />
          {cart?.promotionId ? (
            <Line
              label={cart.promotionLabel || "Product offer"}
              value="Verified at checkout"
            />
          ) : null}
          <Line
            label="Shipping"
            value={
              fulfillment === "Shipping"
                ? shippingAmount
                  ? money(shippingAmount)
                  : "Free"
                : "Pickup"
            }
          />
          <Line label="Tax" value="Calculated before payment" />
          <div className="border-t border-plum/10 pt-4">
            <Line
              label={
                cart?.promotionId
                  ? "Subtotal before offer and tax"
                  : "Subtotal before tax"
              }
              value={money(subtotal + shippingAmount)}
              strong
            />
          </div>
        </div>
        <p className="mt-4 text-[10px] leading-5 text-ink/50">
          Inventory, live prices, fulfillment eligibility, promotions, tax,
          shipping, and the final total are verified by the server before
          payment.
        </p>
        <button
          disabled={saving || !rows.length}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-magenta px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          <LockKeyhole size={16} />
          {saving ? "Starting secure checkout…" : "Continue to Secure Payment"}
        </button>
        <Link
          href={`/salon/${salon.slug}/book?with_products=1`}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-plum/15 text-xs font-bold text-plum"
        >
          <CalendarPlus size={16} />
          Add an appointment
        </Link>
        {message ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700"
          >
            {message}
          </p>
        ) : null}
        <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-ink/50">
          <LockKeyhole size={13} />
          Stripe test mode · encrypted checkout
        </p>
      </aside>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="block text-[11px] font-bold">
      {label}
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-[9px] border border-plum/15 bg-white px-3 text-sm font-normal outline-none focus:border-magenta"
      />
    </label>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${strong ? "font-serif text-xl font-bold text-plum" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
