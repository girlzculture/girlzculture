"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Crown,
  Eye,
  ExternalLink,
  ImageOff,
  ImagePlus,
  Info,
  LockKeyhole,
  Megaphone,
  MessageCircle as Sparkles,
  Package,
  Plus,
  Star,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { getSessionForScope, reportClientOperationalFailure, reportClientOperationalRecovery, salonSupabase as supabase } from "@/lib/supabase";
import { createAuthenticatedApiClient } from "@/lib/scopedApiClient";
import {
  ScopedApiError,
  scopedApiErrorMessage,
} from "@/lib/scopedApiCore";
import {
  subscribeToOwnerUpdates,
  type OwnerFallbackOutcome,
} from "@/lib/ownerRealtime";
import BaseImageUpload from "@/components/ImageUpload";
import SafeImage from "@/components/site/SafeImage";
import NumericInput from "@/components/forms/NumericInput";
import OwnerDashboardShell, {
  DashboardSection,
} from "@/components/owner/OwnerDashboardShell";
import {
  displayStoredPlan,
  isSubscriptionActive,
  normalizePlan,
  parsePlan,
  parseStoredPlan,
  planRank,
  PLAN_ORDER,
  SUBSCRIPTION_PLANS,
  type StoredSubscriptionPlan,
  type SubscriptionPlan,
} from "@/lib/plans";
import {
  EMAIL_PATTERN,
  isValidEmail,
  isValidUsPhone,
  normalizeEmail,
  normalizeUsPhone,
  US_PHONE_PATTERN,
} from "@/lib/validation";
import { dateKeyInTimeZone } from "@/lib/dateTime";
import { STORE_TIME_OPTIONS } from "@/lib/salonPresets";
import {
  StructuredStylesEditor,
  StructuredStylistsEditor,
} from "@/components/owner/StructuredCatalogEditors";
import RoleLogoutButton from "@/components/auth/RoleLogoutButton";
import TeamUserManager from "@/components/auth/TeamUserManager";
import SalonOpenStatusControl from "@/components/owner/SalonOpenStatusControl";
import {
  isValidUsZip,
  normalizeUsState,
  normalizeUsZip,
  US_STATES,
} from "@/lib/usStates";
import PushSetup from "@/components/notifications/PushSetup";
import BookingInbox from "@/components/BookingInbox";
import SalonPromotionsManager from "@/components/owner/SalonPromotionsManager";
import SalonVanityManager from "@/components/owner/SalonVanityManager";
import { bookingReference } from "@/lib/bookingReference";
import SalonProductOrders from "@/components/owner/SalonProductOrders";
import MobileRecordEditor from "@/components/owner/MobileRecordEditor";
import SalonSpreadsheetPanel from "@/components/owner/SalonSpreadsheetPanel";
import { readApiResponse } from "@/lib/apiResponseClient";
import {
  bookingTransaction,
  financeCsv,
  summarizeBookingTransactions,
} from "@/lib/financeLedgerCore";
import ActionToast from "@/components/ActionToast";
import SalonDescriptionEditor from "@/components/owner/SalonDescriptionEditor";
import OwnerSetupGuideLink from "@/components/owner/OwnerSetupGuideLink";
import StylistSectionFallbackEditor from "@/components/owner/StylistSectionFallbackEditor";
import {
  OwnerDetailHeader,
  OwnerSectionCard,
} from "@/components/owner/OwnerWorkflowUi";
import BookingCheckInExceptionForm, {
  type CheckInExceptionAnswer,
  type CheckInExceptionRequirement,
} from "@/components/owner/BookingCheckInExceptionForm";

type Row = Record<string, unknown> & {
  id?: string;
  salon_id?: string;
  name?: string;
  created_at?: string;
};
const ImageUpload = (props: React.ComponentProps<typeof BaseImageUpload>) => (
  <BaseImageUpload {...props} authScope="salon" />
);
type Salon = Row & {
  slug?: string;
  vanity_slug?: string;
  instagram_url?: string;
  tiktok_url?: string;
  google_business_url?: string;
  status?: string;
  subscription_status?: string;
  description?: string;
  description_ai_assisted?: boolean;
  stylist_section_fallback?: {
    mode?: "empty" | "image" | "product" | "promotion";
    image_url?: string | null;
    product_id?: string | null;
    promotion_id?: string | null;
  };
  email?: string;
  phone?: string;
  address_street?: string;
  address_line2?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  logo_url?: string;
  cover_photo_url?: string;
  gallery_photos?: string[];
  hours?: Record<string, unknown>;
  booking_settings?: Record<string, unknown>;
  languages?: string[];
  trust_info?: Record<string, boolean>;
  media_consent?: boolean;
  notification_preferences?: Record<string, boolean>;
  rating_overall?: number;
  review_count?: number;
  subscription_tier?: string;
  stripe_account_id?: string;
  time_zone?: string;
  onboarding_progress?: number;
  is_discoverable?: boolean;
  accepting_bookings?: boolean;
  owner_unpublished_at?: string | null;
  closure_requested_at?: string | null;
  geocode_status?: string;
  address_needs_review?: boolean;
  formatted_address?: string;
};
type OwnerWorkspaceResponse = {
  salon?: Salon;
  records?: Record<string, Row[]>;
  permissions?: Record<string, boolean> | null;
  isTeamMember?: boolean;
  error?: string;
};

const fallbackPhotos = [
  "/images/braids-cornrows.jpg",
  "/images/braids-knotless.jpg",
  "/images/braids-box.jpg",
  "/images/hero-braids.jpg",
];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export default function OwnerDashboardApp({
  section,
  initialBookingId = "",
  initialRecordId = "",
}: {
  section: DashboardSection;
  preview?: boolean;
  initialBookingId?: string;
  initialRecordId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [realtimeNotice, setRealtimeNotice] = useState("");
  const [salon, setSalon] = useState<Salon | null>(null);
  const [bookings, setBookings] = useState<Row[]>([]);
  const [reviews, setReviews] = useState<Row[]>([]);
  const [styles, setStyles] = useState<Row[]>([]);
  const [stylists, setStylists] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [promotions, setPromotions] = useState<Row[]>([]);
  const [subscription, setSubscription] = useState<Row | null>(null);
  const [billingEvents, setBillingEvents] = useState<Row[]>([]);
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [blockouts, setBlockouts] = useState<Row[]>([]);
  const [teamPermissions, setTeamPermissions] = useState<Record<
    string,
    boolean
  > | null>(null);
  const [isTeamMember, setIsTeamMember] = useState(false);
  const [cancellationReasons, setCancellationReasons] = useState([
    "Customer requested cancellation",
    "Stylist unavailable",
    "Salon closure",
    "Scheduling conflict",
    "Service issue",
    "Payment issue",
    "Other",
  ]);
  const [customerCancellationReasons, setCustomerCancellationReasons] =
    useState([
      "Appointment availability changed",
      "Stylist is unavailable",
      "Salon closure or schedule change",
      "Service cannot be completed as scheduled",
      "Customer requested cancellation",
      "Payment could not be completed",
      "Other scheduling issue",
    ]);
  const [cancellationThreshold, setCancellationThreshold] = useState(10);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedStylist, setSelectedStylist] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let removeRealtime: (() => Promise<void>) | null = null;
    let hadRealtimeFailure = false;

    async function loadDashboard() {
      const session = await getSessionForScope("salon");
      const userId = session?.user?.id || "";
      if (!live) return;
      if (!session || !userId) {
        setError(
          "Sign in with your salon-owner account. Admin and salon sessions are kept separate, so an admin login will not replace this session.",
        );
        setLoading(false);
        return;
      }
      const api = await createAuthenticatedApiClient("salon");
      const workspace = await api.request<OwnerWorkspaceResponse>(
        "/api/salon/workspace",
      );
      const s = workspace.salon || null;
      if (!live) return;
      if (!s) {
        setError(
          "This session is not linked to a salon-owner account. Use the salon-owner login for this dashboard.",
        );
        setLoading(false);
        return;
      }
      const salonId = String(s.id || "");
      if (!salonId)
        throw new Error("This salon profile is missing its identifier.");
      setSalon(s as Salon);
      const teamLogin = Boolean(workspace.isTeamMember);
      setIsTeamMember(teamLogin);
      setTeamPermissions(teamLogin ? workspace.permissions || {} : null);
      const records = workspace.records || {};
      const loadedBookings = records.bookings || [],
        loadedReviews = records.reviews || [],
        loadedStyles = records.styles || [],
        loadedStylists = records.stylists || [],
        loadedProducts = records.salon_products || [];
      setBookings(loadedBookings);
      setReviews(loadedReviews);
      setStyles(loadedStyles);
      setStylists(loadedStylists);
      setProducts(loadedProducts);
      setPromotions(records.salon_promotions || []);
      setSubscription((records.subscriptions || [])[0] || null);
      setBillingEvents(records.billing_events || []);
      setNotifications(records.notifications || []);
      setBlockouts(records.salon_blockouts || []);
      try {
        const configResponse = await fetch(
          "/api/config?keys=quality.cancellation_reasons,quality.cancellation_customer_reasons,quality.cancellation_threshold_percent",
          { cache: "no-store" },
        );
        const configBody = await configResponse.json();
        const configuredReasons =
          configBody?.config?.["quality.cancellation_reasons"];
        const configuredCustomerReasons =
          configBody?.config?.["quality.cancellation_customer_reasons"];
        const configuredThreshold = Number(
          configBody?.config?.["quality.cancellation_threshold_percent"],
        );
        if (
          live &&
          Array.isArray(configuredReasons) &&
          configuredReasons.length
        )
          setCancellationReasons(
            configuredReasons.map(String).filter(Boolean).slice(0, 40),
          );
        if (
          live &&
          Array.isArray(configuredCustomerReasons) &&
          configuredCustomerReasons.length
        )
          setCustomerCancellationReasons(
            configuredCustomerReasons.map(String).filter(Boolean).slice(0, 20),
          );
        if (
          live &&
          Number.isFinite(configuredThreshold) &&
          configuredThreshold >= 1 &&
          configuredThreshold <= 100
        )
          setCancellationThreshold(configuredThreshold);
      } catch {
        // The monitored configuration API supplies safe defaults and references.
      }
      const requestedRecord = initialRecordId && initialRecordId !== "new" ? initialRecordId : null;
      setSelectedStyle(section === "styles" ? requestedRecord : null);
      setSelectedStylist(section === "stylists" ? requestedRecord : null);
      setSelectedProduct(section === "products" ? requestedRecord : null);
      setLoading(false);

      let liveRefresh: Promise<OwnerFallbackOutcome> | null = null;
      const refreshLiveWorkspace = () => {
        if (liveRefresh) return liveRefresh;
        liveRefresh = (async (): Promise<OwnerFallbackOutcome> => {
          if (!live) return "terminal";
          try {
            const refreshed = await api.request<OwnerWorkspaceResponse>(
              "/api/salon/workspace",
            );
            if (!live) return "terminal";
            const refreshedRecords = refreshed.records || {};
            if (refreshed.salon) setSalon(refreshed.salon);
            setBookings(refreshedRecords.bookings || []);
            setReviews(refreshedRecords.reviews || []);
            setNotifications(refreshedRecords.notifications || []);
            return "ready";
          } catch (error) {
            if (!live) return "terminal";
            if (
              error instanceof ScopedApiError &&
              error.authenticationFailure
            ) {
              setRealtimeNotice(
                scopedApiErrorMessage(
                  error,
                  "Your salon session has expired. Sign in again to resume live updates.",
                ),
              );
              return "terminal";
            }
            return "transient";
          }
        })().finally(() => {
          liveRefresh = null;
        });
        return liveRefresh;
      };

      removeRealtime = subscribeToOwnerUpdates({
        client: supabase,
        salonId,
        onNotification: (row) => {
          if (live) setNotifications((current) => [row as Row, ...current]);
        },
        onBooking: (row) => {
          if (live) setBookings((current) => [row as Row, ...current]);
        },
        onReviewStateChange: refreshLiveWorkspace,
        onConnectionState: (state, status) => {
          if (!live) return;
          if (state === "connected") {
            setRealtimeNotice("");
            if (hadRealtimeFailure) {
              hadRealtimeFailure = false;
              void getSessionForScope("salon").then((current) =>
                current
                  ? reportClientOperationalRecovery({
                      operation: "realtime:owner-dashboard",
                      provider: "supabase-realtime",
                      authorization: `Bearer ${current.access_token}`,
                    })
                  : undefined,
              );
            }
            return;
          }
          if (state === "degraded") {
            hadRealtimeFailure = true;
            setRealtimeNotice(
              "Live updates are reconnecting. Your dashboard remains available and refreshes automatically in the meantime.",
            );
            void getSessionForScope("salon").then((current) =>
              reportClientOperationalFailure({
                  status: 503,
                  code: `REALTIME_${status || "DISCONNECTED"}`,
                  operation: "realtime:owner-dashboard",
                  provider: "supabase-realtime",
                  authorization: current
                    ? `Bearer ${current.access_token}`
                    : "",
              }),
            );
          }
        },
        onFallbackRefresh: refreshLiveWorkspace,
      });
      if (!live && removeRealtime) await removeRealtime();
    }

    void loadDashboard().catch((error) => {
      if (!live) return;
      setError(
        scopedApiErrorMessage(
          error,
          error instanceof ScopedApiError && error.authenticationFailure
            ? "Your salon session has expired. Sign in again."
            : "The salon workspace is temporarily unavailable. Please try again in a moment.",
        ),
      );
      setLoading(false);
    });

    return () => {
      live = false;
      if (removeRealtime) void removeRealtime();
    };
  }, [initialRecordId, section]);

  async function updateSalonServer(patch: Record<string, unknown>) {
    if (!salon?.id) return;
    const safePatch = { ...patch };
    if ("email" in safePatch) {
      if (!isValidEmail(safePatch.email)) {
        setNotice("Please enter a valid email address (name@example.com).");
        return;
      }
      safePatch.email = normalizeEmail(safePatch.email);
    }
    if ("phone" in safePatch && String(safePatch.phone || "")) {
      if (!isValidUsPhone(safePatch.phone)) {
        setNotice("Please enter a US phone number.");
        return;
      }
      safePatch.phone = normalizeUsPhone(safePatch.phone);
    }
    const addressChanged = [
      "address_street",
      "address_line2",
      "address_city",
      "address_state",
      "address_zip",
    ].some((key) => key in safePatch && safePatch[key] !== salon[key]);
    try {
      const session = await getSessionForScope("salon");
      if (!session)
        throw new Error("Your salon session expired. Please sign in again.");
      const response = await fetch("/api/salon/profile", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(safePatch),
      });
      const body = (await readApiResponse(
        response,
        "We couldn't save this salon change.",
      )) as {
        salon?: Salon;
        error?: string;
        verified?: boolean;
      };
      if (!response.ok || !body.salon || body.verified !== true)
        throw new Error(
          body.error || "We couldn't verify this change after saving.",
        );
      setSalon(body.salon);
      if (addressChanged) {
        setNotice("Address saved. Verifying its map location…");
        const geocodeResponse = await fetch("/api/location/geocode-salon", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ salon_id: salon.id }),
        });
        const geocodeBody = await geocodeResponse.json();
        if (!geocodeResponse.ok) {
          setNotice(
            geocodeBody.error ||
              "The profile was saved, but map verification could not finish.",
          );
          return;
        }
        if (geocodeBody.status === "needs_review") {
          setSalon((current) =>
            current
              ? {
                  ...current,
                  geocode_status: "needs_review",
                  address_needs_review: true,
                }
              : current,
          );
          setNotice(
            "Address saved, but its map location needs review. Check the street, city, state, and ZIP, then save again.",
          );
        } else {
          setSalon((current) =>
            current
              ? {
                  ...current,
                  geocode_status: "success",
                  address_needs_review: false,
                  formatted_address:
                    geocodeBody.formattedAddress || current.formatted_address,
                }
              : current,
          );
          setNotice("Address saved and map location verified.");
        }
      } else setNotice("Changes saved to your public salon page.");
    } catch (saveError) {
      setNotice(
        saveError instanceof Error
          ? saveError.message
          : "We couldn't save this change. Please try again.",
      );
    }
  }
  async function saveRecordServer(
    table: string,
    values: Record<string, unknown>,
    id?: string,
  ) {
    if (!salon?.id) return null;
    try {
      const session = await getSessionForScope("salon");
      if (!session)
        throw new Error("Your salon session expired. Please sign in again.");
      const response = await fetch("/api/salon/records/save", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ table, id, values }),
      });
      const body = (await readApiResponse(
        response,
        "We couldn't save this salon record.",
      )) as {
        record?: Row;
        error?: string;
        verified?: boolean;
      };
      if (!response.ok || !body.record || body.verified !== true)
        throw new Error(
          body.error || "We couldn't verify this change after saving.",
        );
      setNotice("Saved and verified.");
      return body.record;
    } catch (saveError) {
      setNotice(
        saveError instanceof Error
          ? saveError.message
          : "We couldn't save this change. Please try again.",
      );
      return null;
    }
  }
  async function removeRecord(
    table: string,
    id: string,
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
  ) {
    if (
      !window.confirm(
        "Remove this record from the public salon experience? Booking history will be preserved.",
      )
    )
      return;
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Your salon session expired.");
      const response = await fetch("/api/salon/records", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          table,
          id,
          reason: "Removed from salon dashboard",
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to remove this record.");
      setter((current) => current.filter((row) => row.id !== id));
      setNotice(body.message || "Record removed safely.");
    } catch (deleteError) {
      setNotice(
        deleteError instanceof Error
          ? deleteError.message
          : "The record could not be removed safely.",
      );
    }
  }

  if (loading)
    return (
      <div className="min-h-screen bg-cream p-10 text-center text-plum">
        Loading your salon workspace…
      </div>
    );
  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-5">
        <div className="max-w-md rounded-[18px] border border-plum/10 bg-white p-8 text-center">
          <h1 className="font-serif text-3xl text-plum">Owner dashboard</h1>
          <p className="mt-3 text-sm text-ink/70">{error}</p>
          <Link
            href="/salon/login"
            className="mt-5 inline-flex rounded-[9px] bg-magenta px-5 py-3 text-sm font-bold text-white"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  if (!salon) return null;
  const lifecycleStatus = String(salon.status || "Pending").toLowerCase();
  if (["new", "pending"].includes(lifecycleStatus))
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-5">
        <div className="max-w-xl rounded-[22px] border border-plum/10 bg-white p-9 text-center shadow-[0_20px_60px_rgba(13,17,20,.08)]">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-blush text-plum">
            <Clock3 />
          </div>
          <h1 className="mt-5 font-serif text-4xl font-semibold text-plum">
            Your application is under review
          </h1>
          <p className="mt-4 leading-7 text-ink/70">
            Your salon has been saved, but the owner dashboard stays locked
            until Girlz Culture approves and activates your store. We’ll email
            you as soon as the review is complete.
          </p>
          <Link
            href="/salon/application-submitted"
            className="mt-6 inline-flex rounded-[9px] bg-magenta px-6 py-3 font-bold text-white"
          >
            View next steps
          </Link>
        </div>
      </div>
    );
  if (lifecycleStatus === "offboarded")
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream p-5">
        <div className="max-w-xl rounded-[22px] border border-red-200 bg-white p-9 text-center shadow-[0_20px_60px_rgba(13,17,20,.08)]">
          <LockKeyhole className="mx-auto text-magenta" size={42} />
          <h1 className="mt-5 font-serif text-4xl font-semibold text-plum">
            Salon access is restricted
          </h1>
          <p className="mt-4 leading-7 text-ink/70">
            This salon is no longer active on Girlz Culture. Existing booking
            records remain protected. Contact platform support if you believe
            this status is incorrect.
          </p>
          <Link
            href="/contact"
            className="mt-6 inline-flex rounded-[9px] bg-magenta px-6 py-3 font-bold text-white"
          >
            Contact support
          </Link>
        </div>
      </div>
    );

  const storedPlan = parseStoredPlan(subscription?.tier || salon.subscription_tier);
  const plan = normalizePlan(storedPlan);
  const subscriptionActive = isSubscriptionActive(
    subscription?.status,
    subscription?.current_period_end,
  );
  const permissionKey =
    section === "messages" ? "bookings" : section.replace("-", "_");
  const firstAllowedSection = teamPermissions
    ? Object.entries(teamPermissions)
        .find(([key, allowed]) => key !== "subscription" && allowed)?.[0]
        .replace("_", "-") || "settings"
    : "overview";
  const firstAllowedHref =
    firstAllowedSection === "overview"
      ? "/salon/dashboard"
      : `/salon/dashboard/${firstAllowedSection}`;
  if (
    teamPermissions &&
    (section === "subscription" || !teamPermissions[permissionKey])
  )
    return (
      <OwnerDashboardShell
        section={section}
        salonName={salon.name || "Your Salon"}
        salonSlug={salon.slug || ""}
        avatar={salon.logo_url || null}
        notifications={notifications}
        access={teamPermissions}
      >
        <div className="rounded-[18px] border border-plum/10 bg-white p-10 text-center">
          <LockKeyhole className="mx-auto text-magenta" />
          <h1 className="mt-4 font-serif text-3xl text-plum">
            Access not assigned
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-ink/70">
            The salon owner has not granted this account access to this
            dashboard section. Subscription and billing are always owner-only.
          </p>
          <Link
            href={firstAllowedHref}
            className="mt-5 inline-flex rounded-lg bg-magenta px-5 py-3 font-bold text-white"
          >
            Open an assigned section
          </Link>
        </div>
      </OwnerDashboardShell>
    );
  const context = {
    salon,
    bookings,
    reviews,
    styles,
    stylists,
    products,
    promotions,
    blockouts,
    subscription,
    billingEvents,
    plan,
    storedPlan,
    subscriptionActive,
    isOwner: !isTeamMember,
    access: teamPermissions,
    cancellationReasons,
    customerCancellationReasons,
    cancellationThreshold,
    initialBookingId,
    focusedRecordId: initialRecordId,
    selectedStyle,
    selectedStylist,
    selectedProduct,
    setSelectedStyle,
    setSelectedStylist,
    setSelectedProduct,
    setStyles,
    setStylists,
    setProducts,
    setSalon,
    setPromotions,
    setBookings,
    setReviews,
    setBlockouts,
    updateSalon: updateSalonServer,
    saveRecord: saveRecordServer,
    removeRecord,
    setNotice,
  };
  return (
    <OwnerDashboardShell
      section={section}
      salonName={salon.name || "Your Salon"}
      salonSlug={salon.slug || ""}
      avatar={salon.logo_url || null}
      notifications={notifications}
      access={teamPermissions}
    >
      {lifecycleStatus === "suspended" ? (
        <div
          role="alert"
          className="mb-4 rounded-[14px] border border-red-200 bg-red-50 p-4"
        >
          <b className="font-serif text-lg gc-text-danger">
            This salon is suspended
          </b>
          <p className="mt-1 text-xs leading-5 gc-text-danger">
            Your dashboard and records remain available, but the public profile
            is hidden and new bookings are disabled. Contact platform support
            for status details.
          </p>
        </div>
      ) : null}
      {!isTeamMember &&
      subscriptionActive &&
      !salon.is_discoverable &&
      lifecycleStatus !== "suspended" ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-magenta/20 bg-blush/45 p-4">
          <div>
            <b className="font-serif text-lg text-plum">
              Finish marketplace setup ·{" "}
              {Number(salon.onboarding_progress || 0)}%
            </b>
            <p className="mt-1 text-xs text-ink/60">
              Your dashboard works, but the salon stays out of search until
              every required setup item is complete.
            </p>
          </div>
          <Link
            href="/salon/onboarding"
            className="rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white"
          >
            Continue setup
          </Link>
        </div>
      ) : null}
      <div className="mb-4">
        <PushSetup scope="salon" compact />
      </div>
      <OwnerSetupGuideLink />
      {realtimeNotice ? (
        <div
          role="status"
          className="mb-4 rounded-[10px] border border-amber/35 bg-amber/10 px-4 py-3 text-xs leading-5 text-plum"
        >
          {realtimeNotice}
        </div>
      ) : null}
      <ActionToast message={notice} onDismiss={() => setNotice("")} />
      <DashboardContent section={section} context={context} />
    </OwnerDashboardShell>
  );
}

type Ctx = {
  salon: Salon;
  bookings: Row[];
  reviews: Row[];
  styles: Row[];
  stylists: Row[];
  products: Row[];
  promotions: Row[];
  blockouts: Row[];
  subscription: Row | null;
  billingEvents: Row[];
  plan: SubscriptionPlan;
  storedPlan: StoredSubscriptionPlan | null;
  subscriptionActive: boolean;
  isOwner: boolean;
  access: Record<string, boolean> | null;
  cancellationReasons: string[];
  customerCancellationReasons: string[];
  cancellationThreshold: number;
  initialBookingId: string;
  focusedRecordId: string;
  selectedStyle: string | null;
  selectedStylist: string | null;
  selectedProduct: string | null;
  setSelectedStyle: (id: string | null) => void;
  setSelectedStylist: (id: string | null) => void;
  setSelectedProduct: (id: string | null) => void;
  setStyles: React.Dispatch<React.SetStateAction<Row[]>>;
  setStylists: React.Dispatch<React.SetStateAction<Row[]>>;
  setProducts: React.Dispatch<React.SetStateAction<Row[]>>;
  setSalon: React.Dispatch<React.SetStateAction<Salon | null>>;
  setPromotions: React.Dispatch<React.SetStateAction<Row[]>>;
  setBookings: React.Dispatch<React.SetStateAction<Row[]>>;
  setReviews: React.Dispatch<React.SetStateAction<Row[]>>;
  setBlockouts: React.Dispatch<React.SetStateAction<Row[]>>;
  updateSalon: (patch: Record<string, unknown>) => Promise<void>;
  saveRecord: (
    table: string,
    values: Record<string, unknown>,
    id?: string,
  ) => Promise<Row | null>;
  removeRecord: (
    table: string,
    id: string,
    setter: React.Dispatch<React.SetStateAction<Row[]>>,
  ) => Promise<void>;
  setNotice: (text: string) => void;
};

function DashboardContent({
  section,
  context: c,
}: {
  section: DashboardSection;
  context: Ctx;
}) {
  void Styles;
  void Stylists;
  if (section === "subscription")
    return c.isOwner ? (
      <SubscriptionV2 c={c} />
    ) : (
      <AccessPaused isOwner={false} />
    );
  if (!c.subscriptionActive)
    return c.isOwner ? (
      <SubscriptionRequired c={c} />
    ) : (
      <AccessPaused isOwner={false} />
    );
  if (section === "overview") return <Overview c={c} />;
  if (section === "my-page") return <MyPage c={c} focus={c.focusedRecordId} />;
  if (section === "photos") return <Photos c={c} focus={c.focusedRecordId} />;
  if (section === "styles") return <StructuredStylesEditor c={c} recordId={c.focusedRecordId} />;
  if (section === "stylists") return <><StructuredStylistsEditor c={c} recordId={c.focusedRecordId} />{!c.focusedRecordId && c.stylists.length === 0 ? <StylistSectionFallbackEditor gallery={Array.isArray(c.salon.gallery_photos) ? c.salon.gallery_photos : []} products={c.products} promotions={c.promotions} initial={c.salon.stylist_section_fallback} onSave={c.updateSalon} onNotice={c.setNotice} /> : null}</>;
  if (section === "products") return <TruthfulProducts c={c} recordId={c.focusedRecordId} />;
  if (section === "availability") return <Availability c={c} recordId={c.focusedRecordId} />;
  if (section === "bookings") return <Bookings c={c} recordId={c.focusedRecordId || c.initialBookingId} />;
  if (section === "messages") return <BookingInbox scope="salon" initialBookingId={c.focusedRecordId} focused={Boolean(c.focusedRecordId)} />;
  if (section === "reviews") return <Reviews c={c} recordId={c.focusedRecordId} />;
  if (section === "earnings") return <Earnings c={c} recordId={c.focusedRecordId} />;
  if (section === "promotions")
    return (
      <SalonPromotionsManager
        promotions={c.promotions}
        styles={c.styles}
        products={c.products}
        setPromotions={c.setPromotions}
        saveRecord={c.saveRecord}
        removeRecord={c.removeRecord}
        recordId={c.focusedRecordId}
      />
    );
  return <SettingsWorkspace c={c} focus={c.focusedRecordId} />;
}

function SubscriptionRequired({ c }: { c: Ctx }) {
  return (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-blush text-magenta">
        <Crown size={30} />
      </span>
      <h1 className="mt-5 font-serif text-4xl font-semibold text-plum">
        Activate your salon plan
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-ink/65">
        Your salon is approved, but the business workspace remains locked until
        a subscription is active. Your selected {c.plan} plan can be activated
        through secure subscription billing.
      </p>
      <Link
        href="/salon/dashboard/subscription"
        className="mt-7 inline-flex rounded-[9px] bg-magenta px-7 py-3.5 text-sm font-bold text-white"
      >
        Activate subscription
      </Link>
    </div>
  );
}
function AccessPaused({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="mx-auto max-w-3xl py-16 text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-blush text-magenta">
        <LockKeyhole size={30} />
      </span>
      <h1 className="mt-5 font-serif text-4xl font-semibold text-plum">
        Salon access is paused
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-ink/65">
        This salon’s subscription is not active. Please contact the salon owner;
        only the owner can manage billing.
      </p>
      {isOwner ? (
        <Link
          href="/salon/dashboard/subscription"
          className="mt-7 inline-flex rounded-[9px] bg-magenta px-7 py-3.5 text-sm font-bold text-white"
        >
          Manage subscription
        </Link>
      ) : null}
    </div>
  );
}
function SubscriptionV2({ c }: { c: Ctx }) {
  const [busy, setBusy] = useState("");
  const [upgradePreview, setUpgradePreview] = useState<null | {
    path: string;
    key: string;
    payload: Record<string, unknown>;
    currentPlan: string;
    requestedPlan: string;
    message: string;
    preview: {
      unusedPeriodCredit: number;
      proratedCharge: number;
      tax: number;
      amountDueNow: number;
      currency: string;
      renewalAmount: number;
      renewalDate: string | null;
    };
  }>(null);
  const scheduledPlan = parsePlan(c.subscription?.scheduled_tier);
  const currentPlanLabel = c.subscriptionActive
    ? displayStoredPlan(c.storedPlan)
    : c.plan;
  const legacyBasicActive = c.subscriptionActive && c.storedPlan === "Basic";
  const scheduledEffective = c.subscription?.scheduled_change_effective_at;
  const cancellationScheduled = Boolean(c.subscription?.cancel_at_period_end);
  const paidThrough = c.subscription?.current_period_end;
  async function action(
    path: string,
    key: string,
    payload: Record<string, unknown> = {},
  ) {
    setBusy(key);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to update the subscription.");
      if (body.requiresConfirmation) {
        if (!body.preview) {
          throw new Error("Stripe did not return a complete upgrade preview.");
        }
        setUpgradePreview({
          path,
          key,
          payload,
          currentPlan: String(body.currentPlan || c.plan),
          requestedPlan: String(body.requestedPlan || payload.plan || ""),
          message: String(
            body.message ||
              "Review the verified Stripe preview before confirming.",
          ),
          preview: body.preview,
        });
        setBusy("");
        return;
      }
      if (body.url) {
        if (body.reconciliation_required && body.reference) {
          c.setNotice(
            `${String(body.warning || "Checkout needs reconciliation.")} Reference ${String(body.reference)}. Continuing to Stripe…`,
          );
          window.setTimeout(() => window.location.assign(body.url), 1600);
          return;
        }
        window.location.assign(body.url);
        return;
      }
      c.setNotice(
        body.message ||
          "Your subscription plan was updated. Your dashboard remained active throughout the change.",
      );
      setBusy("");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      c.setNotice(
        error instanceof Error ? error.message : "Unable to continue.",
      );
      setBusy("");
    }
  }
  async function confirmUpgrade() {
    if (!upgradePreview) return;
    setBusy("confirm-upgrade");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(upgradePreview.path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ...upgradePreview.payload, confirm: true }),
      });
      const body = await response.json();
      if (body.requiresAction && body.paymentUrl) {
        c.setNotice(
          "Stripe needs one more confirmation. Your current plan remains active until payment succeeds.",
        );
        window.location.assign(body.paymentUrl);
        return;
      }
      if (!response.ok) {
        throw new Error(
          body.error ||
            "Stripe did not confirm the upgrade. Your current plan is unchanged.",
        );
      }
      setUpgradePreview(null);
      c.setNotice(
        body.message ||
          "Stripe confirmed the prorated invoice and activated the new plan.",
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      c.setNotice(
        error instanceof Error ? error.message : "Unable to confirm upgrade.",
      );
    } finally {
      setBusy("");
    }
  }
  const previewMoney = (value: number, currency: string) =>
    (Number(value || 0) / 100).toLocaleString("en-US", {
      style: "currency",
      currency: String(currency || "usd").toUpperCase(),
    });
  return (
    <>
      <Title
        title="Subscription"
        subtitle="Choose the plan that matches your salon's operations and growth goals."
      />
      {legacyBasicActive ? (
        <Panel className="mb-4 border-plum/20 bg-cream/60">
          <h2 className="font-serif text-2xl text-plum">Basic (legacy)</h2>
          <p className="mt-2 text-xs leading-5 text-ink/65">
            Your existing Basic subscription remains active at its
            provider-confirmed terms. It has not been converted to Starter or
            repriced. Choose a current plan only when you are ready to change.
          </p>
        </Panel>
      ) : null}
      {upgradePreview ? (
        <Panel className="mb-4 border-magenta/30 bg-blush/25">
          <h2 className="font-serif text-2xl text-plum">
            Confirm plan upgrade
          </h2>
          <p className="mt-2 text-xs leading-5 text-ink/65">
            {upgradePreview.message}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Current plan", upgradePreview.currentPlan],
              ["New plan", upgradePreview.requestedPlan],
              [
                "Unused-period credit",
                previewMoney(
                  upgradePreview.preview.unusedPeriodCredit,
                  upgradePreview.preview.currency,
                ),
              ],
              [
                "Prorated plan charge",
                previewMoney(
                  upgradePreview.preview.proratedCharge,
                  upgradePreview.preview.currency,
                ),
              ],
              [
                "Tax",
                previewMoney(
                  upgradePreview.preview.tax,
                  upgradePreview.preview.currency,
                ),
              ],
              [
                "Amount due now",
                previewMoney(
                  upgradePreview.preview.amountDueNow,
                  upgradePreview.preview.currency,
                ),
              ],
              [
                "Renewal price",
                previewMoney(
                  upgradePreview.preview.renewalAmount,
                  upgradePreview.preview.currency,
                ),
              ],
              [
                "Renewal date",
                dateText(upgradePreview.preview.renewalDate),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-plum/10 bg-white p-3"
              >
                <p className="text-[9px] font-bold uppercase text-ink/50">
                  {label}
                </p>
                <p className="mt-1 text-sm font-bold text-plum">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] leading-4 text-ink/55">
            Features remain on {upgradePreview.currentPlan} until Stripe
            verifies the invoice and replacement subscription price. You will
            leave Girlz Culture only if Stripe requires a payment action.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void confirmUpgrade()}
              className="rounded-lg bg-magenta px-5 py-3 text-xs font-bold text-white gc-disabled-control"
            >
              {busy === "confirm-upgrade"
                ? "Confirming with Stripe…"
                : `Confirm ${upgradePreview.requestedPlan} upgrade`}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                setUpgradePreview(null);
                c.setNotice(
                  "Upgrade cancelled. Your current plan and access are unchanged.",
                );
              }}
              className="rounded-lg border border-magenta px-5 py-3 text-xs font-bold text-magenta"
            >
              Keep current plan
            </button>
          </div>
        </Panel>
      ) : null}
      {scheduledPlan ? (
        <Panel className="mb-4 border-amber/35 bg-amber/10">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase text-ink/55">Current plan</p>
              <p className="mt-1 font-serif text-xl text-plum">{currentPlanLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-ink/55">
                Scheduled next plan
              </p>
              <p className="mt-1 font-serif text-xl text-plum">
                {scheduledPlan}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-ink/55">
                Effective date
              </p>
              <p className="mt-1 text-xs font-bold">
                {dateText(scheduledEffective)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-ink/55">Charged now</p>
              <p className="mt-1 font-serif text-xl text-plum">$0.00</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-ink/65">
            Your {currentPlanLabel} access remains unchanged through this paid period. No
            refund, account credit, deduction, or negative proration was
            created.
          </p>
          <button
            disabled={Boolean(busy)}
            onClick={() =>
              void action(
                "/api/stripe/subscription/lifecycle",
                "cancel-scheduled",
                { action: "cancel_scheduled_change" },
              )
            }
            className="mt-4 rounded-[8px] border border-magenta px-4 py-2.5 text-xs font-bold text-magenta"
          >
            {busy === "cancel-scheduled"
              ? "Keeping current plan…"
              : "Cancel scheduled downgrade"}
          </button>
        </Panel>
      ) : null}
      {cancellationScheduled ? (
        <Panel className="mb-4 border-magenta/30 bg-blush/35">
          <h2 className="font-serif text-2xl text-plum">
            Cancellation scheduled
          </h2>
          <p className="mt-2 text-sm text-ink/70">
            Your current plan and access remain active through{" "}
            <b>{dateText(paidThrough)}</b>. You will not be charged again.
          </p>
          <button
            disabled={Boolean(busy)}
            onClick={() =>
              void action("/api/stripe/subscription/lifecycle", "reactivate", {
                action: "reactivate",
              })
            }
            className="mt-4 rounded-[8px] bg-magenta px-5 py-3 text-xs font-bold text-white"
          >
            {busy === "reactivate"
              ? "Reactivating…"
              : "Reactivate subscription"}
          </button>
        </Panel>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((name) => {
          const plan = SUBSCRIPTION_PLANS[name];
          const current = !legacyBasicActive && c.plan === name && c.subscriptionActive;
          const changing = c.subscriptionActive && !current;
          const upgrading = changing && planRank(name) > planRank(c.plan);
          const isScheduled = scheduledPlan === name;
          const label = legacyBasicActive && name === "Starter"
            ? "Change to Starter"
            : changing
            ? upgrading
              ? `Upgrade to ${name}`
              : `Schedule ${name}`
            : `Choose ${name}`;
          return (
            <Panel
              key={name}
              className={name === "Growth" ? "border-magenta" : ""}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl text-plum">{name}</h2>
                {name === "Growth" ? (
                  <span className="rounded-full bg-magenta px-2 py-1 text-[8px] font-bold uppercase text-white">
                    Most Popular
                  </span>
                ) : null}
              </div>
              <p className="mt-3 font-serif text-3xl font-semibold">
                ${plan.monthlyAmountCents / 100}
                <span className="font-sans text-[10px] font-normal">
                  {" "}
                  / month
                </span>
              </p>
              <p className="mt-2 min-h-10 text-[11px] text-ink/60">
                {plan.description}
              </p>
              <ul className="mt-4 space-y-2 text-[10px]">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check
                      size={13}
                      className="mt-0.5 shrink-0 text-magenta"
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                disabled={
                  Boolean(busy) ||
                  current ||
                  isScheduled ||
                  cancellationScheduled
                }
                onClick={() =>
                  void action(
                    changing
                      ? "/api/stripe/subscription/change"
                      : "/api/stripe/subscription/checkout",
                    name,
                    { plan: name },
                  )
                }
                className={`mt-6 min-h-11 w-full rounded-[8px] text-xs font-bold gc-disabled-control ${current ? "border border-green-500 gc-text-success" : "bg-magenta text-white"}`}
              >
                {current
                  ? "Current active plan"
                  : isScheduled
                    ? "Scheduled next plan"
                    : busy === name
                      ? changing
                        ? upgrading
                          ? "Collecting prorated invoice…"
                          : "Scheduling downgrade…"
                        : "Opening checkout…"
                      : label}
              </button>
              {changing ? (
                <p className="mt-2 text-[10px] leading-4 text-ink/55">
                  {upgrading
                    ? "Activates only after Stripe successfully collects the actual prorated invoice."
                    : "Takes effect at the next renewal. $0.00 is charged now and current access continues."}
                </p>
              ) : null}
            </Panel>
          );
        })}
      </div>
      {c.subscription?.stripe_customer_id ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            disabled={Boolean(busy)}
            onClick={() => void action("/api/stripe/portal", "portal")}
            className="rounded-[8px] border border-magenta px-5 py-3 text-xs font-bold text-magenta"
          >
            {busy === "portal" ? "Opening billing…" : "Manage payment method"}
          </button>
          {c.subscriptionActive && !cancellationScheduled ? (
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                void action("/api/stripe/subscription/lifecycle", "cancel", {
                  action: "cancel_at_period_end",
                })
              }
              className="rounded-[8px] border border-plum/20 px-5 py-3 text-xs font-bold text-plum"
            >
              {busy === "cancel"
                ? "Scheduling cancellation…"
                : "Cancel at period end"}
            </button>
          ) : null}
        </div>
      ) : null}
      <Panel className="mt-5 overflow-x-auto">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-plum">
              Stripe billing history
            </h2>
            <p className="mt-1 text-[10px] text-ink/55">
              Confirmed invoice, renewal, plan-change, refund, and credit events
              received through the signed Stripe webhook.
            </p>
          </div>
          <span className="text-[9px] font-bold uppercase text-amber">
            Test mode
          </span>
        </div>
        <table className="mt-4 w-full min-w-[760px] text-left text-[10px]">
          <thead>
            <tr>
              {[
                "Date",
                "Event",
                "Plan",
                "Collected",
                "Refunded",
                "Credited",
                "Payment",
                "Stripe reference",
              ].map((label) => (
                <th key={label} className="border-b border-plum/10 py-2 pr-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.billingEvents.map((event) => (
              <tr key={event.id} className="border-b border-plum/10">
                <td className="py-3 pr-3">{dateText(event.event_date)}</td>
                <td className="pr-3">
                  <b>{String(event.event_type || "Billing event")}</b>
                  {event.failure_reason ? (
                    <span className="block gc-text-danger">
                      {String(event.failure_reason)}
                    </span>
                  ) : null}
                </td>
                <td className="pr-3">
                  {[event.previous_plan, event.new_plan]
                    .filter(Boolean)
                    .join(" → ") || "—"}
                </td>
                <td className="pr-3">
                  ${(Number(event.amount_collected || 0) / 100).toFixed(2)}
                </td>
                <td className="pr-3">
                  ${(Number(event.amount_refunded || 0) / 100).toFixed(2)}
                </td>
                <td className="pr-3">
                  ${(Number(event.amount_credited || 0) / 100).toFixed(2)}
                </td>
                <td className="pr-3">
                  <Status
                    value={String(event.payment_status || "Not recorded")}
                  />
                </td>
                <td className="max-w-52 break-all pr-3 text-[9px]">
                  {String(
                    event.stripe_invoice_id || event.stripe_event_id || "—",
                  )}
                </td>
              </tr>
            ))}
            {!c.billingEvents.length ? (
              <tr>
                <td colSpan={8}>
                  <Empty text="No signed Stripe billing events have been received for this salon yet." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>
    </>
  );
}

function Title({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-[36px] font-semibold leading-none tracking-[-.035em] text-plum sm:text-[48px]">
          {title}
        </h1>
        <p className="mt-2 text-sm text-ink/65">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-[13px] border border-plum/10 bg-white/70 p-4 shadow-[0_5px_18px_rgba(13,17,20,.035)] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}
function Metric({
  label,
  value,
  icon: Icon = Eye,
}: {
  label: string;
  value: string | number;
  trend?: string;
  icon?: React.ComponentType<{ size?: number }>;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink/70">{label}</p>
          <p className="mt-1 font-serif text-[28px] font-semibold">{value}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-blush text-magenta">
          <Icon size={22} />
        </span>
      </div>
    </Panel>
  );
}
function MiniLine() {
  return (
    <p className="rounded-[8px] border border-dashed border-plum/15 bg-cream/50 p-4 text-center text-[10px] text-ink/50">
      No historical trend data yet.
    </p>
  );
}

function Overview({ c }: { c: Ctx }) {
  const completed = c.bookings.filter(
    (b) => String(b.status).toLowerCase() === "completed",
  );
  const revenue = completed.reduce(
    (sum, b) => sum + Number(b.estimated_total || 0),
    0,
  );
  const [renderedAt] = useState(() => Date.now());
  const upcoming = c.bookings
    .filter(
      (b) =>
        new Date(String(b.appointment_datetime || 0)).getTime() > renderedAt &&
        !/cancelled/i.test(String(b.status || "")),
    )
    .slice(0, 3);
  const completion = Math.round(
    ([
      c.salon.name,
      c.salon.description,
      c.salon.phone,
      c.salon.address_street,
      c.salon.cover_photo_url,
      c.styles.length,
      c.stylists.length,
    ].filter(Boolean).length /
      7) *
      100,
  );
  const salonCancellations = c.bookings.filter(
    (booking) =>
      String(
        booking.cancelled_by || booking.cancellation_initiated_by || "",
      ).toLowerCase() === "salon",
  ).length;
  const cancellationRate = c.bookings.length
    ? (salonCancellations / c.bookings.length) * 100
    : 0;
  const quickActions = (
    [
      ["Add Photos", "photos", ImagePlus],
      ["Availability", "availability", CalendarDays],
      ["Promotion", "promotions", Megaphone],
      ["Add Stylist", "stylists", UserPlus],
      ["Add Product", "products", Package],
    ] as const
  ).filter(([, path]) => c.access === null || Boolean(c.access[path]));
  return (
    <>
      <Title
        title="Your Dashboard"
        subtitle="Run your business with confidence."
      />
      <SalonOpenStatusControl salon={c.salon} />
      {cancellationRate > c.cancellationThreshold ? (
        <div className="mb-4 rounded-[10px] border border-red-200 bg-red-50 p-4 text-xs gc-text-danger">
          <b>
            Your salon cancellation rate is above {c.cancellationThreshold}%.
          </b>
          <p className="mt-1">
            Update availability before accepting more bookings to protect your
            quality standing.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Profile Views"
          value={Number(c.salon.profile_views || 0)}
        />
        <Metric
          label="Total Bookings"
          value={c.bookings.length}
          icon={CalendarDays}
        />
        <Metric
          label="New Customers"
          value={
            new Set(
              c.bookings
                .map((b) => b.customer_id || b.guest_email)
                .filter(Boolean),
            ).size
          }
          icon={UsersRound}
        />
        <Metric
          label="Completed Booking Value"
          value={`$${revenue.toLocaleString()}`}
          icon={CircleDollarSign}
        />
        <Metric
          label="Salon Cancellation Rate"
          value={`${cancellationRate.toFixed(1)}%`}
          icon={Clock3}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[.75fr_1.5fr_.8fr]">
        <Panel>
          <h2 className="font-serif text-xl text-plum">Profile Completion</h2>
          <p className="mt-3 text-sm">
            Complete your profile to attract more clients and grow your brand.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <div className="h-2 flex-1 rounded-full bg-blush">
              <div
                className="h-full rounded-full bg-magenta"
                style={{ width: `${completion}%` }}
              />
            </div>
            <b>{completion}%</b>
          </div>
          <Link
            href="/salon/dashboard/my-page"
            className="mt-6 inline-flex text-xs font-bold text-magenta"
          >
            Finish setup
          </Link>
        </Panel>
        <Panel>
          <div className="flex justify-between">
            <h2 className="font-serif text-xl text-plum">
              Upcoming Appointments
            </h2>
            <Link
              href="/salon/dashboard/bookings"
              className="text-xs text-magenta"
            >
              View all
            </Link>
          </div>
          <div className="mt-3 divide-y divide-plum/10">
            {upcoming.map((booking, index) => (
              <Link
                href={`/salon/dashboard/bookings/${booking.id}`}
                key={booking.id || index}
                className="grid grid-cols-[85px_1fr_auto] gap-3 py-3 text-xs"
              >
                <span>
                  {dateText(booking.appointment_datetime, c.salon.time_zone)}
                </span>
                <span>
                  <b>{styleName(c, booking.style_id)}</b>
                  <br />
                  <span className="text-ink/55">
                    {stylistName(c, booking.stylist_id)}
                  </span>
                </span>
                <Status value={String(booking.status || "Confirmed")} />
              </Link>
            ))}
            {!upcoming.length ? (
              <Empty text="No upcoming appointments." />
            ) : null}
          </div>
        </Panel>
        <Panel>
          <h2 className="font-serif text-xl text-plum">Recent Reviews</h2>
          {c.reviews.slice(0, 2).map((review, index) => (
            <div
              key={review.id || index}
              className="mt-3 border-t border-plum/10 pt-3 text-xs"
            >
              <Stars value={Number(review.rating_overall || 0)} />
              {review.written_review ? (
                <p className="mt-2 line-clamp-3">
                  {String(review.written_review)}
                </p>
              ) : null}
            </div>
          ))}
          {!c.reviews.length ? (
            <Empty text="Reviews will appear after completed bookings." />
          ) : null}
        </Panel>
      </div>
      <div
        className={`mt-4 grid gap-4 ${c.isOwner ? "lg:grid-cols-[.7fr_1.3fr]" : ""}`}
      >
        {c.isOwner ? (
          <Panel>
            <div className="flex items-center gap-3">
              <Crown className="text-magenta" />
              <div>
                <p className="text-xs">Subscription</p>
                <h2 className="font-serif text-xl text-plum">
                  {displayStoredPlan(
                    c.subscription?.subscription_tier ||
                      c.subscription?.tier ||
                      c.salon.subscription_tier,
                  )}{" "}
                  Plan
                </h2>
              </div>
            </div>
            <Link
              href="/salon/dashboard/subscription"
              className="mt-4 inline-flex text-xs font-bold text-magenta"
            >
              Manage subscription
            </Link>
          </Panel>
        ) : null}
        <Panel>
          <h2 className="font-serif text-xl text-plum">Quick Actions</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {quickActions.map(([label, path, Icon]) => (
              <Link
                key={path}
                href={`/salon/dashboard/${path}`}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-[10px] border border-plum/10 bg-cream/40 text-center text-[10px] font-semibold text-ink"
              >
                <Icon size={25} className="text-magenta" />
                {label}
              </Link>
            ))}
            {!quickActions.length ? (
              <p className="col-span-full text-xs text-ink/55">
                No quick actions are assigned to this role.
              </p>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}

function MyPage({ c, focus }: { c: Ctx; focus: string }) {
  if (!focus) {
    const trustCount = Object.values(c.salon.trust_info || {}).filter(Boolean).length;
    return (
      <>
        <Title
          title="My Page"
          subtitle="Choose one part of your public salon page to review or update."
          action={
            <Link
              href={`/salon/${c.salon.slug}`}
              className="rounded-[8px] border border-magenta px-4 py-3 text-xs font-bold text-magenta"
            >
              Preview public page
            </Link>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OwnerSectionCard href="/salon/dashboard/my-page/business" icon={UserRound} title="Business information" description="Salon name, contact details, languages, and trust information." meta={`${trustCount} trust item${trustCount === 1 ? "" : "s"} enabled`} status="Public" />
          <OwnerSectionCard href="/salon/dashboard/my-page/description" icon={Sparkles} title="Description" description="Tell customers what makes your salon and services distinctive." meta={c.salon.description ? `${String(c.salon.description).length} characters` : "Description needed"} status={c.salon.description ? "Ready" : "Incomplete"} />
          <OwnerSectionCard href="/salon/dashboard/my-page/address" icon={Info} title="Address" description="Keep the marketplace location and map position accurate." meta={c.salon.formatted_address || [c.salon.address_city, c.salon.address_state].filter(Boolean).join(", ") || "Address needed"} status={c.salon.address_needs_review ? "Needs review" : "Verified"} />
          <OwnerSectionCard href="/salon/dashboard/availability" icon={Clock3} title="Hours" description="Manage store hours, calendar availability, and scheduling rules." meta={`${Object.keys(c.salon.hours || {}).length} days configured`} />
          <OwnerSectionCard href="/salon/dashboard/my-page/social" icon={ExternalLink} title="Social links" description="Connect your Instagram, TikTok, and Google Business profiles." meta={[c.salon.instagram_url, c.salon.tiktok_url, c.salon.google_business_url].filter(Boolean).length ? "Links added" : "No links added"} />
          <OwnerSectionCard href="/salon/dashboard/photos" icon={ImagePlus} title="Cover, logo & gallery" description="Manage the visual media customers see on your salon profile." meta={`${Array.isArray(c.salon.gallery_photos) ? c.salon.gallery_photos.length : 0} gallery items`} status={c.salon.cover_photo_url ? "Published" : "Cover needed"} />
          <OwnerSectionCard href="/salon/dashboard/my-page/policies" icon={BadgeCheck} title="Policies" description="Review booking, deposit, privacy, and customer-safety policies." meta="Platform policies" />
          {c.isOwner ? <OwnerSectionCard href="/salon/dashboard/my-page/identity" icon={Crown} title="Public identity" description="Manage your requested public URL and verified identity links." meta={c.salon.vanity_slug || c.salon.slug || "Standard URL"} /> : null}
        </div>
      </>
    );
  }

  if (focus === "policies") {
    return (
      <>
        <OwnerDetailHeader title="Salon policies" subtitle="These marketplace-wide protections are shown consistently to every customer." fallbackHref="/salon/dashboard/my-page" status="Managed by Girlz Culture" />
        <Panel>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Deposit & refund policy", "/deposit-refund-policy"],
              ["Privacy policy", "/privacy"],
              ["Community guidelines", "/community-guidelines"],
              ["Photo & content consent", "/photo-content-consent"],
            ].map(([label, href]) => (
              <Link key={href} href={href} className="flex min-h-14 items-center justify-between rounded-[9px] border border-plum/10 px-4 text-xs font-bold text-plum">
                {label}<ExternalLink aria-hidden="true" size={15} />
              </Link>
            ))}
          </div>
          <p className="mt-4 rounded-[9px] bg-blush/30 p-4 text-xs leading-5 text-ink/65">Salon-specific scheduling controls, hours, and closure dates remain in Availability &amp; Calendar so customers always receive the same authoritative booking rules.</p>
        </Panel>
      </>
    );
  }

  if (focus === "identity") {
    return (
      <>
        <OwnerDetailHeader title="Public identity" subtitle="Manage the salon URL and the identity customers use to recognize your business." fallbackHref="/salon/dashboard/my-page" />
        {c.isOwner ? <SalonVanityManager salon={c.salon} /> : <Panel><Empty text="Only the salon owner can manage the public identity." /></Panel>}
      </>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (focus === "address") {
      const zip = String(f.get("address_zip") || "");
      if (!isValidUsZip(zip)) { c.setNotice("Enter a valid ZIP code (12345 or 12345-6789)."); return; }
      let state: string;
      try { state = normalizeUsState(f.get("address_state")); }
      catch (error) { c.setNotice(error instanceof Error ? error.message : "Choose a valid US state."); return; }
      await c.updateSalon({ address_street: f.get("address_street"), address_line2: f.get("address_line2") || null, address_city: f.get("address_city"), address_state: state, address_zip: normalizeUsZip(zip) });
      return;
    }
    if (focus === "description") {
      await c.updateSalon({ description: f.get("description"), description_ai_assisted: f.get("description_ai_assisted") === "true", description_ai_draft_id: f.get("description_ai_draft_id") });
      return;
    }
    if (focus === "social") {
      await c.updateSalon({ instagram_url: f.get("instagram_url") || null, tiktok_url: f.get("tiktok_url") || null, google_business_url: f.get("google_business_url") || null });
      return;
    }
    await c.updateSalon({ name: f.get("name"), phone: f.get("phone"), email: f.get("email"), languages: String(f.get("languages") || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 5), trust_info: Object.fromEntries(["licensed_professionals", "clean_safe", "women_owned", "appointment_only"].map((key) => [key, f.get(key) === "on"])) });
  }
  const addressWarning =
    c.salon.address_needs_review || c.salon.geocode_status === "needs_review";
  const headings: Record<string, [string, string]> = {
    business: ["Business information", "Update the public identity and contact details customers rely on."],
    description: ["Salon description", "Describe the services, atmosphere, and experience customers can expect."],
    address: ["Salon address", "Keep the customer-facing address and marketplace map location accurate."],
    social: ["Social links", "Add the verified profiles customers can use to see more of your work."],
  };
  const [heading, subtitle] = headings[focus] || headings.business;
  return (
    <>
      <OwnerDetailHeader title={heading} subtitle={subtitle} fallbackHref="/salon/dashboard/my-page" status="Public page" />
      {focus === "address" && addressWarning ? (
        <div
          role="alert"
          className="mb-4 rounded-[12px] border border-amber/50 bg-coral/10 p-4 text-sm text-ink"
        >
          <b className="font-serif text-lg text-plum">Address needs review</b>
          <p className="mt-1 leading-6">
            Check the complete street address, city, state, and ZIP below, then
            save again. Your salon stays out of nearby results until its map
            location is verified.
          </p>
        </div>
      ) : null}
      <form
        id="my-page-form"
        onSubmit={submit}
        className="max-w-4xl"
      >
        <Panel>
          <h2 className="font-serif text-xl text-plum">{heading}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {focus === "business" ? <>
              <Field label="Business Name" name="name" defaultValue={c.salon.name} required wide />
              <Field label="Phone" name="phone" defaultValue={c.salon.phone} />
              <Field label="Email" name="email" defaultValue={c.salon.email} type="email" />
              <Field label="Languages Spoken" name="languages" defaultValue={(c.salon.languages || []).join(", ")} wide />
              <div className="sm:col-span-2"><p className="mb-2 text-xs font-bold">Trust information</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["licensed_professionals", "Licensed Professionals"], ["clean_safe", "Clean & Safe Studio"], ["women_owned", "Women-Owned"], ["appointment_only", "By Appointment Only"]].map(([key, label]) => <label key={key} className="flex min-h-20 flex-col justify-between rounded-[9px] border border-plum/10 p-3 text-[10px] font-semibold"><span>{label}</span><input name={key} type="checkbox" defaultChecked={c.salon.trust_info?.[key]} className="accent-magenta" /></label>)}</div></div>
            </> : null}
            {focus === "description" ? <SalonDescriptionEditor initialValue={c.salon.description || ""} initiallyAiAssisted={c.salon.description_ai_assisted === true} /> : null}
            {focus === "address" ? <>
              <Field label="Address Line 1" name="address_street" defaultValue={c.salon.address_street} required />
              <Field label="Address Line 2" name="address_line2" defaultValue={c.salon.address_line2} />
              <Field label="City" name="address_city" defaultValue={c.salon.address_city} required />
              <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold">
                State <span className="text-magenta">*</span>
              </span>
              <select
                name="address_state"
                required
                defaultValue={c.salon.address_state || "NY"}
                className="min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs outline-none focus:border-magenta"
              >
                {US_STATES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              </label>
              <Field label="ZIP Code" name="address_zip" defaultValue={c.salon.address_zip} required />
            </> : null}
            {focus === "social" ? <>
              <Field label="Instagram URL" name="instagram_url" type="url" defaultValue={c.salon.instagram_url} wide />
              <Field label="TikTok URL" name="tiktok_url" type="url" defaultValue={c.salon.tiktok_url} wide />
              <Field label="Google Business URL" name="google_business_url" type="url" defaultValue={c.salon.google_business_url} wide />
            </> : null}
          </div>
          <button className="mt-5 min-h-11 rounded-[8px] bg-magenta px-6 text-xs font-bold text-white">Save and verify</button>
        </Panel>
      </form>
    </>
  );
}

function SalonLogoEditor({ c }: { c: Ctx }) {
  const [logo, setLogo] = useState(String(c.salon.logo_url || ""));
  return (
    <Panel className="mt-4">
      <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 className="font-serif text-xl text-plum">Salon Logo</h2>
          <p className="mt-1 text-xs text-ink/55">
            This is the business mark shown in your owner dashboard and public
            salon profile.
          </p>
          <div className="mt-4 max-w-xl">
            <ImageUpload
              bucket="salon-photos"
              preset="logo"
              folder={`salons/${c.salon.id}/logo`}
              label="Salon logo"
              value={logo}
              onChange={(value) =>
                setLogo(typeof value === "string" ? value : "")
              }
              attachment={{
                record_type: "salon",
                record_id: String(c.salon.id),
                field: "logo_url",
              }}
              onPersisted={(value) => {
                const next = typeof value === "string" ? value : "";
                setLogo(next);
                c.setSalon((row) =>
                  row ? { ...row, logo_url: next || undefined } : row,
                );
              }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void c.updateSalon({ logo_url: logo || null })}
          className="min-h-11 rounded-[8px] bg-magenta px-6 text-xs font-bold text-white"
        >
          Save Logo
        </button>
      </div>
    </Panel>
  );
}

function Photos({ c, focus }: { c: Ctx; focus: string }) {
  const [cover, setCover] = useState(c.salon.cover_photo_url || "");
  const [gallery, setGallery] = useState<string[]>(
    Array.isArray(c.salon.gallery_photos) ? c.salon.gallery_photos : [],
  );
  if (!focus) {
    return (
      <>
        <Title title="Photos & Media" subtitle="Choose one media area to update. Upload status and public visibility stay clear." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OwnerSectionCard href="/salon/dashboard/photos/cover" icon={ImagePlus} title="Cover photo" description="The main image at the top of your public salon page." meta={cover ? "Uploaded and attached" : "No cover uploaded"} status={cover ? "Published" : "Incomplete"} />
          <OwnerSectionCard href="/salon/dashboard/photos/logo" icon={BadgeCheck} title="Salon logo" description="The business mark shown in the dashboard and public profile." meta={c.salon.logo_url ? "Uploaded and attached" : "No logo uploaded"} status={c.salon.logo_url ? "Saved" : "Optional"} />
          <OwnerSectionCard href="/salon/dashboard/photos/gallery" icon={ImagePlus} title="Gallery" description="Upload, crop, reorder, and remove photos of your work and space." meta={`${gallery.length} of 16 items`} status={gallery.length ? "Published" : "Empty"} />
        </div>
        <Panel className="mt-4"><p className="text-xs leading-5 text-ink/60"><b className="text-plum">Media status:</b> an item moves from staged to uploaded, attached, saved, and published. A failed upload remains visible with a safe error instead of silently disappearing.</p></Panel>
      </>
    );
  }
  if (focus === "logo") {
    return <><OwnerDetailHeader title="Salon logo" subtitle="Upload and save the mark used across your public profile and dashboard." fallbackHref="/salon/dashboard/photos" status={c.salon.logo_url ? "Saved" : "Optional"} /><SalonLogoEditor c={c} /></>;
  }
  const galleryMode = focus === "gallery";
  return (
    <>
      <Title
        title={galleryMode ? "Gallery" : "Cover photo"}
        subtitle="Manage the media that tells your salon’s story."
        action={
          <div className="flex gap-2"><Link href="/salon/dashboard/photos" className="rounded-[8px] border border-plum/15 bg-white px-4 py-3 text-xs font-bold text-plum">Back</Link><button
            onClick={() =>
              c.updateSalon({
                cover_photo_url: cover,
                gallery_photos: gallery,
                media_consent: true,
              })
            }
            className="rounded-[8px] bg-magenta px-6 py-3 text-xs font-bold text-white"
          >
            Save media
          </button></div>
        }
      />
      <div className="max-w-5xl">
        {!galleryMode ? <Panel>
          <ImageUpload
            bucket="salon-photos"
            preset="cover"
            folder={`salons/${c.salon.id}`}
            label="Cover Photo"
            value={cover}
            onChange={(v) => setCover(typeof v === "string" ? v : "")}
            attachment={{
              record_type: "salon",
              record_id: String(c.salon.id),
              field: "cover_photo_url",
            }}
            onPersisted={(value) => {
              const next = typeof value === "string" ? value : "";
              setCover(next);
              c.setSalon((row) =>
                row ? { ...row, cover_photo_url: next || undefined } : row,
              );
            }}
            helperText="JPG or PNG, maximum 2MB after optimization."
          />
        </Panel> : null}
        {galleryMode ? <Panel>
          <ImageUpload
            bucket="salon-photos"
            preset="gallery"
            multiple
            maxFiles={16}
            folder={`salons/${c.salon.id}/gallery`}
            label="Media Library"
            value={gallery}
            onChange={(v) => setGallery(Array.isArray(v) ? v : [])}
            attachment={{
              record_type: "salon",
              record_id: String(c.salon.id),
              field: "gallery_photos",
            }}
            onPersisted={(value) => {
              const next = Array.isArray(value) ? value.map(String) : [];
              setGallery(next);
              c.setSalon((row) =>
                row ? { ...row, gallery_photos: next } : row,
              );
            }}
            helperText="Upload, remove, and reorder salon work photos."
          />
          <label className="mt-5 flex gap-3 text-xs font-semibold">
            <input type="checkbox" defaultChecked className="accent-magenta" />I
            confirm I have permission to use these images and the right to
            display them.
          </label>
        </Panel> : null}
      </div>
    </>
  );
}

function Styles({ c }: { c: Ctx }) {
  const active = c.styles.find((s) => s.id === c.selectedStyle) || null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const priced = (key: string) =>
      String(f.get(key) || "")
        .split("\n")
        .map((line) => {
          const [label, price_add] = line.split("|");
          return { label: label?.trim(), price_add: Number(price_add || 0) };
        })
        .filter((x) => x.label);
    const saved = await c.saveRecord(
      "styles",
      {
        name: f.get("name"),
        category: f.get("category"),
        description: f.get("description"),
        duration_min_hours: Number(f.get("duration_min")),
        duration_max_hours: Number(f.get("duration_max")),
        base_price: Number(f.get("base_price")),
        price_display_min: Number(f.get("base_price")),
        price_display_max: Number(f.get("max_price") || f.get("base_price")),
        size_options: priced("sizes"),
        length_options: priced("lengths"),
        addons: priced("addons"),
        included_items: String(f.get("included") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      },
      active?.id,
    );
    if (saved) {
      c.setStyles((rows) =>
        active
          ? rows.map((r) => (r.id === active.id ? saved : r))
          : [saved, ...rows],
      );
      c.setSelectedStyle(saved.id || null);
    }
  }
  return (
    <>
      <Title
        title="Styles & Pricing"
        subtitle="Manage your signature styles, pricing, options, and inclusions."
        action={
          <button
            onClick={() => c.setSelectedStyle(null)}
            className="rounded-[8px] bg-magenta px-6 py-3 text-xs font-bold text-white"
          >
            <Plus className="mr-1 inline" size={16} />
            Add Style
          </button>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[.72fr_1.28fr]">
        <Panel>
          <h2 className="font-serif text-xl text-plum">Your Styles</h2>
          <div className="mt-3 space-y-2">
            {c.styles.map((style, i) => {
              const min = Number(style.duration_min_hours || 0);
              const max = Number(style.duration_max_hours || 0);
              const duration =
                min && max ? `${min}–${max} hrs` : "Duration not set";
              return (
                <button
                  key={style.id}
                  onClick={() => c.setSelectedStyle(style.id || null)}
                  className={`grid w-full grid-cols-[64px_1fr_auto] gap-3 rounded-[10px] border p-2 text-left ${c.selectedStyle === style.id ? "border-magenta bg-blush/30" : "border-plum/10"}`}
                >
                  <SafeImage
                    src={(style.photos as string[])?.[0]}
                    fallbackSrc={fallbackPhotos[i % fallbackPhotos.length]}
                    alt={style.name || "Style"}
                    className="h-16 w-16 rounded-[8px] object-cover"
                  />
                  <span>
                    <b className="font-serif text-base">{style.name}</b>
                    <span className="mt-1 block text-[10px] text-ink/55">
                      {String(style.category || "Uncategorized")} • {duration}
                    </span>
                  </span>
                  <span className="text-right text-[10px]">
                    From
                    <br />
                    <b className="text-sm">
                      $
                      {Number(style.price_display_min || style.base_price || 0)}
                    </b>
                  </span>
                </button>
              );
            })}
            {!c.styles.length ? <Empty text="Add your first service." /> : null}
          </div>
        </Panel>
        <Panel>
          <h2 className="font-serif text-xl text-plum">
            {active ? "Edit Style" : "Add Style"}
          </h2>
          <form
            key={active?.id || "new"}
            onSubmit={submit}
            className="mt-4 grid gap-4 sm:grid-cols-2"
          >
            <Field
              label="Style Name"
              name="name"
              defaultValue={active?.name}
              required
            />
            <Field
              label="Category"
              name="category"
              defaultValue={active?.category || ""}
            />
            <TextArea
              label="Description"
              name="description"
              defaultValue={active?.description}
              wide
            />
            <Field
              label="Duration Min (hrs)"
              name="duration_min"
              type="number"
              defaultValue={active?.duration_min_hours ?? ""}
            />
            <Field
              label="Duration Max (hrs)"
              name="duration_max"
              type="number"
              defaultValue={active?.duration_max_hours ?? ""}
            />
            <Field
              label="Base Price"
              name="base_price"
              type="number"
              defaultValue={active?.base_price ?? ""}
            />
            <Field
              label="Maximum Price"
              name="max_price"
              type="number"
              defaultValue={
                active?.price_display_max ?? active?.base_price ?? ""
              }
            />
            <TextArea
              label="Size Options — one per line: Name|Price Add"
              name="sizes"
              defaultValue={optionText(active?.size_options)}
            />
            <TextArea
              label="Length Options — one per line: Name|Price Add"
              name="lengths"
              defaultValue={optionText(active?.length_options)}
            />
            <TextArea
              label="Add-ons — one per line: Name|Price"
              name="addons"
              defaultValue={optionText(active?.addons)}
            />
            <TextArea
              label="Hair / Material — Name|Price|Longevity|Quality"
              name="materials"
              defaultValue=""
            />
            <TextArea
              label="What’s Included — comma separated"
              name="included"
              defaultValue={
                Array.isArray(active?.included_items)
                  ? (active?.included_items as string[]).join(", ")
                  : ""
              }
              wide
            />
            <button className="sm:col-span-2 min-h-11 rounded-[8px] bg-magenta text-xs font-bold text-white">
              Save Changes
            </button>
          </form>
        </Panel>
      </div>
    </>
  );
}

function Stylists({ c }: { c: Ctx }) {
  const active = c.stylists.find((s) => s.id === c.selectedStylist) || null;
  const [avatar, setAvatar] = useState(String(active?.avatar_url || ""));
  const [portfolio, setPortfolio] = useState<string[]>(
    Array.isArray(active?.photos) ? (active?.photos as string[]) : [],
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const saved = await c.saveRecord(
      "stylists",
      {
        name: f.get("name"),
        bio: f.get("bio"),
        specialties: String(f.get("specialties") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        years_experience: f.get("years") === "" ? null : Number(f.get("years")),
        avatar_url: avatar,
        photos: portfolio,
        is_active: true,
      },
      active?.id,
    );
    if (saved) {
      c.setStylists((rows) =>
        active
          ? rows.map((r) => (r.id === active.id ? saved : r))
          : [saved, ...rows],
      );
      c.setSelectedStylist(saved.id || null);
    }
  }
  return (
    <>
      <Title
        title="Stylists"
        subtitle="Manage your talented team and their expertise."
        action={
          <button
            onClick={() => {
              c.setSelectedStylist(null);
              setAvatar("");
              setPortfolio([]);
            }}
            className="rounded-[8px] bg-magenta px-6 py-3 text-xs font-bold text-white"
          >
            <Plus className="mr-1 inline" size={16} />
            Add Stylist
          </button>
        }
      />
      <div className="flex gap-3 overflow-x-auto pb-3">
        {c.stylists.map((stylist, i) => {
          const rating = Number(stylist.rating || 0);
          return (
            <button
              key={stylist.id}
              onClick={() => {
                c.setSelectedStylist(stylist.id || null);
                setAvatar(String(stylist.avatar_url || ""));
                setPortfolio(
                  Array.isArray(stylist.photos)
                    ? (stylist.photos as string[])
                    : [],
                );
              }}
              className={`min-w-[170px] rounded-[11px] border p-3 text-left ${active?.id === stylist.id ? "border-magenta bg-blush/30" : "border-plum/10 bg-white"}`}
            >
              <SafeImage
                src={stylist.avatar_url as string}
                fallbackSrc={fallbackPhotos[i % fallbackPhotos.length]}
                alt={stylist.name || "Stylist"}
                className="h-16 w-16 rounded-full object-cover"
              />
              <p className="mt-2 font-serif text-lg">{stylist.name}</p>
              {rating > 0 ? (
                <Stars value={rating} />
              ) : (
                <p className="mt-1 text-[10px] text-ink/55">New</p>
              )}
              <p className="mt-1 text-[10px] text-ink/55">
                {Number(stylist.years_experience || 0) > 0
                  ? `${Number(stylist.years_experience)} years experience`
                  : "Experience not added"}
              </p>
            </button>
          );
        })}
      </div>
      <Panel>
        <h2 className="font-serif text-xl text-plum">
          {active ? "Edit Stylist" : "Add Stylist"}
        </h2>
        <form
          key={active?.id || "new"}
          onSubmit={submit}
          className="mt-4 grid gap-4 xl:grid-cols-[.75fr_1fr_1.3fr]"
        >
          <div>
            <ImageUpload
              bucket="stylist-photos"
              preset="avatar"
              folder={`stylists/${active?.id || "new"}`}
              label="Profile Photo"
              value={avatar}
              onChange={(v) => setAvatar(typeof v === "string" ? v : "")}
            />
          </div>
          <div className="space-y-4">
            <Field
              label="Name"
              name="name"
              defaultValue={active?.name}
              required
            />
            <TextArea
              label="Bio / Description"
              name="bio"
              defaultValue={active?.bio}
            />
            <Field
              label="Specialties (comma separated)"
              name="specialties"
              defaultValue={
                Array.isArray(active?.specialties)
                  ? (active?.specialties as string[]).join(", ")
                  : ""
              }
            />
            <Field
              label="Years of Experience"
              name="years"
              type="number"
              defaultValue={active?.years_experience ?? ""}
            />
            <button className="min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white">
              Save Changes
            </button>
          </div>
          <ImageUpload
            bucket="stylist-photos"
            preset="gallery"
            multiple
            maxFiles={10}
            folder={`stylists/${active?.id || "new"}/portfolio`}
            label="Work Portfolio"
            value={portfolio}
            onChange={(v) => setPortfolio(Array.isArray(v) ? v : [])}
          />
        </form>
      </Panel>
    </>
  );
}

function TruthfulProducts({ c, recordId = "" }: { c: Ctx; recordId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active =
    recordId === "new" ? null : c.products.find((product) => product.id === recordId) || null;
  const [photo, setPhoto] = useState(String(active?.photo_url || ""));
  const [images, setImages] = useState<string[]>(
    Array.isArray(active?.images)
      ? active.images.map(String)
      : active?.photo_url
        ? [String(active.photo_url)]
      : [],
  );
  const [productQuery, setProductQuery] = useState(searchParams.get("q") || "");
  const [productStatus, setProductStatus] = useState(searchParams.get("status") || "all");
  const [fulfillment, setFulfillment] = useState(searchParams.get("fulfillment") || "all");
  const [promotionFilter, setPromotionFilter] = useState(searchParams.get("promotion") || "all");
  const hasPromotion = (product: Row) => c.promotions.some((promotion) => {
    if (promotion.is_active === false) return false;
    const scope = String(promotion.target_scope || "all").toLowerCase();
    const targets = Array.isArray(promotion.target_ids) ? promotion.target_ids.map(String) : [];
    return scope === "all" || targets.includes(String(product.id));
  });
  const productParams = new URLSearchParams({ ...(productQuery ? { q: productQuery } : {}), ...(productStatus !== "all" ? { status: productStatus } : {}), ...(fulfillment !== "all" ? { fulfillment } : {}), ...(promotionFilter !== "all" ? { promotion: promotionFilter } : {}) });
  const productListHref = `/salon/dashboard/products${productParams.toString() ? `?${productParams}` : ""}`;
  const visibleProducts = c.products.filter((product) => {
    const needle = productQuery.trim().toLowerCase();
    const status = String(product.product_status || "Draft").toLowerCase();
    const promoted = hasPromotion(product);
    const matchesFulfillment = fulfillment === "all" || (fulfillment === "pickup" ? product.pickup_enabled === true : fulfillment === "shipping" ? product.shipping_enabled === true : product.pickup_enabled !== true && product.shipping_enabled !== true);
    return (!needle || [product.name, product.description, product.sku].some((value)=>String(value || "").toLowerCase().includes(needle))) && (productStatus === "all" || status === productStatus) && matchesFulfillment && (promotionFilter === "all" || (promotionFilter === "promoted" ? promoted : !promoted));
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const pickupEnabled = form.get("pickup_enabled") === "on";
    const shippingEnabled = form.get("shipping_enabled") === "on";
    const saved = await c.saveRecord(
      "salon_products",
      {
        name: form.get("name"),
        description: form.get("description"),
        price: Number(form.get("price")),
        sale_price:
          form.get("sale_price") === ""
            ? null
            : Number(form.get("sale_price")),
        sku: form.get("sku"),
        photo_url: photo || null,
        images,
        is_visible: form.get("visible") === "on",
        in_person_only: !pickupEnabled && !shippingEnabled,
        inventory_quantity: Number(form.get("inventory_quantity")),
        low_stock_threshold: Number(form.get("low_stock_threshold")),
        track_inventory: form.get("track_inventory") === "on",
        product_status: form.get("product_status"),
        pickup_enabled: pickupEnabled,
        pickup_prep_minutes: Number(form.get("pickup_prep_minutes")),
        shipping_enabled: shippingEnabled,
        weight_ounces:
          form.get("weight_ounces") === ""
            ? null
            : Number(form.get("weight_ounces")),
        dimensions: {
          length:
            form.get("dimension_length") === ""
              ? null
              : Number(form.get("dimension_length")),
          width:
            form.get("dimension_width") === ""
              ? null
              : Number(form.get("dimension_width")),
          height:
            form.get("dimension_height") === ""
              ? null
              : Number(form.get("dimension_height")),
        },
        shipping_profile: form.get("shipping_profile"),
        shipping_price: Number(form.get("shipping_price")),
        tax_category: form.get("tax_category"),
        max_quantity_per_order: Number(form.get("max_quantity_per_order")),
      },
      active?.id,
    );
    if (saved) {
      c.setProducts((rows) =>
        active
          ? rows.map((row) => (row.id === active.id ? saved : row))
          : [saved, ...rows],
      );
      c.setSelectedProduct(saved.id || null);
      if (!active && saved.id) router.replace(`/salon/dashboard/products/${saved.id}${productParams.toString() ? `?${productParams}` : ""}`);
    }
  }
  return (
    <>
      {!recordId ? <Title
        title="Products"
        subtitle="Manage your catalog, stock, pickup, shipping, and online sales."
        action={
          <Link
            href={`/salon/dashboard/products/new${productParams.toString() ? `?${productParams}` : ""}`}
            className="rounded-[8px] bg-magenta px-6 py-3 text-xs font-bold text-white"
          >
            <Plus className="mr-1 inline" size={16} />
            Add Product
          </Link>
        }
      /> : null}
      {!recordId ? <SalonSpreadsheetPanel
        kind="products"
        onImported={(records) => {
          c.setProducts(records as Row[]);
          if (
            c.selectedProduct &&
            !records.some((record) => record.id === c.selectedProduct)
          ) {
            c.setSelectedProduct(null);
          }
        }}
      /> : null}
      {!recordId ? <div className="mb-4 flex items-start gap-2 rounded-[9px] border border-blue-200 bg-blue-50 px-4 py-3 text-xs gc-text-link">
        <Info size={16} className="shrink-0" aria-hidden="true" />
        <span>
          Published products can be purchased securely for pickup or shipping.
          Live prices and inventory are rechecked before every payment.
        </span>
      </div> : null}
      <div className="block">
        {!recordId ? <div className="mb-4 grid gap-2 rounded-xl border border-plum/10 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4"><input aria-label="Search products" value={productQuery} onChange={(event)=>setProductQuery(event.target.value)} placeholder="Search name or SKU" className="min-h-10 rounded-lg border border-plum/15 px-3 text-xs"/><select aria-label="Product status" value={productStatus} onChange={(event)=>setProductStatus(event.target.value)} className="min-h-10 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All statuses</option>{[...new Set(c.products.map((product)=>String(product.product_status || "Draft")))].map((value)=><option key={value} value={value.toLowerCase()}>{value}</option>)}</select><select aria-label="Fulfillment" value={fulfillment} onChange={(event)=>setFulfillment(event.target.value)} className="min-h-10 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All fulfillment</option><option value="pickup">Pickup enabled</option><option value="shipping">Shipping enabled</option><option value="in_person">In-person only</option></select><select aria-label="Promotion state" value={promotionFilter} onChange={(event)=>setPromotionFilter(event.target.value)} className="min-h-10 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All promotion states</option><option value="promoted">Promotion attached</option><option value="standard">No promotion</option></select><p className="sm:col-span-2 xl:col-span-4 text-[10px] text-ink/50">{visibleProducts.length} matching product{visibleProducts.length === 1 ? "" : "s"}</p></div> : null}
        {!recordId ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => router.push(`/salon/dashboard/products/${product.id}${productParams.toString() ? `?${productParams}` : ""}`)}
              className="overflow-hidden rounded-[10px] border border-plum/10 bg-white text-left"
            >
              <div className="grid aspect-square w-full place-items-center bg-blush/35 text-plum/30">
                {product.photo_url ? (
                  <SafeImage
                    src={String(product.photo_url)}
                    fallbackSrc={String(product.photo_url)}
                    alt={product.name || "Product"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageOff
                    size={30}
                    strokeWidth={1.2}
                    aria-label="No product photo uploaded"
                  />
                )}
              </div>
              <div className="p-2.5">
                <b className="line-clamp-1 text-xs">{product.name}</b>
                <p className="mt-1 line-clamp-1 text-[9px] text-ink/60">
                  {String(product.description || "")}
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {product.sale_price !== null &&
                  product.sale_price !== undefined ? (
                    <>
                      <span className="mr-1 text-[10px] gc-text-secondary line-through">
                        ${Number(product.price || 0).toFixed(2)}
                      </span>
                      <span className="text-magenta">
                        ${Number(product.sale_price || 0).toFixed(2)}
                      </span>
                    </>
                  ) : (
                    `$${Number(product.price || 0).toFixed(2)}`
                  )}
                </p>
                <p className="mt-1 text-[9px] font-semibold text-ink/50">
                  {String(product.product_status || "Draft")}
                  {product.track_inventory
                    ? ` · ${Number(product.inventory_quantity || 0)} in stock`
                    : " · stock not tracked"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1 text-[8px] font-bold"><span className={`rounded-full px-2 py-1 ${product.pickup_enabled ? "bg-emerald-100 gc-text-success" : "bg-cream gc-text-disabled"}`}>{product.pickup_enabled ? "Pickup" : "No pickup"}</span><span className={`rounded-full px-2 py-1 ${product.shipping_enabled ? "bg-blue-100 gc-text-link" : "bg-cream gc-text-disabled"}`}>{product.shipping_enabled ? "Shipping" : "No shipping"}</span>{hasPromotion(product) ? <span className="rounded-full bg-blush px-2 py-1 text-magenta">Promotion</span> : null}</div>
              </div>
            </button>
          ))}
          {!visibleProducts.length ? (
            <Empty text={c.products.length ? "No products match these filters." : "Add products sold at your salon."} />
          ) : null}
        </div> : null}
        <MobileRecordEditor
          open={Boolean(recordId)}
          title={active ? `Edit ${active.name || "product"}` : "Add product"}
          onClose={() => router.push(productListHref)}
        >
        <OwnerDetailHeader hideOnMobile title={active ? `Edit ${active.name || "product"}` : "Add product"} subtitle="Manage product media, price, inventory, pickup, shipping, and publication in one focused workspace." fallbackHref={productListHref} status={active ? String(active.product_status || "Draft") : "New product"}/>
        <Panel>
          <h2 className="font-serif text-xl text-plum">Add / Edit Product</h2>
          <form
            key={active?.id || "new"}
            onSubmit={submit}
            className="mt-4 space-y-4"
          >
            <ImageUpload
              bucket="salon-photos"
              preset="product"
              multiple
              maxFiles={12}
              folder={`salons/${c.salon.id}/products`}
              label="Product Photos"
              value={images}
              attachment={
                active?.id
                  ? {
                      record_type: "product",
                      record_id: String(active.id),
                      field: "images",
                    }
                  : null
              }
              onChange={(value) => {
                const next = Array.isArray(value)
                  ? value.map(String)
                  : value
                    ? [String(value)]
                    : [];
                setImages(next);
                setPhoto(next[0] || "");
              }}
              onPersisted={(value) => {
                const next = Array.isArray(value)
                  ? value.map(String)
                  : value
                    ? [String(value)]
                    : [];
                setImages(next);
                setPhoto(next[0] || "");
                if (active?.id) {
                  c.setProducts((rows) =>
                    rows.map((row) =>
                      row.id === active.id
                        ? {
                            ...row,
                            images: next,
                            photo_url: next[0] || null,
                          }
                        : row,
                    ),
                  );
                }
              }}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" name="name" defaultValue={active?.name} required />
              <Field
                label="SKU"
                name="sku"
                defaultValue={active?.sku}
                placeholder="Optional internal SKU"
              />
            </div>
            <TextArea
              label="Description"
              name="description"
              defaultValue={active?.description}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Regular price (USD)" name="price" type="number" defaultValue={active?.price ?? ""} required />
              <Field label="Sale price (optional)" name="sale_price" type="number" defaultValue={active?.sale_price ?? ""} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold">Status</span>
                <select
                  name="product_status"
                  defaultValue={String(active?.product_status || "Draft")}
                  className="min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs"
                >
                  <option>Draft</option>
                  <option>Active</option>
                  <option>Archived</option>
                </select>
              </label>
              <Field label="Maximum quantity per order" name="max_quantity_per_order" type="number" defaultValue={active?.max_quantity_per_order ?? 10} />
            </div>
            <div className="rounded-[12px] border border-plum/10 bg-blush/20 p-4">
              <h3 className="font-serif text-lg text-plum">Inventory</h3>
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" name="track_inventory" defaultChecked={active?.track_inventory === true} className="accent-magenta" />
                Track inventory and prevent overselling
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Quantity available" name="inventory_quantity" type="number" defaultValue={active?.inventory_quantity ?? 0} />
                <Field label="Low-stock alert at" name="low_stock_threshold" type="number" defaultValue={active?.low_stock_threshold ?? 5} />
              </div>
            </div>
            <div className="rounded-[12px] border border-plum/10 bg-white p-4">
              <h3 className="font-serif text-lg text-plum">Pickup</h3>
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" name="pickup_enabled" defaultChecked={active?.pickup_enabled === true} className="accent-magenta" />
                Offer pickup at the salon
              </label>
              <div className="mt-3">
                <Field label="Preparation time (minutes)" name="pickup_prep_minutes" type="number" defaultValue={active?.pickup_prep_minutes ?? 60} />
              </div>
            </div>
            <div className="rounded-[12px] border border-plum/10 bg-white p-4">
              <h3 className="font-serif text-lg text-plum">Shipping</h3>
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" name="shipping_enabled" defaultChecked={active?.shipping_enabled === true} className="accent-magenta" />
                Offer US shipping
              </label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Shipping price (USD)" name="shipping_price" type="number" defaultValue={active?.shipping_price ?? 0} />
                <Field label="Weight (ounces)" name="weight_ounces" type="number" defaultValue={active?.weight_ounces ?? ""} />
                <Field label="Shipping profile" name="shipping_profile" defaultValue={active?.shipping_profile} placeholder="Standard parcel" />
                <Field label="Package length (in)" name="dimension_length" type="number" defaultValue={(active?.dimensions as Row | undefined)?.length ?? ""} />
                <Field label="Package width (in)" name="dimension_width" type="number" defaultValue={(active?.dimensions as Row | undefined)?.width ?? ""} />
                <Field label="Package height (in)" name="dimension_height" type="number" defaultValue={(active?.dimensions as Row | undefined)?.height ?? ""} />
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold">Tax category</span>
              <select
                name="tax_category"
                defaultValue={String(active?.tax_category || "general_tangible_goods")}
                className="min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs"
              >
                <option value="general_tangible_goods">General tangible goods</option>
                <option value="hair_care_products">Hair-care products</option>
                <option value="beauty_accessories">Beauty accessories</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="visible"
                defaultChecked={active?.is_visible !== false}
                className="accent-magenta"
              />
              Visible on Public Page
            </label>
            <button className="min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white">
              Save Product
            </button>
            {active?.id ? (
              <button
                type="button"
                onClick={async () => {
                  await c.removeRecord(
                    "salon_products",
                    active.id!,
                    c.setProducts,
                  );
                  c.setSelectedProduct(null);
                  router.push(productListHref);
                }}
                className="min-h-11 w-full rounded-[8px] border border-red-200 text-xs font-bold gc-text-danger"
              >
                Archive product
              </button>
            ) : null}
          </form>
        </Panel>
        </MobileRecordEditor>
      </div>
      {!recordId ? <SalonProductOrders /> : null}
    </>
  );
}

function Availability({ c, recordId = "" }: { c: Ctx; recordId?: string }) {
  const hours = c.salon.hours || {};
  const settings = c.salon.booking_settings || {};
  const timeZone = c.salon.time_zone || "America/New_York";
  const [weekOffset, setWeekOffset] = useState(0);
  const [calendarBooking, setCalendarBooking] = useState<Row | null>(null);
  const week = salonWeek(timeZone, weekOffset);
  const activeBookings = c.bookings.filter(
    (booking) =>
      !["cancelled", "declined", "refunded"].includes(
        String(booking.status || "").toLowerCase(),
      ),
  );
  const [stylistId, setStylistId] = useState(c.stylists[0]?.id || "");
  const [until, setUntil] = useState("17:00");
  const [busy, setBusy] = useState("");
  const [renderedAt] = useState(() => Date.now());
  const activeStylist =
    c.stylists.find((stylist) => stylist.id === stylistId) || null;
  const activeBlockouts = c.blockouts.filter(
    (blockout) =>
      !blockout.released_at &&
      new Date(String(blockout.ends_at || 0)).getTime() > renderedAt,
  );
  useEffect(() => {
    if (!calendarBooking) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCalendarBooking(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [calendarBooking]);

  async function saveHours(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await c.updateSalon({
      hours: Object.fromEntries(
        days.map((day) => [
          day,
          {
            open: String(f.get(`${day}_open`) || "09:00"),
            close: String(f.get(`${day}_close`) || "17:00"),
            closed: f.get(`${day}_closed`) === "on",
          },
        ]),
      ),
    });
  }
  async function saveBookingSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await c.updateSalon({
      booking_settings: {
        ...settings,
        slot_minutes: Number(f.get("slot")),
        buffer_minutes: Number(f.get("buffer")),
        any_available_stylist: true,
      },
    });
  }
  async function saveStylistSchedule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeStylist?.id) return;
    const form = new FormData(e.currentTarget);
    const availability = Object.fromEntries(
      days.map((day) => {
        const working = form.get(`${day}_working`) === "on";
        return [
          day,
          {
            open: String(form.get(`${day}_open`) || "09:00"),
            close: String(form.get(`${day}_close`) || "17:00"),
            closed: !working,
          },
        ];
      }),
    );
    const data = await c.saveRecord(
      "stylists",
      { availability },
      activeStylist.id,
    );
    if (!data) return;
    c.setStylists((rows) =>
      rows.map((row) => (row.id === activeStylist.id ? data : row)),
    );
    c.setNotice(`${activeStylist.name || "Stylist"} availability saved.`);
  }
  async function block(mode: string, targetStylistId?: string) {
    const scope = targetStylistId
      ? `${activeStylist?.name || "this stylist"}`
      : "the whole salon";
    const expiration = mode.endsWith("_today")
      ? "the end of today"
      : mode === "stylist_three_hours"
        ? "three hours from now"
        : until;
    if (
      !window.confirm(
        `Block new bookings for ${scope} until ${expiration}? Existing appointments will not be cancelled.`,
      )
    ) return;
    setBusy(`${mode}:${targetStylistId || "salon"}`);
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch("/api/salon/availability/block", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mode,
          stylist_id: targetStylistId || null,
          until,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to block availability.");
      c.setBlockouts((rows) => [
        body.blockout as Row,
        ...rows.filter((row) => row.id !== body.blockout?.id),
      ]);
      c.setNotice(
        "Availability blocked immediately. Customers can no longer book that window.",
      );
    } catch (error) {
      c.setNotice(
        error instanceof Error
          ? error.message
          : "Unable to block availability.",
      );
    } finally {
      setBusy("");
    }
  }
  async function unblock(id: string) {
    setBusy(`delete:${id}`);
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(
        `/api/salon/availability/block?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to restore availability.");
      c.setBlockouts((rows) =>
        rows.map((row) =>
          row.id === id
            ? { ...row, released_at: body.blockout?.released_at || new Date().toISOString() }
            : row,
        ),
      );
      c.setNotice("Bookings resumed immediately. Public availability now uses the normal schedule.");
    } catch (error) {
      c.setNotice(
        error instanceof Error
          ? error.message
          : "Unable to restore availability.",
      );
    } finally {
      setBusy("");
    }
  }

  const booking = c.bookings.find((row) => row.id === recordId) || null;
  const blockout = c.blockouts.find((row) => row.id === recordId) || null;
  const workspaces: Record<string, { title: string; subtitle: string; status: string }> = {
    calendar: {
      title: "Appointment calendar",
      subtitle: `Review the week in ${timeZone.replaceAll("_", " ")} and open an appointment without losing calendar context.`,
      status: `${activeBookings.length} active booking${activeBookings.length === 1 ? "" : "s"}`,
    },
    hours: {
      title: "Store hours",
      subtitle: "Set the salon's regular weekly opening and closing times.",
      status: `${Object.keys(hours).length} days configured`,
    },
    slots: {
      title: "Bookable time slots",
      subtitle: "Control the public booking interval and the buffer between appointments.",
      status: `${Number(settings.slot_minutes || 30)} minute intervals`,
    },
    stylists: {
      title: "Per-stylist availability",
      subtitle: "Choose a team member and maintain the hours customers can book them.",
      status: `${c.stylists.length} stylist${c.stylists.length === 1 ? "" : "s"}`,
    },
    overrides: {
      title: "Availability overrides",
      subtitle: "Temporarily stop salon or stylist bookings, then reopen availability when ready.",
      status: `${activeBlockouts.length} active override${activeBlockouts.length === 1 ? "" : "s"}`,
    },
  };
  const workspace = workspaces[recordId];

  if (!recordId) {
    return (
      <>
        <Title
          title="Availability & Calendar"
          subtitle={`Choose one scheduling workspace. Appointments are shown in ${timeZone.replaceAll("_", " ")}.`}
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <OwnerSectionCard href="/salon/dashboard/availability/calendar" icon={CalendarDays} title="Appointment calendar" description="Review the weekly calendar and open individual appointment details." meta={`${activeBookings.length} active booking${activeBookings.length === 1 ? "" : "s"}`} status="Live" />
          <OwnerSectionCard href="/salon/dashboard/availability/hours" icon={Clock3} title="Store hours" description="Set the salon's regular weekly opening and closing schedule." meta={`${Object.keys(hours).length} days configured`} />
          <OwnerSectionCard href="/salon/dashboard/availability/slots" icon={BadgeCheck} title="Bookable time slots" description="Choose appointment intervals and the default buffer between services." meta={`${Number(settings.slot_minutes || 30)} min slots · ${Number(settings.buffer_minutes || 15)} min buffer`} />
          <OwnerSectionCard href="/salon/dashboard/availability/stylists" icon={UsersRound} title="Per-stylist availability" description="Maintain each team member's customer-facing working hours." meta={`${c.stylists.length} stylist${c.stylists.length === 1 ? "" : "s"}`} />
          <OwnerSectionCard href="/salon/dashboard/availability/overrides" icon={LockKeyhole} title="Overrides & blockouts" description="Mark the salon full, block a stylist, or release an active override." meta={`${activeBlockouts.length} active override${activeBlockouts.length === 1 ? "" : "s"}`} status={activeBlockouts.length ? "Attention" : "Clear"} />
        </div>
      </>
    );
  }

  if (!workspace) {
    return <>
      <OwnerDetailHeader title={booking ? "Calendar appointment" : blockout ? "Availability override" : "Availability details"} subtitle={booking ? `Booking #${bookingReference(booking)}` : blockout ? `Blocked until ${dateText(blockout.ends_at, timeZone)}` : "This record could not be found."} fallbackHref="/salon/dashboard/availability" status={booking ? String(booking.status || "Confirmed") : blockout ? (blockout.released_at ? "Released" : "Active override") : "Unavailable"}/>
      <Panel>{booking ? <div className="space-y-4 text-sm"><p><b className="block text-[10px] uppercase tracking-wide gc-text-secondary">Customer</b>{String(booking.guest_name || "Customer")}</p><p><b className="block text-[10px] uppercase tracking-wide gc-text-secondary">Appointment</b>{dateText(booking.appointment_datetime, timeZone)}<br/>{styleName(c, booking.style_id)} · {stylistName(c, booking.stylist_id)}</p><Link href={`/salon/dashboard/bookings/${booking.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-magenta px-5 text-xs font-bold text-white">Manage booking</Link></div> : blockout ? <div className="space-y-4 text-sm"><p><b className="block text-[10px] uppercase tracking-wide gc-text-secondary">Applies to</b>{blockout.stylist_id ? stylistName(c, blockout.stylist_id) : "Whole salon"}</p><p><b className="block text-[10px] uppercase tracking-wide gc-text-secondary">Window</b>{dateText(blockout.starts_at, timeZone)} – {dateText(blockout.ends_at, timeZone)}</p>{!blockout.released_at ? <button type="button" disabled={Boolean(busy)} onClick={() => void unblock(String(blockout.id))} className="min-h-11 rounded-lg border border-magenta px-5 text-xs font-bold text-magenta">Release override</button> : null}</div> : <Empty text="The availability record is unavailable or outside this salon."/>}</Panel>
    </>;
  }

  return (
    <>
      <OwnerDetailHeader
        title={workspace.title}
        subtitle={workspace.subtitle}
        fallbackHref="/salon/dashboard/availability"
        status={workspace.status}
      />
      {recordId === "overrides" ? <Panel className="mb-4 border-magenta/20 bg-blush/25">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <h2 className="font-serif text-xl text-plum">
              Salon is full right now
            </h2>
            <p className="mt-1 text-xs text-ink/60">
              Stop all new bookings immediately when walk-ins fill every chair.
            </p>
          </div>
          <button
            disabled={Boolean(busy)}
            onClick={() => void block("salon_today")}
            className="min-h-11 rounded-[8px] bg-plum px-5 text-xs font-bold text-white gc-disabled-control"
          >
            Mark salon full today
          </button>
          <label className="text-[10px] font-bold">
            Booked until
            <div className="mt-1 flex">
              <input
                type="time"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
                className="min-h-11 rounded-l-[8px] border border-plum/15 px-3"
              />
              <button
                disabled={Boolean(busy)}
                onClick={() => void block("salon_until")}
                className="rounded-r-[8px] bg-magenta px-4 text-white gc-disabled-control"
              >
                Block
              </button>
            </div>
          </label>
        </div>
      </Panel> : null}
      <div className="grid gap-4">
        {recordId === "calendar" ? <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl text-plum">Appointment calendar</h2>
              <p className="mt-1 text-[10px] text-ink/55">{weekRangeLabel(week)} · {timeZone.replaceAll("_", " ")}</p>
            </div>
            <div className="flex items-center overflow-hidden rounded-[9px] border border-plum/15 bg-white">
              <button type="button" aria-label="Previous week" onClick={() => setWeekOffset((value) => value - 1)} className="grid min-h-11 min-w-11 place-items-center border-r border-plum/10 text-plum"><ChevronLeft size={17}/></button>
              <button type="button" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0} className="min-h-11 px-4 text-xs font-bold text-magenta gc-disabled-control">Today</button>
              <button type="button" aria-label="Next week" onClick={() => setWeekOffset((value) => value + 1)} className="grid min-h-11 min-w-11 place-items-center border-l border-plum/10 text-plum"><ChevronRight size={17}/></button>
            </div>
          </div>
          <div className="space-y-2 md:hidden">
            {week.map((date) => {
              const dayBookings = activeBookings.filter((booking) => dateKeyInTimeZone(String(booking.appointment_datetime || ""), timeZone) === date.key).sort((a, b) => String(a.appointment_datetime).localeCompare(String(b.appointment_datetime)));
              return <section key={date.key} className="rounded-[10px] border border-plum/10 bg-white p-3"><header className="flex items-center justify-between"><b className="text-xs uppercase tracking-wide text-plum">{date.label}</b><span className="font-serif text-base">{date.day}</span></header><div className="mt-2 space-y-2">{dayBookings.map((booking, index) => <CalendarBookingButton key={String(booking.id || index)} booking={booking} c={c} timeZone={timeZone} onOpen={setCalendarBooking}/>)}{!dayBookings.length?<p className="py-2 text-center text-[10px] text-ink/40">No appointments</p>:null}</div></section>;
            })}
          </div>
          <div className="hidden max-w-full overflow-x-auto md:block">
            <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-[12px] border border-plum/10">
              {week.map((date) => (
              <section
                key={date.key}
                className="min-h-[430px] border-r border-plum/10 bg-cream/20 last:border-r-0"
              >
                <header className="border-b border-plum/10 bg-white/80 px-2 py-3 text-center">
                  <b className="block text-[10px] uppercase tracking-wide text-plum">
                    {date.label}
                  </b>
                  <span className="mt-1 block font-serif text-lg">
                    {date.day}
                  </span>
                </header>
                <div className="space-y-2 p-2">
                  {activeBookings
                    .filter(
                      (booking) =>
                        dateKeyInTimeZone(
                          String(booking.appointment_datetime || ""),
                          timeZone,
                        ) === date.key,
                    )
                    .sort((a, b) =>
                      String(a.appointment_datetime).localeCompare(
                        String(b.appointment_datetime),
                      ),
                    )
                    .map((booking, index) => <CalendarBookingButton key={String(booking.id || index)} booking={booking} c={c} timeZone={timeZone} onOpen={setCalendarBooking}/>)}
                  {!activeBookings.some(
                    (booking) =>
                      dateKeyInTimeZone(
                        String(booking.appointment_datetime || ""),
                        timeZone,
                      ) === date.key,
                  ) ? (
                    <p className="py-5 text-center text-[9px] text-ink/35">
                      No appointments
                    </p>
                  ) : null}
                </div>
              </section>
              ))}
            </div>
          </div>
        </Panel> : null}
        {recordId === "hours" || recordId === "slots" ? <div className="mx-auto w-full max-w-3xl space-y-4">
          {recordId === "hours" ? <Panel>
            <h2 className="font-serif text-xl text-plum">Store Hours</h2>
            <p className="mt-1 text-[10px] text-ink/55">
              Choose times in 15-minute increments. No typed time values are
              accepted.
            </p>
            <form onSubmit={saveHours} className="mt-3 space-y-2">
              {days.map((day) => {
                const value = hours[day] as Row | undefined;
                const legacyClosed =
                  typeof hours[day] === "string" &&
                  String(hours[day]).toLowerCase() === "closed";
                const closed = value?.closed === true || legacyClosed;
                return (
                  <div
                    key={day}
                    className="grid grid-cols-[32px_1fr_1fr] gap-2 rounded-[8px] border border-plum/10 p-2 text-[10px]"
                  >
                    <b>{day}</b>
                    <select
                      aria-label={`${day} opening time`}
                      name={`${day}_open`}
                      defaultValue={String(value?.open || "09:00")}
                      className="min-w-0 rounded-[6px] border border-plum/10 bg-white px-1"
                    >
                      {STORE_TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${day} closing time`}
                      name={`${day}_close`}
                      defaultValue={String(value?.close || "17:00")}
                      className="min-w-0 rounded-[6px] border border-plum/10 bg-white px-1"
                    >
                      {STORE_TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <label className="col-span-3 flex items-center justify-end gap-2">
                      <input
                        name={`${day}_closed`}
                        type="checkbox"
                        defaultChecked={closed}
                        className="accent-magenta"
                      />
                      Closed
                    </label>
                  </div>
                );
              })}
              <button className="min-h-10 w-full rounded-[8px] bg-magenta text-xs font-bold text-white">
                Save hours
              </button>
            </form>
          </Panel> : null}
          {recordId === "slots" ? <Panel>
            <h2 className="font-serif text-xl text-plum">
              Bookable Time Slots
            </h2>
            <form
              onSubmit={saveBookingSettings}
              className="mt-3 grid grid-cols-2 gap-2"
            >
              <label className="text-[10px] font-bold">
                Slot interval
                <select
                  name="slot"
                  defaultValue={Number(settings.slot_minutes || 30)}
                  className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 px-2"
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="60">60 min</option>
                </select>
              </label>
              <label className="text-[10px] font-bold">
                Default buffer
                <select
                  name="buffer"
                  defaultValue={Number(settings.buffer_minutes || 15)}
                  className="mt-1 min-h-10 w-full rounded-[7px] border border-plum/15 px-2"
                >
                  <option value="0">No buffer</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                </select>
              </label>
              <button className="col-span-2 min-h-10 rounded-[8px] border border-magenta text-xs font-bold text-magenta">
                Save booking settings
              </button>
            </form>
          </Panel> : null}
        </div> : null}
      </div>
      <div className="grid gap-4">
        {recordId === "stylists" ? <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl text-plum">
                Per-Stylist Availability
              </h2>
              <p className="mt-1 text-xs text-ink/55">
                A stylist only appears for customers inside these working hours.
              </p>
            </div>
            {c.stylists.length ? (
              <select
                value={stylistId}
                onChange={(event) => setStylistId(event.target.value)}
                className="min-h-10 rounded-[8px] border border-plum/15 px-3 text-xs"
              >
                {c.stylists.map((stylist) => (
                  <option key={stylist.id} value={stylist.id}>
                    {stylist.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {activeStylist ? (
            <>
              <form
                key={activeStylist.id}
                onSubmit={saveStylistSchedule}
                className="mt-4 space-y-2"
              >
                {days.map((day) => {
                  const schedule = (
                    activeStylist.availability as
                      | Record<string, Row>
                      | undefined
                  )?.[day];
                  const working =
                    schedule?.closed !== true &&
                    Boolean(schedule?.open && schedule?.close);
                  return (
                    <div
                      key={day}
                      className="grid grid-cols-[42px_22px_1fr_1fr] items-center gap-2 rounded-[8px] border border-plum/10 p-2 text-xs"
                    >
                      <b>{day}</b>
                      <input
                        type="checkbox"
                        name={`${day}_working`}
                        defaultChecked={working}
                        className="accent-magenta"
                      />
                      <input
                        aria-label={`${day} opening time`}
                        type="time"
                        name={`${day}_open`}
                        defaultValue={String(schedule?.open || "09:00")}
                        className="min-w-0 rounded-[6px] border border-plum/10 p-2"
                      />
                      <input
                        aria-label={`${day} closing time`}
                        type="time"
                        name={`${day}_close`}
                        defaultValue={String(schedule?.close || "17:00")}
                        className="min-w-0 rounded-[6px] border border-plum/10 p-2"
                      />
                    </div>
                  );
                })}
                <button className="min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white">
                  Save {activeStylist.name || "stylist"} schedule
                </button>
              </form>
            </>
          ) : (
            <div className="mt-4 rounded-[10px] border border-amber/30 bg-amber/10 p-5">
              <h3 className="font-serif text-lg text-plum">
                No stylists listed: the salon is the booking resource
              </h3>
              <p className="mt-2 text-xs leading-5 text-ink/65">
                This is supported intentionally. Every appointment blocks the
                entire salon for the service duration plus buffer. Use the
                salon-full controls above for walk-in overrides.
              </p>
            </div>
          )}
        </Panel> : null}
        {recordId === "overrides" ? <div className="grid gap-4 xl:grid-cols-2">
          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-xl text-plum">Stylist override</h2>
                <p className="mt-1 text-xs text-ink/55">
                  Temporarily hide one stylist without changing their regular weekly schedule.
                </p>
              </div>
              {c.stylists.length ? (
                <select
                  value={stylistId}
                  onChange={(event) => setStylistId(event.target.value)}
                  className="min-h-10 rounded-[8px] border border-plum/15 px-3 text-xs"
                >
                  {c.stylists.map((stylist) => (
                    <option key={stylist.id} value={stylist.id}>{stylist.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
            {activeStylist ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button disabled={Boolean(busy)} onClick={() => void block("stylist_three_hours", activeStylist.id)} className="min-h-11 rounded-[8px] bg-plum px-3 text-xs font-bold text-white gc-disabled-control">
                  Block next 3 hours
                </button>
                <button disabled={Boolean(busy)} onClick={() => void block("stylist_today", activeStylist.id)} className="min-h-11 rounded-[8px] bg-magenta px-3 text-xs font-bold text-white gc-disabled-control">
                  Unavailable today
                </button>
                <div className="flex">
                  <input type="time" value={until} onChange={(event) => setUntil(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-l-[8px] border border-plum/15 px-2" />
                  <button disabled={Boolean(busy)} onClick={() => void block("stylist_until", activeStylist.id)} className="rounded-r-[8px] border border-magenta px-3 text-[10px] font-bold text-magenta gc-disabled-control">
                    Until
                  </button>
                </div>
              </div>
            ) : <Empty text="Add a stylist before creating a stylist-specific override." />}
          </Panel>
          <Panel>
          <h2 className="font-serif text-xl text-plum">Current override</h2>
          <p className="mt-1 text-xs text-ink/55">
            Release an override at any time to reopen availability immediately.
          </p>
          <div className="mt-3 space-y-2">
            {activeBlockouts.map((blockout) => (
              <div
                key={blockout.id}
                className="rounded-[8px] border border-plum/10 p-3 text-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <span>
                    <Link href={`/salon/dashboard/availability/${blockout.id}`} className="font-bold text-plum underline-offset-2 hover:text-magenta hover:underline">{blockout.stylist_id ? stylistName(c, blockout.stylist_id) : "Whole salon"}</Link>
                    <span className="mt-1 block text-ink/55">
                      Until {dateText(blockout.ends_at, timeZone)}
                    </span>
                  </span>
                  <button
                    disabled={busy === `delete:${blockout.id}`}
                    onClick={() => void unblock(String(blockout.id))}
                    className="font-bold text-magenta"
                  >
                    {blockout.stylist_id ? "Resume stylist" : "Reopen today"}
                  </button>
                </div>
              </div>
            ))}
            {!activeBlockouts.length ? (
              <Empty text="No active availability blocks." />
            ) : null}
          </div>
          </Panel>
        </div> : null}
      </div>
      {calendarBooking ? <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/55 p-3 sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCalendarBooking(null); }}><section role="dialog" aria-modal="true" aria-labelledby="calendar-booking-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[16px] bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="calendar-booking-title" className="font-serif text-2xl text-plum">Appointment details</h2><p className="mt-1 text-[10px] text-ink/50">#{bookingReference(calendarBooking)}</p></div><button type="button" autoFocus aria-label="Close appointment details" onClick={() => setCalendarBooking(null)} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-plum/10 text-plum"><X size={18}/></button></div><div className="mt-5 space-y-4 text-sm"><p><b className="block text-[10px] uppercase tracking-wide gc-text-secondary">Customer</b>{String(calendarBooking.guest_name || "Customer")}</p><p><b className="block text-[10px] uppercase tracking-wide gc-text-secondary">Appointment</b>{dateText(calendarBooking.appointment_datetime, timeZone)}<br/>{styleName(c, calendarBooking.style_id)} · {stylistName(c, calendarBooking.stylist_id)}</p><p><b className="block text-[10px] uppercase tracking-wide gc-text-secondary">Status</b><Status value={String(calendarBooking.status || "Confirmed")}/></p><div className="grid grid-cols-2 gap-3 rounded-[10px] bg-cream p-3 text-xs"><p>Deposit paid<b className="mt-1 block gc-text-success">${Number(calendarBooking.deposit_amount || 0).toFixed(2)}</b></p><p>Balance due<b className="mt-1 block text-magenta">${Number(calendarBooking.balance_due || 0).toFixed(2)}</b></p></div><Link href={`/salon/dashboard/bookings/${encodeURIComponent(String(calendarBooking.id || ""))}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-[9px] bg-magenta text-xs font-bold text-white">Open booking</Link></div></section></div> : null}
    </>
  );
}

function CalendarBookingButton({ booking, c, timeZone }: { booking: Row; c: Ctx; timeZone: string; onOpen: (booking: Row) => void }) {
  return <Link href={`/salon/dashboard/availability/${booking.id}`} className="block w-full rounded-[8px] border border-magenta/25 bg-blush/70 p-2 text-left text-[9px] leading-4 transition hover:border-magenta focus-visible:outline-2 focus-visible:outline-magenta"><b className="block text-plum">{bookingTime(booking.appointment_datetime, timeZone)}</b><span className="font-semibold">{styleName(c, booking.style_id)}</span><span className="block text-ink/60">{stylistName(c, booking.stylist_id)}</span></Link>;
}

const BOOKING_GROUPS = ["Upcoming", "In Progress", "Needs Resolution", "All"] as const;
type BookingGroup = (typeof BOOKING_GROUPS)[number];

function normalizedBookingStatus(booking: Row) {
  return String(booking.status || "").trim().toLowerCase().replaceAll("_", " ");
}

function bookingNeedsResolution(booking: Row, now: number) {
  const operationalState = [
    normalizedBookingStatus(booking),
    String(booking.reschedule_status || ""),
    String(booking.refund_status || ""),
    String(booking.payment_status || ""),
  ].join(" ").toLowerCase().replaceAll("_", " ");
  if (/requested|pending|needs? (review|attention)|resolution|failed|disput|chargeback|on hold/.test(operationalState)) {
    return true;
  }
  const appointmentTime = new Date(String(booking.appointment_datetime || "")).getTime();
  const terminal = /completed|cancelled|canceled|declined|refunded|no show/.test(normalizedBookingStatus(booking));
  return !terminal && Number.isFinite(appointmentTime) && appointmentTime < now && !/ready|checked in|in progress|started/.test(normalizedBookingStatus(booking));
}

function bookingMatchesGroup(booking: Row, group: BookingGroup, now: number) {
  if (group === "All") return true;
  const status = normalizedBookingStatus(booking);
  if (group === "In Progress") return /ready|checked in|in progress|started/.test(status);
  if (group === "Needs Resolution") return bookingNeedsResolution(booking, now);
  const appointmentTime = new Date(String(booking.appointment_datetime || "")).getTime();
  const active = !/completed|cancelled|canceled|declined|refunded|no show/.test(status);
  return active && !bookingNeedsResolution(booking, now) && !/ready|checked in|in progress|started/.test(status) && (!Number.isFinite(appointmentTime) || appointmentTime >= now);
}

function Bookings({ c, recordId = "" }: { c: Ctx; recordId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedGroup = searchParams.get("group");
  const group: BookingGroup = BOOKING_GROUPS.includes(requestedGroup as BookingGroup)
    ? requestedGroup as BookingGroup
    : searchParams.has("status")
      ? "All"
      : "Upcoming";
  const filter = searchParams.get("status") || "All";
  const query = (searchParams.get("q") || "").trim();
  const [renderedAt] = useState(() => Date.now());
  const [selectedId] = useState(recordId || c.initialBookingId || "");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [customerReason, setCustomerReason] = useState(
    "Appointment availability changed",
  );
  const [customerMessage, setCustomerMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleMessage, setRescheduleMessage] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<Row[]>([]);
  const [selectedRescheduleSlots, setSelectedRescheduleSlots] = useState<
    string[]
  >([]);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [proposalSummary, setProposalSummary] = useState<Row | null>(null);
  const [confirmCompletion, setConfirmCompletion] = useState(false);
  const [checkInException, setCheckInException] =
    useState<CheckInExceptionRequirement | null>(null);
  function contextQuery(next: { group?: BookingGroup; status?: string; query?: string } = {}) {
    const nextGroup = next.group ?? group;
    const nextStatus = next.status ?? filter;
    const nextQuery = next.query ?? query;
    const params = new URLSearchParams();
    if (nextGroup !== "Upcoming") params.set("group", nextGroup);
    if (nextStatus !== "All") params.set("status", nextStatus);
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    const value = params.toString();
    return value ? `?${value}` : "";
  }
  const visible = c.bookings.filter((booking) => {
    if (!bookingMatchesGroup(booking, group, renderedAt)) return false;
    if (filter !== "All" && normalizedBookingStatus(booking) !== filter.toLowerCase().replaceAll("_", " ")) return false;
    if (!query) return true;
    const haystack = [
      booking.guest_name,
      booking.guest_email,
      booking.guest_phone,
      bookingReference(booking),
      styleName(c, booking.style_id),
      stylistName(c, booking.stylist_id),
      booking.status,
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    return haystack.includes(query.toLowerCase());
  });
  const groupCounts = Object.fromEntries(
    BOOKING_GROUPS.map((item) => [
      item,
      c.bookings.filter((booking) => bookingMatchesGroup(booking, item, renderedAt)).length,
    ]),
  ) as Record<BookingGroup, number>;
  const statusOptions = [
    "All",
    ...Array.from(
      new Set(
        c.bookings
          .map((booking) => String(booking.status || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
  ];
  const bookingListHref = `/salon/dashboard/bookings${contextQuery()}`;
  const bookingDetailHref = (id: unknown) =>
    `/salon/dashboard/bookings/${encodeURIComponent(String(id || ""))}${contextQuery()}`;
  const selected =
    c.bookings.find((booking) => booking.id === selectedId) || null;
  const activeSelected =
    selected &&
    !/cancelled|completed|refunded/i.test(String(selected.status || ""));
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    getSessionForScope("salon")
      .then((session) =>
        session
          ? fetch(`/api/salon/bookings/${selectedId}/reschedule`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
              cache: "no-store",
            })
          : null,
      )
      .then(async (response) => {
        if (!response?.ok) return null;
        return (await response.json()) as { proposals?: Row[] };
      })
      .then((body) => {
        if (active) setProposalSummary(body?.proposals?.[0] || null);
      })
      .catch(() => {
        if (active) setProposalSummary(null);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!selectedId || !rescheduleDate) {
        setRescheduleSlots([]);
        setSelectedRescheduleSlots([]);
        setAvailabilityMessage("");
        return;
      }
      setLoadingAvailability(true);
      setAvailabilityMessage("");
      getSessionForScope("salon")
        .then((session) =>
          session
            ? fetch(
                `/api/salon/bookings/${selectedId}/reschedule?date=${encodeURIComponent(rescheduleDate)}`,
                {
                  headers: {
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  cache: "no-store",
                },
              )
            : null,
        )
        .then(async (response) => {
          if (!response) throw new Error("Please sign in again.");
          const body = (await response.json()) as {
            error?: string;
            reason?: string;
            slots?: Row[];
          };
          if (!response.ok) {
            throw new Error(body.error || "Unable to load available times.");
          }
          return body;
        })
        .then((body) => {
          if (!active) return;
          setRescheduleSlots(body.slots || []);
          setSelectedRescheduleSlots([]);
          setAvailabilityMessage(
            body.slots?.length
              ? ""
              : body.reason || "No open times remain for this day.",
          );
        })
        .catch((error) => {
          if (!active) return;
          setRescheduleSlots([]);
          setSelectedRescheduleSlots([]);
          setAvailabilityMessage(
            error instanceof Error
              ? error.message
              : "Unable to load available times.",
          );
        })
        .finally(() => {
          if (active) setLoadingAvailability(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [rescheduleDate, selectedId]);
  async function serviceAction(
    action: "check_in" | "start" | "complete",
    exception?: CheckInExceptionAnswer,
  ) {
    if (!selected?.id) return;
    setBusy(true);
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(
        `/api/salon/bookings/${selected.id}/service`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action,
            confirmed: action === "complete" ? confirmCompletion : undefined,
            reason_code: exception?.reason_code,
            reason_detail: exception?.reason_detail,
            attested: exception?.attested,
          }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        code?: string;
        booking?: Row;
        requires_exception?: boolean;
        exception_kind?: "early" | "late";
        scheduled_at?: string;
        attempted_at?: string;
        offset_minutes?: number;
        standard_window?: { opens_at: string; closes_at: string };
        reasons?: Array<{ value: string; label: string }>;
      };
      if (response.status === 428 && body.requires_exception) {
        if (
          !body.exception_kind ||
          !body.scheduled_at ||
          !body.attempted_at ||
          !body.standard_window ||
          !Array.isArray(body.reasons)
        ) {
          throw new Error("The check-in reason workflow could not be loaded.");
        }
        setCheckInException({
          exception_kind: body.exception_kind,
          scheduled_at: body.scheduled_at,
          attempted_at: body.attempted_at,
          offset_minutes: Number(body.offset_minutes || 0),
          standard_window: body.standard_window,
          reasons: body.reasons,
        });
        c.setNotice(body.error || "Choose the reason for this check-in.");
        return;
      }
      if (!response.ok || !body.booking) {
        throw new Error(
          body.error || "The service status could not be updated.",
        );
      }
      c.setBookings((rows) =>
        rows.map((booking) =>
          booking.id === selected.id ? (body.booking as Row) : booking,
        ),
      );
      setCheckInException(null);
      setConfirmCompletion(false);
      c.setNotice(
        action === "check_in"
          ? "Customer checked in. The appointment is ready to begin."
          : action === "start"
            ? "Service start recorded for on-time performance."
            : "Service completed. Verified review eligibility is now enabled.",
      );
    } catch (error) {
      c.setNotice(
        error instanceof Error
          ? error.message
          : "The service status could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancelBooking() {
    if (!selected?.id || !reason) {
      c.setNotice("Choose a cancellation reason.");
      return;
    }
    if (reason === "Other" && !detail.trim()) {
      c.setNotice("Add a short explanation for Other.");
      return;
    }
    setBusy(true);
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(
        `/api/salon/bookings/${selected.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            internal_reason: reason,
            internal_detail: detail,
            customer_reason: customerReason,
            customer_message: customerMessage,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to cancel this booking.");
      c.setBookings((rows) =>
        rows.map((booking) =>
          booking.id === selected.id ? (body.booking as Row) : booking,
        ),
      );
      c.setNotice(
        body.refund_status === "Succeeded"
          ? "Booking cancelled, customer notified, and deposit refunded in full."
          : body.refund_status === "Pending"
            ? "Booking cancelled and customer notified. Stripe accepted the refund request; completion is pending."
            : "Booking cancelled and customer notified.",
      );
      setReason("");
      setDetail("");
      setCustomerReason("Appointment availability changed");
      setCustomerMessage("");
    } catch (error) {
      c.setNotice(
        error instanceof Error
          ? error.message
          : "Unable to cancel this booking.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function proposeReschedule() {
    if (!selected?.id || !rescheduleReason.trim()) {
      c.setNotice("Add a reason for the reschedule proposal.");
      return;
    }
    const options = selectedRescheduleSlots.map((key) => {
      const [local, stylistId = ""] = key.split("|");
      return { local, stylistId: stylistId || null };
    });
    if (!options.length) {
      c.setNotice("Choose at least one proposed appointment time.");
      return;
    }
    setBusy(true);
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Please sign in again.");
      const response = await fetch(
        `/api/salon/bookings/${selected.id}/reschedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            reason: rescheduleReason,
            message: rescheduleMessage,
            options,
          }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        proposal?: Row;
        warnings?: Array<{ message?: string }>;
      };
      if (!response.ok) {
        throw new Error(
          body.error || "Unable to propose new appointment times.",
        );
      }
      setProposalSummary(body.proposal || null);
      setRescheduleReason("");
      setRescheduleMessage("");
      setRescheduleDate("");
      setRescheduleSlots([]);
      setSelectedRescheduleSlots([]);
      c.setNotice(
        body.warnings?.[0]?.message ||
          "Proposal sent. The appointment remains unchanged until the customer accepts.",
      );
    } catch (error) {
      c.setNotice(
        error instanceof Error
          ? error.message
          : "Unable to propose new appointment times.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!recordId ? <Title
        title="Bookings & Appointments"
        subtitle="Available slots confirm instantly. Keep availability current and cancel only when necessary."
      /> : <OwnerDetailHeader
        title={selected ? `Booking for ${String(selected.guest_name || "customer")}` : "Booking details"}
        subtitle={selected ? `Reference #${bookingReference(selected)}` : "This booking could not be found."}
        fallbackHref={bookingListHref}
        status={selected ? String(selected.status || "Confirmed") : "Unavailable"}
      />}
      {!recordId ? <Panel className="mb-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            router.replace(`/salon/dashboard/bookings${contextQuery({ query: String(form.get("booking_search") || "") })}`, { scroll: false });
          }}
          className="flex flex-col gap-2 sm:flex-row"
          role="search"
        >
          <label className="flex-1 text-[10px] font-bold uppercase tracking-wide text-ink/55">
            Search bookings
            <input
              key={query}
              name="booking_search"
              type="search"
              defaultValue={query}
              placeholder="Customer, reference, style, stylist, or status"
              className="mt-1 min-h-11 w-full rounded-[8px] border border-plum/15 bg-white px-3 text-xs font-normal normal-case tracking-normal"
            />
          </label>
          <button className="min-h-11 self-end rounded-[8px] bg-magenta px-5 text-xs font-bold text-white">
            Search
          </button>
          {query || filter !== "All" || group !== "Upcoming" ? (
            <button
              type="button"
              onClick={() => {
                router.replace("/salon/dashboard/bookings", { scroll: false });
              }}
              className="min-h-11 self-end rounded-[8px] border border-plum/15 px-4 text-xs font-bold text-plum"
            >
              Clear
            </button>
          ) : null}
        </form>
        <div role="group" className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Booking workflow groups">
          {BOOKING_GROUPS.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={group === item}
              onClick={() => router.replace(`/salon/dashboard/bookings${contextQuery({ group: item, status: "All" })}`, { scroll: false })}
              className={`min-h-10 shrink-0 rounded-[8px] px-4 text-xs font-semibold ${group === item ? "bg-plum text-white" : "border border-plum/10 bg-white text-plum"}`}
            >
              {item} <span className={`ml-1 ${group === item ? "gc-text-on-dark-muted" : "gc-text-secondary"}`}>{groupCounts[item]}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] leading-4 text-ink/50">
            Upcoming is future confirmed work. In Progress tracks active services. Needs Resolution collects requests, failures, disputes, and overdue active bookings.
          </p>
          <label className="shrink-0 text-[10px] font-bold text-ink/55">
            Exact status
            <select
              value={filter}
              onChange={(event) => {
                const status = event.target.value;
                router.replace(`/salon/dashboard/bookings${contextQuery({ group: status === "All" ? group : "All", status })}`, { scroll: false });
              }}
              className="ml-2 min-h-10 rounded-[8px] border border-plum/15 bg-white px-3 text-xs text-ink"
            >
              {statusOptions.map((item) => <option key={item} value={item}>{item === "All" ? "All statuses" : item}</option>)}
            </select>
          </label>
        </div>
      </Panel> : null}
      <div className={recordId ? "block" : "grid gap-4"}>
        {!recordId ? <Panel className="overflow-x-auto">
          <div className="space-y-3 lg:hidden">
            {visible.map((booking) => (
              <button
                key={booking.id}
                onClick={() => router.push(bookingDetailHref(booking.id))}
                className={`w-full rounded-[10px] border p-4 text-left ${selectedId === booking.id ? "border-magenta bg-blush/25" : "border-plum/10"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span>
                    <b className="font-serif text-lg text-plum">
                      {String(booking.guest_name || "Customer")}
                    </b>
                    <span className="mt-1 block text-xs">
                      {styleName(c, booking.style_id)} ·{" "}
                      {stylistName(c, booking.stylist_id)}
                    </span>
                  </span>
                  <Status value={String(booking.status || "Confirmed")} />
                </div>
                <p className="mt-3 text-xs font-semibold">
                  {dateText(booking.appointment_datetime, c.salon.time_zone)}
                </p>
                <div className="mt-3 flex justify-between text-xs">
                  <span>
                    Deposit{" "}
                    <b className="gc-text-success">
                      ${Number(booking.deposit_amount || 0).toFixed(2)}
                    </b>
                  </span>
                  <span>
                    Balance{" "}
                    <b className="text-magenta">
                      ${Number(booking.balance_due || 0).toFixed(2)}
                    </b>
                  </span>
                </div>
              </button>
            ))}
            {!visible.length ? (
              <Empty text={`No bookings match ${group}${query ? ` and “${query}”` : ""}${filter !== "All" ? ` with status ${filter}` : ""}.`} />
            ) : null}
          </div>
          <table className="hidden w-full min-w-[850px] text-left text-xs lg:table">
            <thead>
              <tr className="border-b border-plum/10 text-[9px] uppercase tracking-wider">
                {[
                  "Customer",
                  "Style",
                  "Stylist",
                  "Date / Time",
                  "Deposit",
                  "Balance",
                  "Status",
                  "Actions",
                ].map((heading) => (
                  <th key={heading} className="px-3 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((booking) => (
                <tr
                  key={booking.id}
                  className={`border-b border-plum/10 ${selectedId === booking.id ? "bg-blush/25" : ""}`}
                >
                  <td className="px-3 py-3">
                    {String(booking.guest_name || "Customer")}
                  </td>
                  <td className="px-3">{styleName(c, booking.style_id)}</td>
                  <td className="px-3">{stylistName(c, booking.stylist_id)}</td>
                  <td className="px-3">
                    {dateText(booking.appointment_datetime, c.salon.time_zone)}
                  </td>
                  <td className="px-3 gc-text-success">
                    ${Number(booking.deposit_amount || 0).toFixed(2)}
                  </td>
                  <td className="px-3 text-magenta">
                    ${Number(booking.balance_due || 0).toFixed(2)}
                  </td>
                  <td className="px-3">
                    <Status value={String(booking.status || "Confirmed")} />
                  </td>
                  <td className="px-3">
                    <button
                      onClick={() => router.push(bookingDetailHref(booking.id))}
                      className="font-bold text-magenta"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length ? (
            <div className="hidden lg:block">
              <Empty text={`No bookings match ${group}${query ? ` and “${query}”` : ""}${filter !== "All" ? ` with status ${filter}` : ""}.`} />
            </div>
          ) : null}
        </Panel> : null}
        {recordId ? <Panel>
          {selected ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl text-plum">
                    Booking Details
                  </h2>
                  <p className="mt-1 text-xs text-ink/50">
                    #
                    {bookingReference(selected)}
                  </p>
                </div>
                <Status value={String(selected.status || "Confirmed")} />
              </div>
              <div className="mt-5 space-y-3 text-xs">
                <p>
                  <b className="block text-ink/50">Customer</b>
                  {String(selected.guest_name || "Customer")}
                  <br />
                  {String(selected.guest_phone || "")}
                  <br />
                  {String(selected.guest_email || "")}
                </p>
                <p>
                  <b className="block text-ink/50">Appointment</b>
                  {dateText(selected.appointment_datetime, c.salon.time_zone)}
                  <br />
                  {styleName(c, selected.style_id)} ·{" "}
                  {stylistName(c, selected.stylist_id)}
                  <br />
                  {Number(selected.duration_hours || 0)} hours
                </p>
                <p className="flex justify-between">
                  <span>Deposit paid</span>
                  <b className="gc-text-success">
                    ${Number(selected.deposit_amount || 0).toFixed(2)}
                  </b>
                </p>
                <p className="flex justify-between">
                  <span>Remaining balance</span>
                  <b className="text-magenta">
                    ${Number(selected.balance_due || 0).toFixed(2)}
                  </b>
                </p>
              </div>
              {activeSelected ? (
                <>
                  <div className="mt-5 rounded-[10px] border border-plum/10 bg-cream/50 p-3">
                    <h3 className="font-serif text-lg text-plum">
                      Service progress
                    </h3>
                    <p className="mt-1 text-[10px] leading-4 text-ink/55">
                      Confirmed → Checked in / Ready → In progress → Completed
                    </p>
                    {String(selected.status).toLowerCase() === "confirmed" ? (
                      <>
                        {!checkInException ? (
                          <button
                            disabled={busy}
                            onClick={() => void serviceAction("check_in")}
                            className="mt-3 min-h-11 w-full rounded-[8px] bg-plum text-xs font-bold text-white gc-disabled-control"
                          >
                            Check in customer
                          </button>
                        ) : null}
                        {checkInException ? (
                          <BookingCheckInExceptionForm
                            requirement={checkInException}
                            timeZone={String(
                              c.salon.time_zone || "America/New_York",
                            )}
                            busy={busy}
                            onCancel={() => setCheckInException(null)}
                            onSubmit={(answer) =>
                              serviceAction("check_in", answer)
                            }
                          />
                        ) : null}
                      </>
                    ) : null}
                    {String(selected.status).toLowerCase() === "ready" ? (
                      <button
                        disabled={busy}
                        onClick={() => void serviceAction("start")}
                        className="mt-3 min-h-11 w-full rounded-[8px] bg-plum text-xs font-bold text-white gc-disabled-control"
                      >
                        Start service
                      </button>
                    ) : null}
                    {String(selected.status).toLowerCase() ===
                    "in progress" ? (
                      <>
                        <label className="mt-3 flex items-start gap-2 rounded-[8px] bg-white p-3 text-[10px] leading-4">
                          <input
                            type="checkbox"
                            checked={confirmCompletion}
                            onChange={(event) =>
                              setConfirmCompletion(event.target.checked)
                            }
                            className="mt-0.5 h-4 w-4 accent-magenta"
                          />
                          I confirm that this service has been completed. This
                          records the completion time and enables verified
                          review eligibility.
                        </label>
                        <button
                          disabled={busy || !confirmCompletion}
                          onClick={() => void serviceAction("complete")}
                          className="mt-2 min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white gc-disabled-control"
                        >
                          Complete service
                        </button>
                      </>
                    ) : null}
                    {selected.checked_in_at ? (
                      <p className="mt-2 text-[10px] text-ink/55">
                        Checked in{" "}
                        {dateText(
                          selected.checked_in_at,
                          c.salon.time_zone,
                        )}
                      </p>
                    ) : null}
                    {selected.service_started_at ? (
                      <p className="mt-1 text-[10px] text-ink/55">
                        Service started{" "}
                        {dateText(
                          selected.service_started_at,
                          c.salon.time_zone,
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-6 border-t border-plum/10 pt-5">
                    <h3 className="font-serif text-lg text-plum">
                      Propose reschedule
                    </h3>
                    <p className="mt-1 text-[10px] leading-4 text-ink/55">
                      Pick a date, then offer a preferred available
                      time/stylist and up to two alternatives. The current
                      appointment stays confirmed until the customer accepts.
                    </p>
                    {proposalSummary ? (
                      <div className="mt-3 rounded-[9px] bg-blush/35 p-3 text-xs">
                        <b>
                          Latest proposal:{" "}
                          {String(proposalSummary.status || "Pending")}
                        </b>
                        <p className="mt-1 text-ink/60">
                          {String(proposalSummary.reason || "")}
                        </p>
                      </div>
                    ) : null}
                    <input
                      value={rescheduleReason}
                      onChange={(event) =>
                        setRescheduleReason(event.target.value.slice(0, 300))
                      }
                      placeholder="Reason for proposing a change"
                      className="mt-3 min-h-11 w-full rounded-[8px] border border-plum/15 px-3 text-xs"
                    />
                    <textarea
                      value={rescheduleMessage}
                      onChange={(event) =>
                        setRescheduleMessage(event.target.value.slice(0, 600))
                      }
                      placeholder="Optional message to the customer"
                      rows={2}
                      className="mt-2 w-full rounded-[8px] border border-plum/15 p-3 text-xs"
                    />
                    <label className="mt-3 block text-[10px] font-bold text-ink/60">
                      Date to search
                      <input
                        type="date"
                        value={rescheduleDate}
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(event) =>
                          setRescheduleDate(event.target.value)
                        }
                        className="mt-1 min-h-11 w-full rounded-[8px] border border-plum/15 px-3 text-xs"
                      />
                    </label>
                    {loadingAvailability ? (
                      <p className="mt-3 rounded-[8px] bg-cream p-3 text-xs text-ink/60">
                        Checking live availability…
                      </p>
                    ) : null}
                    {availabilityMessage ? (
                      <p className="mt-3 rounded-[8px] bg-blush/35 p-3 text-xs text-plum">
                        {availabilityMessage}
                      </p>
                    ) : null}
                    {rescheduleSlots.length ? (
                      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1">
                        {rescheduleSlots.map((slot) => {
                          const local = `${rescheduleDate}T${String(slot.value)}`;
                          const key = `${local}|${String(slot.stylistId || "")}`;
                          const selectedIndex =
                            selectedRescheduleSlots.indexOf(key);
                          return (
                            <label
                              key={key}
                              className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[8px] border px-3 text-xs ${
                                selectedIndex >= 0
                                  ? "border-magenta bg-blush/35"
                                  : "border-plum/10 bg-white"
                              }`}
                            >
                              <span>
                                <b>{String(slot.label)}</b>
                                <span className="ml-2 text-ink/55">
                                  {String(
                                    slot.stylistName ||
                                      "Any available stylist",
                                  )}
                                </span>
                                {selectedIndex >= 0 ? (
                                  <small className="mt-0.5 block text-magenta">
                                    {selectedIndex === 0
                                      ? "Preferred"
                                      : `Alternative ${selectedIndex}`}
                                  </small>
                                ) : null}
                              </span>
                              <input
                                type="checkbox"
                                checked={selectedIndex >= 0}
                                disabled={
                                  selectedIndex < 0 &&
                                  selectedRescheduleSlots.length >= 3
                                }
                                onChange={(event) =>
                                  setSelectedRescheduleSlots((current) =>
                                    event.target.checked
                                      ? [...current, key].slice(0, 3)
                                      : current.filter(
                                          (candidate) => candidate !== key,
                                        ),
                                  )
                                }
                                className="h-4 w-4 accent-magenta"
                              />
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                    <button
                      disabled={
                        busy ||
                        !rescheduleReason.trim() ||
                        !selectedRescheduleSlots.length
                      }
                      onClick={() => void proposeReschedule()}
                      className="mt-3 min-h-11 w-full rounded-[8px] bg-plum text-xs font-bold text-white gc-disabled-control"
                    >
                      {busy
                        ? "Checking availability…"
                        : "Send proposal for customer approval"}
                    </button>
                  </div>
                  <div className="mt-6 border-t border-plum/10 pt-5">
                    <h3 className="font-serif text-lg text-plum">
                      Cancel booking
                    </h3>
                    <p className="mt-1 text-[10px] leading-4 text-ink/55">
                      This refunds the deposit, releases the slot, notifies the
                      customer, and affects your cancellation rate.
                    </p>
                    <select
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-3 min-h-11 w-full rounded-[8px] border border-plum/15 px-3 text-xs"
                    >
                      <option value="">Choose required reason</option>
                      {c.cancellationReasons.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-ink/55">
                      Customer-safe reason
                    </p>
                    <select
                      value={customerReason}
                      onChange={(event) =>
                        setCustomerReason(event.target.value)
                      }
                      className="mt-1 min-h-11 w-full rounded-[8px] border border-plum/15 px-3 text-xs"
                    >
                      {c.customerCancellationReasons.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                    <textarea
                      value={customerMessage}
                      onChange={(event) =>
                        setCustomerMessage(event.target.value.slice(0, 500))
                      }
                      placeholder="Optional customer message"
                      rows={2}
                      className="mt-2 w-full rounded-[8px] border border-plum/15 p-3 text-xs"
                    />
                    {reason === "Other" ? (
                      <textarea
                        value={detail}
                        onChange={(event) =>
                          setDetail(event.target.value.slice(0, 300))
                        }
                        placeholder="Brief explanation"
                        rows={3}
                        className="mt-2 w-full rounded-[8px] border border-plum/15 p-3 text-xs"
                      />
                    ) : null}
                    <button
                      disabled={busy || !reason}
                      onClick={() => void cancelBooking()}
                      className="mt-3 min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white gc-disabled-control"
                    >
                      {busy
                        ? "Cancelling and refunding…"
                        : "Cancel and refund deposit"}
                    </button>
                  </div>
                </>
              ) : selected.cancellation_reason ? (
                <div className="mt-5 rounded-[9px] bg-blush/30 p-3 text-xs">
                  <b>Cancelled by</b>
                  <p className="mt-1 capitalize">
                    {String(
                      selected.cancelled_by ||
                        selected.cancellation_initiated_by ||
                        "Not recorded",
                    )}
                  </p>
                  <b className="mt-3 block">Customer-safe reason</b>
                  <p className="mt-1">
                    {String(
                      selected.cancellation_customer_reason ||
                        selected.cancellation_reason,
                    )}
                  </p>
                  <p className="mt-1 text-ink/55">
                    Refund: {String(selected.refund_status || "Not recorded")}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <Empty text="Open a booking to see details and actions." />
          )}
        </Panel> : null}
      </div>
    </>
  );
}

function Reviews({ c, recordId = "" }: { c: Ctx; recordId?: string }) {
  const searchParams = useSearchParams();
  const [reviewQuery, setReviewQuery] = useState(searchParams.get("q") || "");
  const [reviewView, setReviewView] = useState(searchParams.get("view") || "recent");
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSaving, setDisputeSaving] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const count = c.reviews.length;
  const rating = count
    ? c.reviews.reduce(
        (sum, review) => sum + Number(review.rating_overall || 0),
        0,
      ) / count
    : 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: c.reviews.filter(
      (review) => Math.round(Number(review.rating_overall || 0)) === star,
    ).length,
  }));
  const reviewState = (review: Row) => {
    const moderation = String(review.moderation_status || "Published");
    const dispute = String(review.dispute_status || "None");
    if (moderation === "Hidden" || dispute === "Removed") return "removed";
    if (moderation === "Under review" || dispute === "Disputed") return "disputed";
    if (String(review.salon_reply || "").trim()) return "replied";
    return "awaiting";
  };
  const stateCounts: Record<string, number> = {
    recent: c.reviews.filter((review) => reviewState(review) !== "removed").length,
    awaiting: c.reviews.filter((review) => reviewState(review) === "awaiting").length,
    replied: c.reviews.filter((review) => reviewState(review) === "replied").length,
    disputed: c.reviews.filter((review) => reviewState(review) === "disputed").length,
    removed: c.reviews.filter((review) => reviewState(review) === "removed").length,
  };
  const filteredReviews = c.reviews.filter((review) => {
    const needle = reviewQuery.trim().toLowerCase();
    const matchesQuery =
      !needle ||
      [review.display_name, review.review_title, review.written_review, review.booking_id]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    const state = reviewState(review);
    return matchesQuery && (reviewView === "all" || (reviewView === "recent" ? state !== "removed" : state === reviewView));
  });
  const reviewParams = new URLSearchParams({
    ...(reviewQuery ? { q: reviewQuery } : {}),
    ...(reviewView !== "recent" ? { view: reviewView } : {}),
  });
  const reviewListHref = `/salon/dashboard/reviews${reviewParams.size ? `?${reviewParams}` : ""}`;
  const reviewHref = (id: unknown) => `/salon/dashboard/reviews/${encodeURIComponent(String(id))}${reviewParams.size ? `?${reviewParams}` : ""}`;
  const selectedReview = c.reviews.find((review) => review.id === recordId) || null;
  const displayedReviews = recordId ? (selectedReview ? [selectedReview] : []) : filteredReviews;
  async function saveReply(review: Row) {
    if (!review.id || !replyText.trim()) {
      c.setNotice("Write a reply before saving.");
      return;
    }
    setReplySaving(true);
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Your salon session expired. Please sign in again.");
      const response = await fetch(`/api/salon/reviews/${review.id}/reply`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ reply: replyText.trim() }) });
      const body = await readApiResponse(response, "The review reply could not be saved.") as { error?: string; message?: string; review?: Row };
      if (!response.ok || body.error) throw new Error(body.error || "The review reply could not be saved.");
      c.setReviews((current) => current.map((item) => item.id === review.id ? { ...item, ...(body.review || {}), salon_reply: replyText.trim() } : item));
      setReplyText("");
      c.setNotice(body.message || "Your salon reply was saved.");
    } catch (error) {
      c.setNotice(error instanceof Error ? error.message : "The review reply could not be saved.");
    } finally {
      setReplySaving(false);
    }
  }
  return (
    <>
      {!recordId ? <Title
        title="Reviews"
        subtitle="See what clients are saying about your salon."
      /> : <OwnerDetailHeader
        title="Review details"
        subtitle={selectedReview ? `Received ${dateText(selectedReview.created_at)}` : "This review could not be found."}
        fallbackHref={reviewListHref}
        status={selectedReview ? reviewState(selectedReview).replace(/^./, (letter) => letter.toUpperCase()) : "Unavailable"}
      />}
      <div className={recordId ? "block" : "grid gap-4 xl:grid-cols-[1.35fr_.65fr]"}>
        <div>
          {!recordId ? <Panel>
            <div className="grid gap-4 sm:grid-cols-[.6fr_.6fr_1.2fr]">
              <div>
                <p className="text-xs font-semibold">Overall Rating</p>
                <p className="mt-2 font-serif text-5xl">
                  {count ? rating.toFixed(1) : "New"}
                </p>
                {count ? <Stars value={rating} /> : null}
              </div>
              <div>
                <p className="text-xs font-semibold">Total Reviews</p>
                <p className="mt-2 font-serif text-5xl">{count}</p>
              </div>
              <div className="space-y-2">
                {distribution.map((item) => {
                  const percent = count
                    ? Math.round((item.count / count) * 100)
                    : 0;
                  return (
                    <div
                      key={item.star}
                      className="grid grid-cols-[25px_1fr_45px] items-center gap-2 text-[10px]"
                    >
                      <span>{item.star}</span>
                      <span className="h-1.5 rounded-full bg-blush">
                        <span
                          className="block h-full rounded-full bg-magenta"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span>{percent}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel> : null}
          {!recordId ? <div className="mb-3 mt-5 space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="font-serif text-xl text-plum">Review inbox</h2><p className="mt-1 text-xs text-ink/55">Customer words are immutable. Reply, dispute, and review Platform Admin decisions from a focused record.</p></div>
              <input aria-label="Search reviews" value={reviewQuery} onChange={(event)=>setReviewQuery(event.target.value)} placeholder="Search review or booking" className="min-h-10 rounded-lg border border-plum/15 px-3 text-xs"/>
            </div>
            <div role="group" className="flex gap-2 overflow-x-auto pb-1" aria-label="Review status filters">
              {([[
                "recent", "Recent",
              ], ["awaiting", "Awaiting reply"], ["replied", "Replied"], ["disputed", "Disputed"], ["removed", "Removed by Platform Admin"], ["all", "All"]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={()=>setReviewView(value)} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold ${reviewView===value ? "border-magenta bg-magenta text-white" : "border-plum/15 bg-white text-plum"}`}>
                  {label} ({value === "all" ? count : stateCounts[value]})
                </button>
              ))}
            </div>
          </div> : null}
          <div className="space-y-3">
            {displayedReviews.map((review, index) => (
              <Panel key={review.id || index}>
                <div className="flex justify-between">
                  <div>
                    <b>{String(review.display_name || "Verified Client")}</b>
                    <span className="ml-2 rounded-full bg-blush px-2 py-1 text-[8px] text-magenta">
                      Verified
                    </span>
                    <Stars value={Number(review.rating_overall || 0)} />
                    <span className="mt-1 inline-flex rounded-full bg-cream px-2 py-1 text-[9px] font-bold text-plum">
                      {reviewState(review) === "removed" ? "Removed by Platform Admin" : reviewState(review) === "disputed" ? "Under review" : reviewState(review) === "replied" ? "Replied" : "Awaiting reply"}
                    </span>
                  </div>
                  <span className="text-[10px] text-ink/50">
                    {dateText(review.created_at)}
                  </span>
                </div>
                {review.written_review ? (
                  <p className="mt-3 text-sm">
                    {String(review.written_review)}
                  </p>
                ) : null}
                {!recordId ? <Link href={reviewHref(review.id)} className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-magenta px-4 text-xs font-bold text-magenta">Open review</Link> : null}
                {recordId && reviewState(review) !== "removed" ? <div className="mt-4 flex gap-4 text-xs font-semibold text-magenta">
                  <span>{review.salon_reply ? "Reply saved" : "Reply available"}</span>
                  <button
                    onClick={() => {
                      setDisputeId(String(review.id || ""));
                      setDisputeReason("");
                    }}
                  >
                    Flag / Dispute
                  </button>
                </div> : null}
                {recordId ? (review.salon_reply ? <div className="mt-4 rounded-lg bg-blush/25 p-4 text-sm"><b className="text-plum">Salon reply</b><p className="mt-2 leading-6 text-ink/70">{String(review.salon_reply)}</p></div> : reviewState(review) === "removed" ? <div className="mt-4 rounded-lg border border-plum/10 bg-cream p-4 text-xs text-ink/65">This review was removed by Platform Admin. It remains in your audit history, but cannot receive a public salon reply.</div> : <div className="mt-4 rounded-lg border border-plum/10 p-4"><label className="block text-xs font-bold text-plum">Reply as the salon<textarea value={replyText} onChange={(event)=>setReplyText(event.target.value.slice(0,2000))} rows={4} className="mt-2 w-full rounded-lg border border-plum/15 p-3 font-normal text-ink" placeholder="Thank the customer or address their experience professionally."/></label><button type="button" disabled={replySaving || !replyText.trim()} onClick={()=>void saveReply(review)} className="mt-3 min-h-11 rounded-lg bg-magenta px-5 text-xs font-bold text-white gc-disabled-control">{replySaving ? "Saving reply…" : "Save reply"}</button></div>) : null}
                {recordId ? <div className="mt-4 grid gap-3 rounded-xl border border-plum/10 bg-cream/55 p-4 text-xs sm:grid-cols-2"><div><b className="text-plum">Moderation status</b><p className="mt-1 text-ink/65">{String(review.moderation_status || "Published")}</p></div><div><b className="text-plum">Dispute status</b><p className="mt-1 text-ink/65">{String(review.dispute_status || "None")}</p></div>{review.moderation_reason ? <div className="sm:col-span-2"><b className="text-plum">Platform decision</b><p className="mt-1 leading-5 text-ink/65">{String(review.moderation_reason)}</p></div> : null}</div> : null}
                {recordId ? <div className="mt-4 rounded-xl border border-plum/10 p-4"><b className="text-plum">Audit history</b><div className="mt-3 space-y-2">{([...(Array.isArray(review.moderation_events) ? review.moderation_events as Row[] : []), ...(Array.isArray(review.dispute_events) ? review.dispute_events as Row[] : [])]).sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||""))).map((event)=><div key={String(event.id)} className="rounded-lg bg-cream px-3 py-2 text-xs"><span className="font-semibold">{String(event.action || "Updated")}</span><span className="ml-2 text-ink/50">{dateText(event.created_at)}</span>{event.reason ? <p className="mt-1 text-ink/65">{String(event.reason)}</p> : null}</div>)}{!(Array.isArray(review.moderation_events) && review.moderation_events.length) && !(Array.isArray(review.dispute_events) && review.dispute_events.length) ? <p className="text-ink/50">No later moderation action has been recorded.</p> : null}</div></div> : null}
                {recordId && disputeId === review.id ? (
                  <form
                    className="mt-4 rounded-xl border border-magenta/20 bg-blush/30 p-4"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const reason = disputeReason.trim();
                      if (reason.length < 10) {
                        c.setNotice("Enter a dispute reason of at least 10 characters.");
                        return;
                      }
                      setDisputeSaving(true);
                      const { data, error } = await supabase.rpc("dispute_review", {
                        target_review_id: review.id,
                        dispute_reason: reason,
                      });
                      setDisputeSaving(false);
                      if (error || !data) {
                        c.setNotice(
                          "The review could not be sent for moderation. Confirm this account has Reviews permission and try again.",
                        );
                        return;
                      }
                      c.setReviews((current) =>
                        current.map((item) =>
                          item.id === review.id
                            ? {
                                ...item,
                                dispute_status: "Disputed",
                                dispute_reason: reason,
                              }
                            : item,
                        ),
                      );
                      setDisputeId(null);
                      setDisputeReason("");
                      c.setNotice("Review dispute saved with its reason and audit record.");
                    }}
                  >
                    <label className="block text-xs font-bold text-plum">
                      Why should the platform review this feedback?
                      <textarea
                        autoFocus
                        required
                        minLength={10}
                        maxLength={1000}
                        rows={3}
                        value={disputeReason}
                        onChange={(event) => setDisputeReason(event.target.value)}
                        className="mt-2 w-full rounded-lg border border-plum/15 bg-white p-3 font-normal text-ink outline-none focus:border-magenta"
                        placeholder="Describe the policy concern or booking evidence the admin should review."
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        disabled={disputeSaving}
                        className="min-h-10 rounded-lg bg-magenta px-4 font-bold text-white gc-disabled-control"
                      >
                        {disputeSaving ? "Submitting…" : "Submit dispute"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDisputeId(null);
                          setDisputeReason("");
                        }}
                        className="min-h-10 rounded-lg border border-plum/15 px-4 text-plum"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </Panel>
            ))}
            {!displayedReviews.length ? (
              <Panel>
                <Empty text={reviewQuery || reviewView !== "recent" ? "No reviews match this search and status." : "Completed-booking reviews will appear here automatically."} />
              </Panel>
            ) : null}
          </div>
        </div>
        {!recordId ? <div className="space-y-4">
          <Panel>
            <h2 className="font-serif text-xl text-plum">
              Review Response Tips
            </h2>
            {[
              "Respond to all reviews",
              "Be professional and personal",
              "Resolve issues constructively",
            ].map((tip) => (
              <div key={tip} className="mt-4 flex gap-3 text-xs">
                <Sparkles size={20} className="text-magenta" />
                <span>
                  <b>{tip}</b>
                  <span className="mt-1 block text-ink/60">
                    Keep your response warm, respectful, and on-brand.
                  </span>
                </span>
              </div>
            ))}
          </Panel>
          <Panel>
            <h2 className="font-serif text-xl text-plum">
              Review Distribution
            </h2>
            {count ? (
              <div className="mx-auto mt-5 flex h-36 w-36 items-center justify-center rounded-full border-[18px] border-magenta">
                <span className="text-center font-serif text-3xl">
                  {count}
                  <span className="block text-[10px]">Total</span>
                </span>
              </div>
            ) : (
              <Empty text="No reviews yet." />
            )}
          </Panel>
        </div> : null}
      </div>
    </>
  );
}

function Earnings({ c, recordId = "" }: { c: Ctx; recordId?: string }) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [fromDate, setFromDate] = useState(searchParams.get("from") || "");
  const [toDate, setToDate] = useState(searchParams.get("to") || "");
  const [ledgerView, setLedgerView] = useState(searchParams.get("ledger") || "appointments");
  const timeZone = String(c.salon.time_zone || "America/New_York");
  const styles = new Map(c.styles.map((row) => [String(row.id), row]));
  const stylists = new Map(c.stylists.map((row) => [String(row.id), row]));
  const transactions = c.bookings.map((booking) =>
    bookingTransaction(
      booking,
      c.salon,
      styles.get(String(booking.style_id)),
      stylists.get(String(booking.stylist_id)),
    ),
  );
  const visible = transactions.filter((row) => {
    const needle = query.trim().toLowerCase();
    const matchesQuery =
      !needle ||
      [
        row.public_reference,
        row.customer,
        row.service,
        row.transaction_type,
      ].some((value) => String(value || "").toLowerCase().includes(needle));
    return (
      matchesQuery &&
      (status === "all" ||
        String(row.financial_status || row.payout_status) === status) &&
      (!fromDate || String(row.date || "").slice(0, 10) >= fromDate) &&
      (!toDate || String(row.date || "").slice(0, 10) <= toDate)
    );
  });
  const summary = summarizeBookingTransactions(visible);
  const statuses = [
    ...new Set(
      transactions
        .map((row) => String(row.financial_status || row.payout_status || ""))
        .filter(Boolean),
    ),
  ].sort();
  const money = (value: unknown) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));
  function exportLedger() {
    const blob = new Blob([financeCsv(visible, timeZone)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `girlz-culture-salon-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const selectedTransaction = transactions.find((row) => String(row.booking_id) === recordId) || null;
  const ledgerParams = new URLSearchParams({
    ...(query ? { q: query } : {}),
    ...(status !== "all" ? { status } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
    ...(ledgerView !== "appointments" ? { ledger: ledgerView } : {}),
  });
  const ledgerReturnHref = `/salon/dashboard/earnings${ledgerParams.size ? `?${ledgerParams}` : ""}`;
  const transactionHref = (bookingId: unknown) =>
    `/salon/dashboard/earnings/${encodeURIComponent(String(bookingId))}${ledgerParams.size ? `?${ledgerParams}` : ""}`;
  if (recordId) {
    return <>
      <OwnerDetailHeader title={selectedTransaction ? `Transaction ${String(selectedTransaction.public_reference || "")}` : "Transaction details"} subtitle={selectedTransaction ? `${String(selectedTransaction.customer)} · ${dateText(selectedTransaction.date, timeZone)}` : "This transaction could not be found."} fallbackHref={ledgerReturnHref} status={selectedTransaction ? String(selectedTransaction.financial_status || selectedTransaction.payout_status || "Recorded") : "Unavailable"}/>
      <Panel>{selectedTransaction ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Deposit collected" value={money(selectedTransaction.deposit_collected)} icon={CircleDollarSign}/><Metric label="Refund" value={money(selectedTransaction.refund_amount)} icon={CircleDollarSign}/><Metric label="Balance due" value={money(selectedTransaction.balance_due)} icon={Clock3}/><Metric label="Net owed to salon" value={money(selectedTransaction.net_amount_owed_salon)} icon={BadgeCheck}/></div><LedgerEvidence row={selectedTransaction} money={money}/></> : <Empty text="The transaction is unavailable or outside this salon."/>}</Panel>
    </>;
  }
  return (
    <>
      <Title
        title="Earnings & Payouts"
        subtitle="Track your earnings, manage payouts, and view your transaction history."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Deposits received"
          value={money(summary.deposits)}
          icon={CircleDollarSign}
        />
        <Metric
          label="Refunds"
          value={money(summary.refunds)}
          icon={CircleDollarSign}
        />
        <Metric
          label="Net owed to salon"
          value={money(summary.netOwed)}
          icon={Clock3}
        />
        <Metric
          label="Remaining client balance"
          value={money(summary.balanceDue)}
          icon={CalendarDays}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[.75fr_.65fr_1.1fr]">
        <Panel>
          <h2 className="font-serif text-xl text-plum">Payout Account</h2>
          {c.salon.stripe_account_id ? (
            <>
              <p className="mt-4 flex items-center gap-2 gc-text-success">
                <BadgeCheck size={18} aria-hidden="true" />
                Account connected
              </p>
              <p className="mt-2 text-xs text-ink/60">
                Connection details are managed securely in Stripe.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 font-semibold">Connect your payout account</p>
              <p className="mt-2 text-xs leading-5 text-ink/65">
                Connect your Stripe account to receive payouts securely. Girlz
                Culture never stores your bank details.
              </p>
              <button
                onClick={() =>
                  c.setNotice(
                    "Stripe Connect requires the platform’s live Stripe credentials before onboarding can begin.",
                  )
                }
                className="mt-5 min-h-11 w-full rounded-[8px] bg-[linear-gradient(90deg,#006b88,#0083a6)] text-xs font-bold text-white"
              >
                Connect with Stripe
              </button>
            </>
          )}
        </Panel>
        <Panel>
          <h2 className="font-serif text-xl text-plum">Account Status</h2>
          <p className="mt-4 text-sm gc-text-success">
            {c.salon.stripe_account_id ? "Account connected" : "Not connected"}
          </p>
          <p className="mt-3 text-xs text-ink/60">
            {c.salon.stripe_account_id
              ? "Payout timing and account details are available in Stripe."
              : "Connect Stripe before accepting payouts."}
          </p>
        </Panel>
        <Panel>
          <h2 className="font-serif text-xl text-plum">Earnings Trend</h2>
          <p className="mt-3 font-serif text-3xl">{money(summary.completedBookingValue)}</p>
          <div className="mt-8">
            <MiniLine />
          </div>
        </Panel>
      </div>
      <div role="group" className="mt-4 flex flex-wrap gap-2" aria-label="Earnings ledger source">
        <button type="button" onClick={()=>setLedgerView("appointments")} className={`min-h-10 rounded-full border px-4 text-xs font-bold ${ledgerView === "appointments" ? "border-magenta bg-magenta text-white" : "border-plum/15 bg-white text-plum"}`}>Appointment deposits</button>
        <button type="button" onClick={()=>setLedgerView("products")} className={`min-h-10 rounded-full border px-4 text-xs font-bold ${ledgerView === "products" ? "border-magenta bg-magenta text-white" : "border-plum/15 bg-white text-plum"}`}>Product sales</button>
      </div>
      {ledgerView === "appointments" ? <Panel className="mt-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="font-serif text-xl text-plum">Transaction ledger</h2><p className="mt-1 text-xs gc-text-secondary">Authoritative booking, refund, transfer, and payout evidence. Totals above follow these filters.</p></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(170px,1fr)_150px_145px_145px_auto]">
            <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search customer or reference" className="min-h-11 rounded-lg border border-plum/15 px-3 text-xs"/>
            <select value={status} onChange={(event)=>setStatus(event.target.value)} className="min-h-11 rounded-lg border border-plum/15 bg-white px-3 text-xs"><option value="all">All statuses</option>{statuses.map((value)=><option key={value}>{value}</option>)}</select>
            <label className="text-[10px] font-bold text-plum">From<input aria-label="Ledger start date" type="date" value={fromDate} onChange={(event)=>setFromDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal text-ink"/></label>
            <label className="text-[10px] font-bold text-plum">To<input aria-label="Ledger end date" type="date" value={toDate} onChange={(event)=>setToDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-plum/15 px-3 text-xs font-normal text-ink"/></label>
            <button type="button" onClick={exportLedger} className="min-h-11 rounded-lg border border-magenta px-4 text-xs font-bold text-magenta">Export CSV</button>
          </div>
        </div>
        <div className="mt-4 space-y-3 md:hidden">
          {visible.map((row)=><Link key={String(row.booking_id)} href={transactionHref(row.booking_id)} className="block rounded-xl border border-plum/10 bg-white p-4"><span className="flex items-start justify-between gap-3"><span><b>{String(row.public_reference||"Booking")}</b><small className="mt-1 block text-ink/55">{String(row.customer)} · {dateText(row.date,timeZone)}</small></span><Status value={String(row.financial_status||row.payout_status)}/></span><span className="mt-3 inline-block text-xs font-bold text-magenta">View transaction</span></Link>)}
          {!visible.length?<Empty text="No transactions match these filters."/>:null}
        </div>
        <div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full min-w-[1180px] text-left text-xs">
          <thead>
            <tr>
              {[
                "Local date / reference",
                "Customer / type",
                "Original / discount",
                "Deposit / balance",
                "Fees",
                "Refund",
                "Transfer / payout",
                "Net owed",
                "Evidence",
              ].map((h) => (
                <th className="border-b border-plum/10 py-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={String(row.booking_id)} className="border-b border-plum/10 align-top">
                <td className="py-3 pr-3">{dateText(row.date,timeZone)}<b className="mt-1 block">{String(row.public_reference)}</b></td>
                <td className="pr-3">{String(row.customer)}<span className="mt-1 block text-ink/50">{String(row.transaction_type)}</span></td>
                <td className="pr-3">{money(row.original_service_value)}<span className="mt-1 block text-ink/50">− {money(row.discount)}</span></td>
                <td className="pr-3">{money(row.deposit_collected)}<span className="mt-1 block gc-text-primary">Balance {money(row.balance_due)}</span></td>
                <td className="pr-3">Stripe {money(row.stripe_processing_fee)}<span className="mt-1 block text-ink/50">Platform {money(row.platform_fee)}</span></td>
                <td className="pr-3">{money(row.refund_amount)}<span className="mt-1 block"><Status value={String(row.refund_status)}/></span></td>
                <td className="pr-3"><Status value={String(row.transfer_status)}/><span className="mt-1 block"><Status value={String(row.payout_status)}/></span></td>
                <td className="pr-3 font-bold">{money(row.net_amount_owed_salon)}</td>
                <td><Link href={transactionHref(row.booking_id)} className="font-bold text-magenta">View</Link></td>
              </tr>
            ))}
            {!visible.length ? (
              <tr>
                <td colSpan={9}>
                  <Empty text="No transactions match these filters." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table></div>
      </Panel> : <SalonProductOrders mode="finance" fromDate={fromDate} toDate={toDate} onFromDateChange={setFromDate} onToDateChange={setToDate}/>}
    </>
  );
}

function LedgerEvidence({row,money}:{row:Record<string,unknown>;money:(value:unknown)=>string}){
  const evidence=[
    ["Payment",row.payment_status],
    ["Financial",row.financial_status],
    ["Cancellation actor",row.cancelled_by||"Not cancelled"],
    ["Customer-safe reason",row.cancellation_customer_reason||"—"],
    ["Refund eligibility",row.refund_eligibility_status||"—"],
    ["Policy outcome",row.refund_policy_outcome||"—"],
    ["Refund",`${money(row.refund_amount)} · ${String(row.refund_status||"Not applicable")}`],
    ["Transfer",row.transfer_status],
    ["Payout",row.payout_status],
  ];
  return <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">{evidence.map(([label,value])=><div key={String(label)}><dt className="font-bold text-ink/45">{String(label)}</dt><dd className="mt-0.5 break-words">{String(value||"—")}</dd></div>)}</dl>;
}

// Retained temporarily for compatibility with saved dashboard tab references.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Promotions({ c }: { c: Ctx }) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const saved = await c.saveRecord("salon_promotions", {
      title: f.get("title"),
      description: f.get("description"),
      discount_label: f.get("discount"),
      starts_at: f.get("start"),
      ends_at: f.get("end"),
      is_active: f.get("active") === "on",
    });
    if (saved) c.setPromotions((rows) => [saved, ...rows]);
  }
  return (
    <>
      <Title
        title="Business Growth & Admin"
        subtitle="Manage promotions and marketing activity."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <h2 className="font-serif text-xl text-plum">
            Create a Deal or Offer
          </h2>
          <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Title"
              name="title"
              placeholder="Describe your offer"
              wide
            />
            <TextArea
              label="Description"
              name="description"
              placeholder="Describe the offer and any terms."
              wide
            />
            <Field label="Discount" name="discount" />
            <Field label="Start Date" name="start" type="date" />
            <Field label="End Date" name="end" type="date" />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="active" className="accent-magenta" />
              Activate promotion
            </label>
            <button className="sm:col-span-2 min-h-11 rounded-[8px] bg-magenta text-xs font-bold text-white">
              Create Promotion
            </button>
          </form>
        </Panel>
        <Panel className="bg-blush/35">
          <Megaphone className="text-magenta" />
          <h2 className="mt-4 font-serif text-2xl text-plum">
            Promotion visibility
          </h2>
          <p className="mt-3 text-sm leading-6 text-ink/65">
            Published promotions are shown according to your active plan.
            Performance reporting will remain empty until real views, clicks,
            and attributed bookings are collected.
          </p>
          {c.isOwner ? (
            <Link
              href="/salon/dashboard/subscription"
              className="mt-5 inline-flex rounded-[8px] border border-magenta px-5 py-3 text-xs font-bold text-magenta"
            >
              Review plan features
            </Link>
          ) : (
            <p className="mt-5 text-xs font-semibold text-plum">
              The salon owner manages plan changes.
            </p>
          )}
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <Panel>
          <h2 className="font-serif text-xl text-plum">
            Promotion Performance
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="Views" value={0} />
            <Metric label="Clicks" value={0} />
            <Metric label="Bookings" value={0} />
          </div>
          <p className="mt-4 text-xs text-ink/50">
            Attribution data has not been collected yet.
          </p>
        </Panel>
        <Panel>
          <h2 className="font-serif text-xl text-plum">Recent Promotions</h2>
          {c.promotions.map((p) => (
            <div
              key={p.id}
              className="mt-3 flex items-center justify-between border-b border-plum/10 pb-3 text-xs"
            >
              <span>
                <b>{String(p.title || "Promotion")}</b>
                <span className="block text-ink/50">
                  {dateText(p.starts_at)} – {dateText(p.ends_at)}
                </span>
              </span>
              <Status value={p.is_active ? "Active" : "Ended"} />
            </div>
          ))}
          {!c.promotions.length ? (
            <Empty text="Create your first offer." />
          ) : null}
        </Panel>
      </div>
    </>
  );
}

function SettingsWorkspace({ c, focus = "" }: { c: Ctx; focus?: string }) {
  if (!focus) {
    return <>
      <Title title="Settings & Team" subtitle="Choose one area to manage without losing your place in the dashboard." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <OwnerSectionCard href="/salon/dashboard/settings/account" icon={UserRound} title="Account details" description="Update the salon email, phone, and required booking contact details." />
        <OwnerSectionCard href="/salon/dashboard/settings/notifications" icon={Megaphone} title="Notifications" description="Choose review and growth alerts while keeping required booking alerts on." />
        {c.isOwner ? <OwnerSectionCard href="/salon/dashboard/settings/marketplace" icon={Eye} title="Marketplace status" description="Pause bookings, hide or republish the salon, and request closure." status={c.salon.is_discoverable ? "Published" : "Hidden"} /> : null}
        {c.isOwner ? <OwnerSectionCard href="/salon/dashboard/settings/team" icon={UsersRound} title="Team & permissions" description="Invite team members and grant only the dashboard sections they need." /> : null}
        <OwnerSectionCard href="/salon/dashboard/settings/security" icon={LockKeyhole} title="Security & sign out" description="Review password recovery guidance or securely end this salon session." />
      </div>
    </>;
  }
  if (focus === "team") return <><OwnerDetailHeader title="Team & permissions" subtitle="Choose one team member to manage without losing the settings context. Subscription and billing always remain owner-only." fallbackHref="/salon/dashboard/settings" status={c.isOwner ? "Owner access" : "Read only"}/><TeamUserManager scope="salon" /></>;
  if (focus.startsWith("member-")) return <><OwnerDetailHeader title={focus === "member-new" ? "Add team member" : "Manage team member"} subtitle="Save identity, role, status, and dashboard permissions together." fallbackHref="/salon/dashboard/settings/team" status="Owner-only access"/><TeamUserManager scope="salon" initialUserId={focus.slice("member-".length)} showBackLink={false}/></>;
  if (focus === "marketplace") return <><OwnerDetailHeader title="Marketplace status" subtitle="Manage publication and booking availability without changing the salon record." fallbackHref="/salon/dashboard/settings"/><PublicationControls c={c}/></>;
  if (focus === "security") return <><OwnerDetailHeader title="Security & sign out" subtitle="Password changes use the verified email recovery flow." fallbackHref="/salon/dashboard/settings"/><Panel><h2 className="font-serif text-xl text-plum">Secure salon session</h2><p className="mt-2 max-w-2xl text-sm leading-6 gc-text-primary">Use the salon login page to request a password-reset email. Signing out here only ends this salon workspace session and does not affect a separate platform-admin session.</p><div className="mt-5"><RoleLogoutButton scope="salon" /></div></Panel></>;
  return <SettingsPage c={c} focus={focus === "notifications" ? "notifications" : "account"} />;
}

function SettingsPage({ c, focus = "account" }: { c: Ctx; focus?: "account" | "notifications" }) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await c.updateSalon({
      email: form.get("email"),
      phone: form.get("phone"),
      notification_preferences: {
        in_app: true,
        email: true,
        sms: true,
        reviews: form.get("reviews") === "on",
        marketing: form.get("marketing") === "on",
      },
    });
  }
  return (
    <>
      <OwnerDetailHeader title={focus === "notifications" ? "Notification preferences" : "Account details"} subtitle={focus === "notifications" ? "Control optional alerts while required booking confirmations remain enabled." : "Keep the salon contact details used for booking operations current."} fallbackHref="/salon/dashboard/settings" />
      <form onSubmit={submit} className="block">
        {focus === "account" ? <Panel>
          <h2 className="font-serif text-xl text-plum">Account Details</h2>
          <div className="mt-4 space-y-4">
            <Field
              label="Login Email"
              name="email"
              type="email"
              defaultValue={c.salon.email}
            />
            <Field
              label="Business Phone / SMS Number"
              name="phone"
              defaultValue={c.salon.phone}
            />
            <p className="rounded-[8px] bg-blush/30 p-3 text-[10px] leading-4 text-ink/60">
              Keep both current. Every auto-confirmed booking sends mandatory
              email and SMS alerts here.
            </p>
            <button
              type="button"
              onClick={() =>
                c.setNotice(
                  "A secure password-reset email can be sent from the login screen.",
                )
              }
              className="text-xs font-bold text-magenta"
            >
              Change password
            </button>
          </div>
            <button className="mt-5 min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white">Save account details</button>
        </Panel> : null}
        {focus === "notifications" ? <Panel>
          <h2 className="font-serif text-xl text-plum">
            Notification Preferences
          </h2>
          <p className="mt-2 text-[10px] leading-4 text-ink/55">
            Booking alerts cannot be disabled because appointments confirm
            instantly.
          </p>
          <div className="mt-4 space-y-3">
            {[
              "In-app booking alerts",
              "Email for every booking",
              "SMS for every booking",
            ].map((label) => (
              <label
                key={label}
                className="flex items-center justify-between rounded-[9px] border border-magenta/15 bg-blush/20 p-4 text-xs"
              >
                <span>
                  {label}
                  <small className="mt-1 block font-semibold gc-text-primary">Required</small>
                </span>
                <input
                  type="checkbox"
                  checked
                  disabled
                  readOnly
                  className="accent-magenta"
                />
              </label>
            ))}
            {[
              ["reviews", "New reviews and replies"],
              ["marketing", "Marketing and growth tips"],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-[9px] border border-plum/10 p-4 text-xs"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={
                    c.salon.notification_preferences?.[key] !== false
                  }
                  className="accent-magenta"
                />
              </label>
            ))}
          </div>
          <button className="mt-5 min-h-11 w-full rounded-[8px] bg-magenta text-xs font-bold text-white">
            Save Settings
          </button>
        </Panel> : null}
      </form>
    </>
  );
}

function PublicationControls({ c }: { c: Ctx }) {
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState({
    published: c.salon.is_discoverable === true,
    accepting: c.salon.accepting_bookings !== false,
    unpublished: Boolean(c.salon.owner_unpublished_at),
    closure: Boolean(c.salon.closure_requested_at),
  });
  async function action(next: string) {
    if (
      (next === "unpublish" || next === "request_closure") &&
      !reason.trim()
    ) {
      c.setNotice("Add a short reason first.");
      return;
    }
    setBusy(next);
    try {
      const session = await getSessionForScope("salon");
      if (!session) throw new Error("Your salon session expired.");
      const response = await fetch("/api/salon/lifecycle", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: next, reason }),
      });
      const body = await response.json();
      if (!response.ok && response.status !== 409)
        throw new Error(body.error || "We couldn't update the salon status.");
      const lifecycle = body.lifecycle || {};
      setState({
        published: lifecycle.is_discoverable === true,
        accepting: lifecycle.accepting_bookings !== false,
        unpublished: Boolean(lifecycle.owner_unpublished_at),
        closure: Boolean(lifecycle.closure_requested_at),
      });
      c.setNotice(body.error || "Salon status updated.");
    } catch (error) {
      c.setNotice(
        error instanceof Error
          ? error.message
          : "We couldn't update the salon status.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <Panel className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-plum">Marketplace status</h2>
          <p className="mt-1 text-xs text-ink/60">
            Publication and booking availability are separate controls. Closing
            permanently requires a reviewed request so booking and payment
            history stays protected.
          </p>
        </div>
        <div className="flex gap-2">
          <Status value={state.published ? "Published" : "Hidden"} />
          <Status
            value={state.accepting ? "Accepting bookings" : "Bookings paused"}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          disabled={Boolean(busy)}
          onClick={() =>
            void action(state.accepting ? "pause_bookings" : "resume_bookings")
          }
          className="min-h-11 rounded-[8px] border border-magenta px-4 text-xs font-bold text-magenta"
        >
          {state.accepting ? "Pause bookings" : "Resume bookings"}
        </button>
        <button
          disabled={Boolean(busy)}
          onClick={() =>
            void action(state.unpublished ? "publish" : "unpublish")
          }
          className="min-h-11 rounded-[8px] border border-plum/20 px-4 text-xs font-bold text-plum"
        >
          {state.unpublished ? "Publish salon" : "Temporarily hide salon"}
        </button>
        <button
          disabled={Boolean(busy)}
          onClick={() => void action("reconcile")}
          className="min-h-11 rounded-[8px] border border-plum/20 px-4 text-xs font-bold text-plum"
        >
          Recheck eligibility
        </button>
        <button
          disabled={Boolean(busy) || state.closure}
          onClick={() => void action("request_closure")}
          className="min-h-11 rounded-[8px] border border-red-200 px-4 text-xs font-bold gc-text-danger"
        >
          {state.closure ? "Closure requested" : "Request permanent closure"}
        </button>
      </div>
      <label className="mt-4 block text-[10px] font-bold">
        Reason for hiding or closure request
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value.slice(0, 1000))}
          rows={3}
          className="mt-1 w-full rounded-[8px] border border-plum/15 p-3 text-xs font-normal"
          placeholder="This is kept with the status audit."
        />
      </label>
    </Panel>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
  wide = false,
}: {
  label: string;
  name: string;
  defaultValue?: unknown;
  placeholder?: string;
  type?: string;
  required?: boolean;
  wide?: boolean;
}) {
  const inputType = name === "phone" ? "tel" : type;
  const pattern =
    inputType === "email"
      ? EMAIL_PATTERN
      : inputType === "tel"
        ? US_PHONE_PATTERN
        : undefined;
  const numeric = type === "number";
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-[10px] font-bold">
        {label}
        {required ? <span className="text-magenta"> *</span> : null}
      </span>
      {numeric ? <NumericInput
        name={name}
        integer={/(?:quantity|threshold|minutes|years|duration)/i.test(name)}
        decimalPlaces={2}
        required={required}
        min={0}
        max={10000}
        defaultValue={String(defaultValue ?? "")}
        placeholder={placeholder}
        className="min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs outline-none focus:border-magenta"
      /> : <input
        name={name}
        type={inputType}
        inputMode={
          inputType === "tel" ? "tel" : numeric ? "decimal" : undefined
        }
        pattern={pattern}
        title={
          inputType === "email"
            ? "Enter a valid email address such as name@example.com"
            : inputType === "tel"
              ? "Please enter a US phone number"
              : undefined
        }
        required={required}
        defaultValue={String(defaultValue ?? "")}
        placeholder={
          placeholder || (inputType === "tel" ? "+1 (555) 123-4567" : undefined)
        }
        className="min-h-10 w-full rounded-[7px] border border-plum/15 bg-white px-3 text-xs outline-none focus:border-magenta"
      />}
    </label>
  );
}
function TextArea({
  label,
  name,
  defaultValue,
  placeholder,
  wide = false,
}: {
  label: string;
  name: string;
  defaultValue?: unknown;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-[10px] font-bold">{label}</span>
      <textarea
        name={name}
        defaultValue={String(defaultValue ?? "")}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-[7px] border border-plum/15 bg-white px-3 py-2 text-xs outline-none focus:border-magenta"
      />
    </label>
  );
}
function Status({ value }: { value: string }) {
  const color = /confirmed|paid|active|completed/i.test(value)
    ? "bg-green-100 gc-text-success"
    : /cancel|declin|ended/i.test(value)
      ? "bg-red-100 gc-text-danger"
      : /request|pending|scheduled/i.test(value)
        ? "bg-amber/20 gc-text-warning"
        : "bg-blue-100 gc-text-link";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-semibold ${color}`}
    >
      {value}
    </span>
  );
}
function Stars({ value }: { value: number }) {
  return (
    <span className="mt-1 flex gap-0.5 text-amber">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={13}
          className={
            i < Math.round(value) ? "fill-amber text-amber" : "text-ink/20"
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-[9px] border border-dashed border-plum/20 bg-blush/20 p-5 text-center text-xs text-ink/60">
      {text}
    </div>
  );
}
function salonWeek(timeZone: string, offsetWeeks = 0) {
  const today = dateKeyInTimeZone(new Date(), timeZone);
  const cursor = new Date(`${today}T12:00:00Z`);
  const daysFromMonday = (cursor.getUTCDay() + 6) % 7;
  cursor.setUTCDate(cursor.getUTCDate() - daysFromMonday);
  cursor.setUTCDate(cursor.getUTCDate() + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(cursor);
    date.setUTCDate(cursor.getUTCDate() + index);
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }),
      day: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    };
  });
}
function weekRangeLabel(week: Array<{ key: string; label: string; day: string }>) {
  if (!week.length) return "";
  const start = new Date(`${week[0].key}T12:00:00Z`);
  const end = new Date(`${week[week.length - 1].key}T12:00:00Z`);
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
}
function bookingTime(value: unknown, timeZone: string) {
  if (!value) return "Time not set";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "Time not set"
    : date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      });
}
function dateText(value: unknown, timeZone = "America/New_York") {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      });
}
function styleName(c: Ctx, id: unknown) {
  return String(c.styles.find((s) => s.id === id)?.name || "Braiding Service");
}
function stylistName(c: Ctx, id: unknown) {
  return String(c.stylists.find((s) => s.id === id)?.name || "Any stylist");
}
function optionText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((o) => {
      const x = o as Record<string, unknown>;
      return `${x.label || x.name || "Option"}|${x.price_add || x.price || 0}`;
    })
    .join("\n");
}
