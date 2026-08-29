"use client";

import { FormEvent, useState } from "react";
import { CircleDollarSign, LockKeyhole, MapPin } from "lucide-react";
import SafeImage from "@/components/site/SafeImage";
import { readApiResponse } from "@/lib/apiResponseClient";
import { getSessionForScope } from "@/lib/supabase";

type Props = {
  salonId: string;
  salonName: string;
  salonAddress: string;
  productId: string;
  productName: string;
  productImage: string | null;
  quantity: number;
  originalTotal: number;
  discountedTotal: number;
  promotionId: string | null;
  promotionLabel: string | null;
  depositAmount: number;
  remainingBalance: number;
  deadlineHours: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export default function PickupReservationForm(props: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [managementToken] = useState(
    () =>
      `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const session = await getSessionForScope("customer");
      const response = await fetch("/api/stripe/pickup-reservation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          salon_id: props.salonId,
          product_id: props.productId,
          quantity: props.quantity,
          product_promotion_id: props.promotionId,
          guest_name: values.get("name"),
          guest_email: values.get("email"),
          guest_phone: values.get("phone"),
          website: values.get("website"),
          idempotency_key: idempotencyKey,
          management_token: managementToken,
        }),
      });
      const body = (await readApiResponse(
        response,
        "We couldn't start this pickup reservation.",
      )) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        throw new Error(
          body.error || "We couldn't start this pickup reservation.",
        );
      }
      window.location.assign(body.url);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't start this pickup reservation.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_390px]">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-mist bg-white p-5 shadow-sm sm:p-7"
      >
        <h1 className="text-3xl font-semibold tracking-tight text-charcoal">
          Reserve for Pickup
        </h1>
        <p className="mt-2 text-sm leading-6 text-charcoal/65">
          No appointment is required. Enter your contact details, then pay the
          reservation deposit through secure Stripe checkout.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            name="name"
            autoComplete="name"
            placeholder="Your full name"
          />
          <Field
            label="US phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="(555) 123-4567"
          />
          <div className="sm:col-span-2">
            <Field
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
            />
          </div>
          <label className="hidden" aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <div className="mt-6 rounded-xl border border-mist bg-light-gray p-4">
          <p className="flex items-start gap-3 text-sm text-charcoal">
            <MapPin className="mt-0.5 shrink-0 text-teal" size={18} />
            <span>
              <b className="block">Pickup from {props.salonName}</b>
              <span className="mt-1 block text-xs text-charcoal/60">
                {props.salonAddress}
              </span>
            </span>
          </p>
          <p className="mt-4 flex items-start gap-3 text-sm text-charcoal">
            <CircleDollarSign
              className="mt-0.5 shrink-0 text-teal"
              size={18}
            />
            <span>
              <b className="block">
                Deposit {money(props.depositAmount)}
              </b>
              <span className="mt-1 block text-xs text-charcoal/60">
                {money(props.remainingBalance)} remains due at pickup.
              </span>
            </span>
          </p>
        </div>
        <label className="mt-5 flex items-start gap-3 text-sm leading-5 text-charcoal/70">
          <input
            required
            type="checkbox"
            className="mt-1 h-4 w-4 accent-teal"
          />
          I understand the salon will notify me when the order is ready, and
          it must be collected within approximately {props.deadlineHours} hours.
        </label>
        {message ? (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-coral/30 bg-coral/5 p-3 text-sm text-charcoal"
          >
            {message}
          </p>
        ) : null}
        <button
          disabled={busy}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-6 text-sm font-bold text-white gc-disabled-control"
        >
          <LockKeyhole size={17} />
          {busy
            ? "Opening secure checkout…"
            : `Pay ${money(props.depositAmount)} deposit`}
        </button>
        <p className="mt-3 text-center text-xs text-charcoal/50">
          Payment is processed securely by Stripe.
        </p>
      </form>

      <aside className="h-fit rounded-2xl border border-mist bg-white p-5 shadow-sm sm:p-6">
        <div className="flex gap-4">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-mist">
            {props.productImage ? (
              <SafeImage
                src={props.productImage}
                fallbackSrc={props.productImage}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div>
            <h2 className="font-semibold text-charcoal">
              {props.productName}
            </h2>
            <p className="mt-1 text-xs text-charcoal/55">
              Quantity {props.quantity}
            </p>
            {props.promotionLabel ? (
              <span className="mt-2 inline-flex rounded-full bg-coral/10 px-2.5 py-1 text-[11px] font-bold text-coral">
                {props.promotionLabel}
              </span>
            ) : null}
          </div>
        </div>
        <dl className="mt-6 space-y-3 border-t border-mist pt-5 text-sm">
          {props.originalTotal !== props.discountedTotal ? (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-charcoal/60">Original total</dt>
                <dd className="text-charcoal/50 line-through">
                  {money(props.originalTotal)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-charcoal/60">Promotion</dt>
                <dd className="font-semibold text-teal">
                  −{money(props.originalTotal - props.discountedTotal)}
                </dd>
              </div>
            </>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-charcoal">Product total</dt>
            <dd className="font-semibold text-charcoal">
              {money(props.discountedTotal)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-charcoal">Deposit today</dt>
            <dd className="font-semibold text-teal">
              {money(props.depositAmount)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-charcoal/60">Balance at pickup</dt>
            <dd className="text-charcoal">
              {money(props.remainingBalance)}
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder: string;
  autoComplete: string;
  inputMode?: "tel";
}) {
  return (
    <label className="block text-sm font-semibold text-charcoal">
      {label}
      <input
        required
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="mt-2 min-h-12 w-full rounded-xl border border-mist bg-white px-4 text-sm text-charcoal outline-none focus:border-teal focus:ring-2 focus:ring-teal/15"
      />
    </label>
  );
}
