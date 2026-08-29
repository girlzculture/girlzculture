"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum";

const card = "min-w-0 max-w-full rounded-2xl border border-ink/15 bg-white p-[16px] shadow-sm sm:p-[20px]";

type FormErrors = {
  email?: string;
  message?: string;
};

const subscribeToHydration = () => () => undefined;
const getHydratedClientSnapshot = () => true;
const getHydratedServerSnapshot = () => false;

export default function AccessibilityStatesAcceptanceHarness() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    getHydratedClientSnapshot,
    getHydratedServerSnapshot,
  );
  const [activationCount, setActivationCount] = useState(0);
  const [blockedAttemptCount, setBlockedAttemptCount] = useState(0);
  const [promptSelection, setPromptSelection] = useState("");
  const [selectedStylist, setSelectedStylist] = useState(false);
  const [customControlPressed, setCustomControlPressed] = useState(false);
  const [customControlCount, setCustomControlCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState("Acceptance fixture is ready.");
  const [alert, setAlert] = useState("No operational errors are active.");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const modalTriggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const modalWasOpenRef = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!modalOpen) return;
    modalCloseRef.current?.focus();

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setModalOpen(false);
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [modalOpen]);

  useEffect(() => {
    if (modalOpen) {
      modalWasOpenRef.current = true;
    } else if (modalWasOpenRef.current) {
      modalWasOpenRef.current = false;
      modalTriggerRef.current?.focus();
    }
  }, [modalOpen]);

  function preventDisabledActivation(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    setBlockedAttemptCount((count) => count + 1);
  }

  function activateCustomControl(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    setCustomControlPressed((pressed) => !pressed);
    setCustomControlCount((count) => count + 1);
  }

  function handleValidation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("acceptance-email") ?? "").trim();
    const message = String(data.get("acceptance-message") ?? "").trim();
    const nextErrors: FormErrors = {};

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextErrors.email = "Enter a complete email address, such as name@example.com.";
    }
    if (message.length < 10) {
      nextErrors.message = "Enter at least 10 characters so the support team can help.";
    }

    setErrors(nextErrors);
    if (nextErrors.email) emailRef.current?.focus();
    else if (nextErrors.message) messageRef.current?.focus();
    else {
      setSubmitted(true);
      setToast("Validation fixture submitted successfully.");
    }
  }

  return (
    <main className="min-h-screen max-w-full overflow-x-clip bg-cream px-[16px] py-[32px] text-ink sm:px-[24px] lg:px-[40px]">
      <span
        className="sr-only"
        data-testid="acceptance-harness-ready"
        data-hydrated={hydrated ? "true" : "false"}
      >
        {hydrated ? "Interactive acceptance fixture ready" : "Acceptance fixture hydrating"}
      </span>
      <div className="mx-auto max-w-7xl">
        <header className="max-w-full rounded-3xl bg-plum px-[20px] py-[32px] text-white sm:px-[32px]">
          <p
            className="text-sm font-bold uppercase tracking-[0.18em] text-white"
            data-contrast-role="eyebrow"
          >
            Internal deterministic acceptance fixture
          </p>
          <h1
            className="mt-3 max-w-4xl break-words font-serif text-4xl font-semibold leading-tight text-white sm:text-5xl"
            data-contrast-role="display-heading"
          >
            Readability and interaction states
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white" data-contrast-role="inverse-body">
            This page uses local fixture data only. It does not represent a signed-in user, contact a
            provider, create a booking, or mutate production data.
          </p>
        </header>

        <nav aria-label="Acceptance fixture sections" className="my-6 flex flex-wrap gap-2">
          {[
            ["Customer", "#customer-account"],
            ["Salon and stylist", "#salon-stylist"],
            ["Checkout", "#booking-checkout"],
            ["Admin finance", "#admin-finance"],
            ["Validation", "#validation-fixture"],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className={`min-w-0 max-w-full whitespace-normal rounded-full border border-plum bg-white px-[16px] py-[8px] text-sm font-semibold text-plum [overflow-wrap:anywhere] ${focusRing}`}
              data-contrast-role="outline-link"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="grid gap-6 lg:grid-cols-2">
          <section id="customer-account" aria-labelledby="customer-heading" className={card}>
            <p className="text-sm font-bold uppercase tracking-wide text-plum" data-contrast-role="section-label">
              Customer account
            </p>
            <h2 id="customer-heading" className="mt-2 font-serif text-3xl text-plum" data-contrast-role="section-heading">
              Welcome back, Janel
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <article className="rounded-xl border border-ink/15 bg-cream p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-serif text-xl text-plum">Upcoming booking</h3>
                  <span className="gc-state-active rounded-full border px-3 py-1 text-xs font-bold" data-contrast-role="active-badge" data-visual-state="active">
                    Active
                  </span>
                </div>
                <p className="mt-3 font-semibold">Knotless braids</p>
                <p className="mt-1 text-sm text-ink" data-contrast-role="supporting-text">
                  Acceptance Salon · September 12 at 10:00 AM
                </p>
              </article>
              <article className="rounded-xl border border-ink/15 bg-white p-4">
                <h3 className="font-serif text-xl text-plum">Past booking</h3>
                <p className="mt-3 font-semibold">Silk press</p>
                <p className="mt-1 text-sm text-ink">Completed August 14</p>
                <span className="gc-state-completed mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold" data-testid="completed-state" data-contrast-role="completed-badge" data-visual-state="completed">
                  Completed
                </span>
              </article>
            </div>
            <div className="mt-4 rounded-xl border border-dashed border-ink/40 bg-white p-4 text-center" data-testid="empty-state">
              <h3 className="font-serif text-xl text-plum">No saved salons yet</h3>
              <p className="mt-1 text-sm text-ink">Favorites will appear here after a customer saves one.</p>
            </div>
          </section>

          <section id="salon-stylist" aria-labelledby="salon-heading" className={card}>
            <p className="text-sm font-bold uppercase tracking-wide text-plum">Salon and stylist</p>
            <h2 id="salon-heading" className="mt-2 font-serif text-3xl text-plum">Acceptance Salon</h2>
            <p className="mt-2 text-ink">Verified salon fixture · 4.8 rating · 156 reviews</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={selectedStylist}
                onClick={() => setSelectedStylist((value) => !value)}
                className={`rounded-xl p-4 text-left ${selectedStylist ? "gc-state-selected" : "gc-state-inactive border"} ${focusRing}`}
                data-testid="selected-stylist"
                data-contrast-role={selectedStylist ? "selected-control" : "available-control"}
                data-visual-state={selectedStylist ? "selected" : "inactive"}
              >
                <span className="block font-serif text-xl">Jasmine P.</span>
                <span className="mt-1 block text-sm font-semibold">
                  {selectedStylist ? "Selected" : "Available"} · Knotless specialist
                </span>
              </button>
              <div className="gc-state-inactive rounded-xl border p-4" data-testid="inactive-state" data-visual-state="inactive">
                <p className="font-serif text-xl text-plum">Tiffany M.</p>
                <p className="mt-1 text-sm text-ink">Inactive · not accepting bookings</p>
              </div>
              <button
                type="button"
                aria-disabled="true"
                onClick={preventDisabledActivation}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") preventDisabledActivation(event);
                }}
                className={`gc-state-unavailable rounded-xl border p-4 text-left ${focusRing}`}
                data-testid="unavailable-control"
                data-visual-state="unavailable"
              >
                <span className="block font-serif text-xl">Nia S.</span>
                <span className="mt-1 block text-sm font-semibold">Unavailable for this time</span>
              </button>
              <div role="group" className="rounded-xl border border-ink/20 bg-white p-4" aria-label="Salon advertising eligibility">
                <p className="font-serif text-xl text-plum">Premium placement</p>
                <p className="mt-1 text-sm text-ink">Active salon advertising eligibility</p>
              </div>
            </div>
          </section>

          <section id="booking-checkout" aria-labelledby="checkout-heading" className={card}>
            <p className="text-sm font-bold uppercase tracking-wide text-plum">Booking and checkout</p>
            <h2 id="checkout-heading" className="mt-2 font-serif text-3xl text-plum">Review your total</h2>
            <dl className="mt-5 divide-y divide-ink/15 rounded-xl border border-ink/15 bg-cream px-[16px]" data-testid="booking-totals">
              <div className="flex items-center justify-between gap-4 py-3">
                <dt>Service total</dt><dd className="font-semibold">$240.00</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt>Reservation deposit (10%)</dt><dd className="font-semibold">$24.00</dd>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <dt>Balance due at salon</dt><dd className="font-semibold">$216.00</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-xl bg-plum p-4 font-semibold text-white" data-contrast-role="checkout-notice">
              The deposit is credited toward the service total. This fixture does not collect payment.
            </p>
          </section>

          <section id="admin-finance" aria-labelledby="finance-heading" className={card}>
            <p className="text-sm font-bold uppercase tracking-wide text-plum">Admin finance and reporting</p>
            <h2 id="finance-heading" className="mt-2 font-serif text-3xl text-plum">Deposit report</h2>
            <dl className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-ink/15 bg-cream p-[16px]">
                <dt className="text-sm font-semibold text-ink">Deposits collected</dt>
                <dd className="mt-1 font-serif text-2xl text-plum" data-testid="finance-deposits-collected">$42.00</dd>
              </div>
              <div className="min-w-0 rounded-xl border border-ink/15 bg-cream p-[16px]">
                <dt className="text-sm font-semibold text-ink">Balance due at salons</dt>
                <dd className="mt-1 font-serif text-2xl text-plum" data-testid="finance-balance-due">$378.00</dd>
              </div>
            </dl>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full table-fixed border-collapse text-left text-sm [&_td]:break-words [&_th]:break-words">
                <caption className="pb-3 text-left font-semibold text-ink">Deterministic finance transactions</caption>
                <thead className="bg-plum text-white" data-contrast-role="table-header">
                  <tr>
                    <th scope="col" className="px-3 py-3">Reference</th>
                    <th scope="col" className="px-3 py-3">Customer</th>
                    <th scope="col" className="px-3 py-3">Deposit</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ink/15">
                    <th scope="row" className="px-3 py-3 font-semibold">GC-1001</th>
                    <td className="px-3 py-3">Janel S.</td>
                    <td className="px-3 py-3">$24.00</td>
                    <td className="px-3 py-3"><span className="font-semibold text-plum">Completed</span></td>
                  </tr>
                  <tr>
                    <th scope="row" className="px-3 py-3 font-semibold">GC-1002</th>
                    <td className="px-3 py-3">Amina R.</td>
                    <td className="px-3 py-3">$18.00</td>
                    <td className="px-3 py-3"><span className="font-semibold text-ink">Pending</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="policy-fixture" aria-labelledby="policy-heading" className={card}>
            <p className="text-sm font-bold uppercase tracking-wide text-plum">Policy content</p>
            <h2 id="policy-heading" className="mt-2 font-serif text-3xl text-plum">Deposit and refund policy</h2>
            <p className="mt-3 leading-7 text-ink" data-contrast-role="policy-copy">
              Customers receive the complete price before confirming. Cancellation and refund terms must
              be reviewed before a reservation is submitted.
            </p>
            <Link href="/legal" className={`mt-4 inline-flex font-semibold text-plum underline decoration-2 underline-offset-4 ${focusRing}`}>
              Read legal and policy information
            </Link>
          </section>

          <section id="advertising-fixture" aria-labelledby="advertising-heading" className={card}>
            <p className="text-sm font-bold uppercase tracking-wide text-plum">Advertising disclosure</p>
            <article className="mt-2 rounded-xl border border-plum bg-cream p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-plum" data-contrast-role="sponsored-label">Sponsored</p>
              <h2 id="advertising-heading" className="mt-2 font-serif text-3xl text-plum">Featured salon placement</h2>
              <p className="mt-2 leading-7 text-ink">
                Paid placement is clearly identified and never changes the verified-review score.
              </p>
            </article>
          </section>

          <section id="interaction-fixture" aria-labelledby="interaction-heading" className={card}>
            <p className="text-sm font-bold uppercase tracking-wide text-plum">Interaction states</p>
            <h2 id="interaction-heading" className="mt-2 font-serif text-3xl text-plum">Controls and feedback</h2>
            <div className="mt-5 flex max-w-full flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActivationCount((count) => count + 1)}
                className={`gc-state-active max-w-full whitespace-normal rounded-lg border px-[16px] py-[12px] font-semibold [overflow-wrap:anywhere] ${focusRing}`}
                data-contrast-role="primary-button"
                data-testid="active-control"
                data-visual-state="active"
              >
                Active control
              </button>
              <button
                type="button"
                disabled
                onClick={() => setActivationCount((count) => count + 1)}
                className="gc-disabled-control gc-state-disabled max-w-full whitespace-normal rounded-lg border px-[16px] py-[12px] font-semibold [overflow-wrap:anywhere]"
                data-testid="native-disabled-control"
                data-visual-state="disabled"
              >
                Disabled control
              </button>
              <button
                type="button"
                aria-disabled="true"
                onClick={preventDisabledActivation}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") preventDisabledActivation(event);
                }}
                className={`gc-state-unavailable max-w-full whitespace-normal rounded-lg border px-[16px] py-[12px] font-semibold [overflow-wrap:anywhere] ${focusRing}`}
                data-testid="aria-disabled-control"
                data-visual-state="unavailable"
              >
                Unavailable control
              </button>
              <button
                type="button"
                aria-busy="true"
                onClick={preventDisabledActivation}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") preventDisabledActivation(event);
                }}
                className={`gc-state-loading max-w-full whitespace-normal rounded-lg px-[16px] py-[12px] font-semibold [overflow-wrap:anywhere] ${focusRing}`}
                data-testid="loading-control"
                data-contrast-role="loading-button"
                data-visual-state="loading"
              >
                <span role="status">Loading availability…</span>
              </button>
            </div>
            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2" aria-label="Native disabled form controls">
              <label className="min-w-0 text-sm font-semibold text-ink">
                Disabled text input
                <input
                  disabled
                  defaultValue="Unavailable"
                  onClick={() => setActivationCount((count) => count + 1)}
                  className="gc-disabled-control mt-2 min-h-11 w-full min-w-0 rounded-lg border border-ink/35 px-[12px]"
                  data-testid="disabled-input"
                />
              </label>
              <label className="min-w-0 text-sm font-semibold text-ink">
                Disabled textarea
                <textarea
                  disabled
                  defaultValue="Unavailable"
                  onClick={() => setActivationCount((count) => count + 1)}
                  className="gc-disabled-control mt-2 min-h-20 w-full min-w-0 rounded-lg border border-ink/35 px-[12px] py-[8px]"
                  data-testid="disabled-textarea"
                />
              </label>
              <label className="min-w-0 text-sm font-semibold text-ink">
                Disabled select
                <select
                  disabled
                  defaultValue="unavailable"
                  onClick={() => setActivationCount((count) => count + 1)}
                  className="gc-disabled-control mt-2 min-h-11 w-full min-w-0 rounded-lg border border-ink/35 px-[12px]"
                  data-testid="disabled-select"
                >
                  <option value="unavailable">Unavailable option</option>
                </select>
              </label>
              <div className="min-w-0 rounded-lg border border-ink/20 p-[12px]">
                <p className="text-sm font-semibold text-ink">Disabled choices</p>
                <label className="mt-2 flex min-w-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled
                    onChange={() => setActivationCount((count) => count + 1)}
                    data-testid="disabled-checkbox"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">Disabled checkbox</span>
                </label>
                <label className="mt-2 flex min-w-0 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="disabled-choice"
                    disabled
                    onChange={() => setActivationCount((count) => count + 1)}
                    data-testid="disabled-radio"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">Disabled radio</span>
                </label>
              </div>
            </div>
            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2" aria-label="ARIA-disabled custom controls">
              <a
                href="#activation-target"
                aria-disabled="true"
                onClick={preventDisabledActivation}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") preventDisabledActivation(event);
                }}
                className={`gc-state-unavailable min-w-0 rounded-lg border px-[16px] py-[12px] font-semibold [overflow-wrap:anywhere] ${focusRing}`}
                data-testid="aria-disabled-link"
                data-visual-state="unavailable"
              >
                Unavailable link
              </a>
              <div
                role="button"
                tabIndex={0}
                aria-disabled="true"
                onClick={preventDisabledActivation}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") preventDisabledActivation(event);
                }}
                className={`gc-state-unavailable min-w-0 rounded-lg border px-[16px] py-[12px] font-semibold [overflow-wrap:anywhere] ${focusRing}`}
                data-testid="aria-disabled-custom"
                data-visual-state="unavailable"
              >
                Unavailable custom action
              </div>
              <div role="listbox" aria-label="Appointment time choices" className="min-w-0 rounded-lg border border-ink/20 p-[8px] sm:col-span-2">
                <div
                  role="option"
                  aria-selected="false"
                  aria-disabled="true"
                  tabIndex={0}
                  onClick={preventDisabledActivation}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") preventDisabledActivation(event);
                  }}
                  className={`gc-state-unavailable min-w-0 rounded-md border px-[12px] py-[10px] font-semibold [overflow-wrap:anywhere] ${focusRing}`}
                  data-testid="aria-disabled-option"
                  data-visual-state="unavailable"
                >
                  Unavailable afternoon slot
                </div>
              </div>
            </div>
            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2" aria-label="Keyboard focus contract">
              <details className="min-w-0 rounded-lg border border-ink/25 bg-white p-[12px]">
                <summary
                  className={`min-w-0 font-semibold text-ink [overflow-wrap:anywhere] ${focusRing}`}
                  data-testid="keyboard-summary"
                >
                  How the visual states work
                </summary>
                <p className="gc-text-secondary mt-3 text-sm">
                  The state name, ARIA attribute, border treatment, and readable foreground work
                  together so color is never the only cue.
                </p>
              </details>
              <div className="min-w-0">
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={customControlPressed}
                  onClick={() => activateCustomControl()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") activateCustomControl(event);
                  }}
                  className={`${customControlPressed ? "gc-state-selected" : "gc-state-inactive border"} min-w-0 rounded-lg px-[16px] py-[12px] font-semibold [overflow-wrap:anywhere] ${focusRing}`}
                  data-testid="keyboard-custom-control"
                  data-visual-state={customControlPressed ? "selected" : "inactive"}
                >
                  Custom preference · {customControlPressed ? "Selected" : "Inactive"}
                </div>
                <p className="gc-text-secondary mt-2 text-sm" aria-live="polite">
                  Custom activations: <output data-testid="keyboard-custom-count">{customControlCount}</output>
                </p>
              </div>
            </div>
            <label className="mt-5 block min-w-0 text-sm font-semibold text-ink">
              Booking category
              <select
                value={promptSelection}
                onChange={(event) => setPromptSelection(event.target.value)}
                className={`mt-2 min-h-11 w-full min-w-0 rounded-lg border border-ink/35 bg-white px-[12px] ${promptSelection ? "gc-text-primary" : "gc-text-muted"} ${focusRing}`}
                data-testid="prompt-select"
              >
                <option value="" disabled>Choose a booking category</option>
                <option value="booking">Booking support</option>
                <option value="billing">Billing support</option>
              </select>
            </label>
            <p id="activation-target" className="mt-3 min-w-0 text-sm text-ink [overflow-wrap:anywhere]" aria-live="polite">
              Successful activations: <output data-testid="activation-count">{activationCount}</output>
              {" · "}Blocked attempts observed: <output data-testid="blocked-attempt-count">{blockedAttemptCount}</output>
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                ref={modalTriggerRef}
                type="button"
                onClick={() => setModalOpen(true)}
                className={`rounded-lg border border-plum bg-white px-4 py-3 font-semibold text-plum ${focusRing}`}
                data-testid="modal-trigger"
              >
                Open review dialog
              </button>
              <button
                type="button"
                onClick={() => setToast("Changes saved in the deterministic fixture.")}
                className={`rounded-lg bg-plum px-4 py-3 font-semibold text-white ${focusRing}`}
              >
                Show success toast
              </button>
              <button
                type="button"
                onClick={() => setAlert("Example error: the fixture could not complete the requested action.")}
                className={`rounded-lg border border-plum bg-white px-4 py-3 font-semibold text-plum ${focusRing}`}
              >
                Show error alert
              </button>
            </div>
            <p className="mt-5 rounded-lg bg-ink px-4 py-3 font-semibold text-white" role="status" data-testid="toast-state" data-contrast-role="toast">
              {toast}
            </p>
            <p className="gc-state-error mt-3 rounded-lg px-4 py-3 font-semibold" role="alert" data-testid="error-state" data-contrast-role="error-alert" data-visual-state="error">
              {alert}
            </p>
          </section>

          <section id="validation-fixture" aria-labelledby="validation-heading" className={card}>
            <p className="text-sm font-bold uppercase tracking-wide text-plum">Validation and entered values</p>
            <h2 id="validation-heading" className="mt-2 font-serif text-3xl text-plum">Support request fixture</h2>
            {Object.keys(errors).length > 0 ? (
              <div className="mt-4 rounded-lg border-2 border-plum bg-white p-4 text-plum" role="alert" data-testid="validation-summary">
                <p className="font-bold">Correct the highlighted fields.</p>
                <ul className="mt-2 list-disc pl-5">
                  {Object.values(errors).map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            ) : null}
            {submitted ? (
              <p className="gc-state-completed mt-4 rounded-lg p-4 font-semibold" role="status" data-testid="validation-completed" data-contrast-role="validation-success" data-visual-state="completed">
                Completed: the acceptance form passed validation. Nothing was sent.
              </p>
            ) : null}
            <form className="mt-5 space-y-4" noValidate onSubmit={handleValidation}>
              <div>
                <label htmlFor="acceptance-email" className="block font-semibold text-ink">Email address</label>
                <input
                  ref={emailRef}
                  id="acceptance-email"
                  name="acceptance-email"
                  type="email"
                  required
                  aria-invalid={errors.email ? "true" : "false"}
                  aria-describedby={errors.email ? "acceptance-email-error" : "acceptance-email-help"}
                  placeholder="name@example.com"
                  className={`gc-placeholder-light mt-2 w-full rounded-lg border border-ink/35 bg-white px-4 py-3 text-ink ${focusRing}`}
                  data-testid="placeholder-entered-input"
                />
                <p id="acceptance-email-help" className="mt-1 text-sm text-ink">Use an address where support can reply.</p>
                {errors.email ? <p id="acceptance-email-error" className="mt-1 font-semibold text-plum">{errors.email}</p> : null}
              </div>
              <div>
                <label htmlFor="acceptance-message" className="block font-semibold text-ink">Message</label>
                <textarea
                  ref={messageRef}
                  id="acceptance-message"
                  name="acceptance-message"
                  required
                  minLength={10}
                  aria-invalid={errors.message ? "true" : "false"}
                  aria-describedby={errors.message ? "acceptance-message-error" : undefined}
                  placeholder="Describe what you need help with"
                  className={`gc-placeholder-light mt-2 min-h-32 w-full rounded-lg border border-ink/35 bg-white px-4 py-3 text-ink ${focusRing}`}
                />
                {errors.message ? <p id="acceptance-message-error" className="mt-1 font-semibold text-plum">{errors.message}</p> : null}
              </div>
              <button type="submit" className={`rounded-lg bg-plum px-5 py-3 font-semibold text-white ${focusRing}`} data-contrast-role="submit-button">
                Validate fixture
              </button>
            </form>
          </section>
        </div>

        <section id="state-inventory" aria-labelledby="state-heading" className={`${card} mt-6`}>
          <h2 id="state-heading" className="font-serif text-3xl text-plum">State inventory</h2>
          <p className="mt-2 text-ink">Each chip names the state it represents; color is not the only cue.</p>
          <ul className="mt-4 flex flex-wrap gap-3" aria-label="Acceptance state inventory">
            {[
              ["Active", "gc-state-active border", "active"],
              ["Selected", "gc-state-selected", "selected"],
              ["Inactive", "gc-state-inactive border", "inactive"],
              ["Disabled", "gc-state-disabled border", "disabled"],
              ["Unavailable", "gc-state-unavailable border", "unavailable"],
              ["Loading", "gc-state-loading", "loading"],
              ["Completed", "gc-state-completed", "completed"],
              ["Error", "gc-state-error", "error"],
            ].map(([label, classes, state]) => (
              <li key={state} className={`rounded-full px-4 py-2 text-sm font-bold ${classes}`} data-state={state} data-visual-state={state} data-contrast-role={`state-${state}`}>
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="contrast-math-heading" className={`${card} mt-6`}>
          <h2 id="contrast-math-heading" className="font-serif text-3xl text-plum">
            Contrast math fixtures
          </h2>
          <p className="gc-text-secondary mt-2">
            These large deterministic samples verify alpha and ancestor compositing in the browser
            helper; they are not application content roles.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <p
              className="gc-contrast-alpha-color rounded-lg border border-ink/20 p-4 font-serif text-3xl font-bold"
              data-testid="contrast-alpha-color"
            >
              Alpha color
            </p>
            <p
              className="gc-contrast-element-opacity rounded-lg border border-ink/20 p-4 font-serif text-3xl font-bold"
              data-testid="contrast-element-opacity"
            >
              Element opacity
            </p>
            <div className="gc-contrast-ancestor-container rounded-lg p-2">
              <div className="gc-contrast-ancestor-opacity rounded-md p-2">
                <p
                  className="gc-contrast-solid-black p-2 font-serif text-3xl font-bold"
                  data-testid="contrast-ancestor-opacity"
                >
                  Ancestor opacity
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="footer-legal-fixture-heading"
          className="gc-brand-footer mt-6 rounded-2xl border border-white/30 p-[20px]"
          data-testid="footer-legal-fixture"
        >
          <h2 id="footer-legal-fixture-heading" className="font-serif text-2xl text-white">
            Deterministic footer legal-link state
          </h2>
          <p className="gc-text-on-dark-muted mt-2 text-sm">
            Published legal links appear only when the Content Management configuration supplies
            them. This local state verifies that configured footer copy remains readable.
          </p>
          <Link
            href="/privacy"
            className={`gc-text-on-dark-muted mt-3 inline-flex font-semibold underline decoration-2 underline-offset-4 ${focusRing}`}
            data-testid="footer-legal-link"
          >
            Privacy Policy
          </Link>
        </section>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/75 p-4" data-testid="modal-overlay">
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="acceptance-dialog-title"
            aria-describedby="acceptance-dialog-description"
            className="w-full max-w-lg rounded-2xl bg-white p-6 text-ink shadow-2xl"
          >
            <h2 id="acceptance-dialog-title" className="font-serif text-3xl text-plum">Review fixture details</h2>
            <p id="acceptance-dialog-description" className="mt-3 leading-7 text-ink">
              Keyboard focus remains in this dialog until it is closed. Escape closes it and restores
              focus to the trigger.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <a href="#booking-checkout" className={`rounded-lg border border-plum px-4 py-3 font-semibold text-plum ${focusRing}`}>
                Review totals
              </a>
              <button
                ref={modalCloseRef}
                type="button"
                onClick={() => setModalOpen(false)}
                className={`rounded-lg bg-plum px-4 py-3 font-semibold text-white ${focusRing}`}
                data-testid="modal-close"
              >
                Close dialog
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
