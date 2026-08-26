import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import { bookingAvailability, nextAvailableSlot } from "@/lib/bookingAvailabilityServer";
import { salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { cleanEmail, cleanText, cleanUsPhone, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";
import { deliverBookingNotifications, getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";
import { previewPromoCode, reservePromoCode } from "@/lib/promoCodes";
import { getEngineNumber } from "@/lib/engineConfigServer";
import { normalizeLocale } from "@/i18n/catalog";
import { calculateSalonPromotion, type SalonPromotion } from "@/lib/salonPromotions";
import {
  completeCommerceCheckout,
  estimateStripeCommerceTax,
} from "@/lib/commerceCheckoutServer";

type PriceOption = { value?: string; label?: string; price_add?: number | string };
const options = (value: unknown): PriceOption[] => Array.isArray(value) ? value as PriceOption[] : [];
type ServiceOption = PriceOption & { duration_add_minutes?: number | string };
type ServiceOptionGroup = { id?: string; label?: string; selection?: string; required?: boolean; options?: ServiceOption[] };
const optionGroups = (value: unknown): ServiceOptionGroup[] => Array.isArray(value) ? value as ServiceOptionGroup[] : [];

async function POSTHandler(request: Request) {
  const admin = getSupabaseAdmin();
  let intentId = "";
  let commerceIntentId = "";
  let salonPromotionRedemptionId = "";
  let checkoutSessionCreated = false;
  let checkoutSessionId = "";
  let checkoutSessionUrl = "";
  try {
    enforceRateLimit(request, "booking-checkout", 8, 10 * 60_000);
    const body = await request.json() as Record<string, unknown>;
    rejectBot(body);
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const { data: authData } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    const customerId = authData.user?.id || null;
    const salonId = cleanText(body.salon_id, 50);
    const styleId = cleanText(body.style_id, 50);
    if (!salonId || !styleId) throw new Error("The salon or style selection is missing. Please return to the salon page and try again.");

    const { data: salon, error: salonError } = await admin.from("salons").select("id,slug,name,status,is_discoverable,accepting_bookings,subscription_status,subscription_tier,time_zone,stripe_account_id,address_street,address_city,address_state,address_zip").eq("id", salonId).single();
    if (salonError) throw new Error(`Unable to verify the salon: ${salonError.message}`);
    if (!salon || salon.status !== "Active" || salon.is_discoverable !== true || salon.accepting_bookings === false || !["active", "trialing"].includes(String(salon.subscription_status).toLowerCase())) throw new Error("This salon is not currently accepting marketplace bookings.");
    const { data: style, error: styleError } = await admin.from("styles").select("*,service_category:service_categories(slug)").eq("id", styleId).eq("salon_id", salonId).single();
    if (styleError || !style) throw new Error(styleError ? `Unable to verify the selected style: ${styleError.message}` : "The selected style is not available.");

    const guestName = cleanText(body.guest_name, 120);
    const guestEmail = cleanEmail(body.guest_email);
    const guestPhone = cleanUsPhone(body.guest_phone, true);
    const requestedLocale = normalizeLocale(cleanText(body.locale, 20));
    const { data: enabledLocale } = await admin
      .from("supported_locales")
      .select("locale")
      .eq("locale", requestedLocale)
      .eq("is_enabled", true)
      .is("archived_at", null)
      .maybeSingle();
    const preferredLocale = enabledLocale?.locale || "en";
    if (!guestName) throw new Error("Enter your name.");
    const appointmentLocal = cleanText(body.appointment_local, 20);
    const [localDate, localTime] = appointmentLocal.split("T");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate || "") || !/^\d{2}:\d{2}$/.test(localTime || "")) throw new Error("Choose a valid appointment date and time.");
    const timeZone = salonTimeZone(salon.time_zone);
    const appointment = zonedLocalToUtc(appointmentLocal, timeZone);
    const [minimumLeadMinutes,maximumAdvanceDays,clientNotesMaxLength]=await Promise.all([getEngineNumber("booking.minimum_lead_minutes",30,15,1440),getEngineNumber("booking.maximum_advance_days",180,7,730),getEngineNumber("booking.client_notes_max_length",1000,100,5000)]);
    if (appointment.getTime() < Date.now() + minimumLeadMinutes * 60_000) throw new Error(`Choose a time at least ${minimumLeadMinutes} minutes from now.`);
    if (appointment.getTime() > Date.now() + maximumAdvanceDays * 86_400_000) throw new Error(`Appointments can be booked up to ${maximumAdvanceDays} days ahead.`);

    const requestedStylistId = cleanText(body.stylist_id, 50) || null;
    if (requestedStylistId) {
      const { data: stylist } = await admin.from("stylists").select("id").eq("id", requestedStylistId).eq("salon_id", salonId).eq("is_active", true).single();
      if (!stylist) throw new Error("The selected stylist is not available at this salon.");
    }
    const liveAvailability = await bookingAvailability({ salonId, styleId, stylistId: requestedStylistId, customerId, guestEmail, date: localDate });
    const selectedSlot = liveAvailability.slots.find((slot) => slot.value === localTime);
    if (!selectedSlot) {
      const next = await nextAvailableSlot({ salonId, styleId, stylistId: requestedStylistId, customerId, guestEmail, afterDate: localDate, afterTime: localTime });
      return Response.json({ error: "That time is no longer available.", next_available: next }, { status: 409 });
    }
    const stylistId = requestedStylistId || selectedSlot.stylistId;

    const selectedSize = cleanText(body.selected_size, 80);
    const selectedLength = cleanText(body.selected_length, 80);
    const selectedAddons = Array.isArray(body.selected_addons) ? body.selected_addons.map((item) => cleanText(item, 80)).slice(0, 20) : [];
    const rawSelectedOptions = body.selected_options && typeof body.selected_options === "object" && !Array.isArray(body.selected_options) ? body.selected_options as Record<string, unknown> : {};
    const selectedOptions = Object.fromEntries(Object.entries(rawSelectedOptions).slice(0, 30).map(([key, value]) => [cleanText(key, 40), Array.isArray(value) ? value.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 30) : []]).filter(([key]) => key)) as Record<string, string[]>;
    const groups = optionGroups(style.option_groups);
    const groupIds = new Set(groups.map((group) => cleanText(group.id, 40)).filter(Boolean));
    if (Object.keys(selectedOptions).some((key) => !groupIds.has(key))) throw new Error("A selected service option is no longer available.");
    let genericPriceAdjustment = 0;
    let genericDurationAdjustmentMinutes = 0;
    for (const group of groups) {
      const groupId = cleanText(group.id, 40);
      const values = selectedOptions[groupId] || [];
      if (group.required && values.length === 0) throw new Error(`Choose ${cleanText(group.label, 80) || "a required service option"}.`);
      if (group.selection !== "multiple" && values.length > 1) throw new Error(`Choose only one ${cleanText(group.label, 80) || "service option"}.`);
      for (const value of values) {
        const option = options(group.options).find((item) => item.value === value || item.label === value) as ServiceOption | undefined;
        if (!option) throw new Error("A selected service option is no longer available.");
        genericPriceAdjustment += Number(option.price_add || 0);
        genericDurationAdjustmentMinutes += Number(option.duration_add_minutes || 0);
      }
    }
    const add = (rows: PriceOption[], value: string) => Number(rows.find((item) => item.value === value || item.label === value)?.price_add || 0);
    let total = Number(style.base_price || style.price_display_min || 0) + add(options(style.size_options), selectedSize) + add(options(style.length_options), selectedLength);
    total += selectedAddons.reduce((sum: number, value: string) => sum + add(options(style.addons), value), 0);
    total += genericPriceAdjustment;
    const materialId: string | null = cleanText(body.selected_material_id, 50) || null;
    if (materialId) {
      const { data: material } = await admin.from("style_materials").select("price").eq("id", materialId).eq("style_id", styleId).single();
      if (!material) throw new Error("The selected material is not available.");
      total += Number(material.price || 0);
    }
    total = Math.max(0, Math.round(total * 100) / 100);
    if (!Number.isFinite(total) || total > 10000) throw new Error("The booking total could not be verified.");
    const subtotalBeforeSalonPromotion = total;
    const salonPromotionId = cleanText(body.salon_promotion_id, 50) || null;
    let salonPromotionDiscount = 0;
    let salonPromotionSnapshot: Record<string, unknown> = {};
    if (salonPromotionId) {
      if (!["Growth","Premium"].includes(String(salon.subscription_tier || ""))) throw new Error("This salon offer is no longer available.");
      if (!/^[0-9a-f-]{36}$/i.test(salonPromotionId)) throw new Error("The selected salon offer is not valid.");
      const promotionResult = await admin.from("salon_promotions").select("id,salon_id,title,description,public_headline,promotion_type,discount_value,discount_label,status,target_scope,target_ids,restrictions,starts_at,ends_at,is_active,archived_at").eq("id", salonPromotionId).eq("salon_id", salonId).maybeSingle();
      if (promotionResult.error) throw promotionResult.error;
      if (!promotionResult.data) throw new Error("This salon offer is no longer available.");
      const selectedAddonDetails = selectedAddons.map((value) => {
        const option = options(style.addons).find((item) => item.value === value || item.label === value);
        return { value, label: option?.label || value, price: Number(option?.price_add || 0) };
      });
      const priceResult = calculateSalonPromotion(promotionResult.data as SalonPromotion, {
        salonId,
        styleId,
        serviceGroupId: style.service_group_id,
        masterStyleId: style.master_style_id,
        basePrice: Number(style.base_price || style.price_display_min || 0),
        selectedAddons: selectedAddonDetails,
        subtotal: total,
      });
      const restrictions = promotionResult.data.restrictions && typeof promotionResult.data.restrictions === "object" ? promotionResult.data.restrictions as Record<string, unknown> : {};
      if (priceResult.eligible && restrictions.new_customers_only === true) {
        const previousBookings = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("salon_id", salonId).or(customerId ? `customer_id.eq.${customerId},guest_email.ilike.${guestEmail}` : `guest_email.ilike.${guestEmail}`);
        if (previousBookings.error) throw previousBookings.error;
        if ((previousBookings.count || 0) > 0) throw new Error("This offer is available to new customers only.");
      }
      if (!priceResult.eligible) throw new Error("This offer does not apply to the selected service or options.");
      salonPromotionDiscount = priceResult.discount;
      total = priceResult.total;
      salonPromotionSnapshot = {
        promotion_id: promotionResult.data.id,
        title: promotionResult.data.public_headline || promotionResult.data.title,
        promotion_type: promotionResult.data.promotion_type,
        discount_value: Number(promotionResult.data.discount_value || 0),
        discount_label: promotionResult.data.discount_label,
        target_scope: promotionResult.data.target_scope,
        target_ids: promotionResult.data.target_ids || [],
        restrictions,
        starts_at: promotionResult.data.starts_at,
        ends_at: promotionResult.data.ends_at,
        subtotal_before_promotion: subtotalBeforeSalonPromotion,
        discount_amount: salonPromotionDiscount,
        adjusted_total: total,
        captured_at: new Date().toISOString(),
      };
    }
    const depositPercentage = await getEngineNumber("booking.deposit_percentage", 10, 0, 100);
    const cancellationGraceMinutes = await getEngineNumber(
      "booking.customer_cancellation_grace_minutes",
      30,
      0,
      1440,
    );
    const originalDeposit = Math.round(total * depositPercentage) / 100;
    const promoCode = cleanText(body.promo_code, 40);
    const promoPreview = promoCode ? await previewPromoCode(promoCode, "booking", originalDeposit) : null;
    const calculatedDeposit = promoPreview?.amountAfterDiscount ?? originalDeposit;
    const deposit = Math.round(calculatedDeposit * 100) >= 50 ? calculatedDeposit : 0;
    const discount = promoPreview?.discount || 0;
    const durationHours = Math.max(0.25, Number(style.duration_min_hours || style.duration_max_hours || 0) + genericDurationAdjustmentMinutes / 60);
    const bufferMinutes = Math.max(0, Number(style.buffer_minutes ?? liveAvailability.bufferMinutes ?? 15));
    const payload: Record<string, unknown> = {
      customer_id: customerId,
      salon_id: salonId,
      style_id: styleId,
      stylist_id: stylistId,
      selected_size: selectedSize || null,
      selected_length: selectedLength || null,
      selected_material_id: materialId,
      selected_addons: selectedAddons,
      selected_options: selectedOptions,
      client_notes: cleanText(body.client_notes, clientNotesMaxLength) || null,
      appointment_datetime: appointment.toISOString(),
      duration_hours: durationHours,
      buffer_minutes: bufferMinutes,
      estimated_total: total,
      subtotal_before_promotion: subtotalBeforeSalonPromotion,
      deposit_amount: deposit,
      deposit_percentage: depositPercentage,
      cancellation_grace_minutes_snapshot: cancellationGraceMinutes,
      original_deposit_amount: originalDeposit,
      discount_amount: discount,
      promo_code_id: promoPreview?.promo.id || null,
      promo_code: promoPreview?.promo.code || null,
      salon_promotion_id: salonPromotionId,
      salon_promotion_redemption_id: null,
      promotion_discount_amount: salonPromotionDiscount,
      promotion_snapshot: salonPromotionSnapshot,
      balance_due: Math.round((total - deposit) * 100) / 100,
      confirmation_code: `GC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      status: "Confirmed",
      deposit_status: deposit > 0 ? "Paid" : "No Payment Required",
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      preferred_locale: preferredLocale,
      source: "Website",
    };

    const rawProductItems = Array.isArray(body.product_items)
      ? body.product_items.slice(0, 25)
      : [];
    const productItems = rawProductItems
      .map((item) => {
        const row =
          item && typeof item === "object"
            ? (item as Record<string, unknown>)
            : {};
        return {
          product_id: cleanText(row.product_id, 50),
          quantity: Math.floor(Number(row.quantity || 0)),
        };
      })
      .filter(
        (item) =>
          /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(item.product_id) &&
          item.quantity > 0 &&
          item.quantity <= 1000,
      );
    if (rawProductItems.length && !productItems.length)
      throw new Error("The product cart is invalid.");
    const fulfillmentMethod =
      body.fulfillment_method === "Shipping" ? "Shipping" : "Pickup";
    const rawShipping =
      body.shipping_address &&
      typeof body.shipping_address === "object" &&
      !Array.isArray(body.shipping_address)
        ? (body.shipping_address as Record<string, unknown>)
        : {};
    const shippingAddress =
      fulfillmentMethod === "Shipping"
        ? {
            line1: cleanText(rawShipping.line1, 160),
            line2: cleanText(rawShipping.line2, 160),
            city: cleanText(rawShipping.city, 100),
            state: cleanText(rawShipping.state, 2).toUpperCase(),
            postal_code: cleanText(rawShipping.postal_code, 10),
            country: "US",
          }
        : {};
    if (
      productItems.length &&
      fulfillmentMethod === "Shipping" &&
      (!shippingAddress.line1 ||
        !shippingAddress.city ||
        !/^[A-Z]{2}$/.test(shippingAddress.state) ||
        !/^\d{5}(?:-\d{4})?$/.test(shippingAddress.postal_code))
    )
      throw new Error("Enter a complete US shipping address.");
    const productPromotionId = cleanText(
      body.product_promotion_id,
      50,
    );
    if (
      productPromotionId &&
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(productPromotionId)
    )
      throw new Error("The selected product offer is invalid.");

    let reservationId: string | null = null;
    let reservationError: { message?: string } | null = null;
    let commerceTotals: Record<string, unknown> | null = null;
    if (productItems.length) {
      await admin.rpc("expire_stale_commerce_checkouts");
      const combined = await admin.rpc("reserve_combined_checkout", {
        p_salon_id: salonId,
        p_customer_id: customerId,
        p_guest_name: guestName,
        p_guest_email: guestEmail,
        p_guest_phone: guestPhone,
        p_fulfillment_method: fulfillmentMethod,
        p_shipping_address: shippingAddress,
        p_items: productItems,
        p_booking: {
          style_id: styleId,
          stylist_id: stylistId,
          appointment_datetime: appointment.toISOString(),
          duration_hours: durationHours,
          buffer_minutes: bufferMinutes,
          payload,
          total_amount: total,
          deposit_amount: deposit,
        },
        p_product_promotion_id: productPromotionId || null,
        p_tax_amount: 0,
        p_idempotency_key:
          cleanText(body.checkout_idempotency_key, 120) ||
          crypto.randomUUID(),
      });
      reservationError = combined.error;
      commerceTotals =
        combined.data && typeof combined.data === "object"
          ? (combined.data as Record<string, unknown>)
          : null;
      commerceIntentId = String(
        commerceTotals?.commerce_intent_id || "",
      );
      reservationId = String(
        commerceTotals?.booking_intent_id || "",
      ) || null;
      if (
        commerceTotals?.status === "Paid" &&
        commerceTotals.booking_id &&
        commerceTotals.order_id
      ) {
        const [{ data: existingBooking }, { data: existingOrder }] =
          await Promise.all([
            admin
              .from("bookings")
              .select(
                "id,public_reference,confirmation_code,status,appointment_datetime",
              )
              .eq("id", String(commerceTotals.booking_id))
              .single(),
            admin
              .from("product_orders")
              .select(
                "public_reference,payment_status,fulfillment_status,total_amount,fulfillment_method",
              )
              .eq("id", String(commerceTotals.order_id))
              .single(),
          ]);
        return Response.json({
          booking: existingBooking
            ? { ...existingBooking, product_order: existingOrder || null }
            : null,
          combined: true,
          alreadyCompleted: true,
          testMode: true,
        });
      }
    } else {
      const bookingReservation = await admin.rpc(
        "reserve_booking_checkout",
        {
          p_salon_id: salonId,
          p_style_id: styleId,
          p_stylist_id: stylistId,
          p_customer_id: customerId,
          p_guest_email: guestEmail,
          p_appointment_datetime: appointment.toISOString(),
          p_duration_hours: durationHours,
          p_buffer_minutes: bufferMinutes,
          p_payload: payload,
          p_total_amount: total,
          p_deposit_amount: deposit,
        },
      );
      reservationId = bookingReservation.data
        ? String(bookingReservation.data)
        : null;
      reservationError = bookingReservation.error;
    }
    if (reservationError || !reservationId) {
      if (/CONFLICT|exclusion/i.test(reservationError?.message || "")) {
        const next = await nextAvailableSlot({ salonId, styleId, stylistId: requestedStylistId, customerId, guestEmail, afterDate: localDate, afterTime: localTime });
        return Response.json({ error: "That time was just reserved by another customer.", next_available: next }, { status: 409 });
      }
      if (/PRODUCT_PROMOTION/i.test(reservationError?.message || "")) {
        return Response.json(
          {
            error:
              "The selected product offer is no longer available for this cart.",
          },
          { status: 409 },
        );
      }
      if (/COMMERCE_IDEMPOTENCY_CLOSED/i.test(reservationError?.message || "")) {
        return Response.json(
          { error: "That checkout attempt is closed. Please try again." },
          { status: 409 },
        );
      }
      throw reservationError || new Error("The secure booking reservation could not be created.");
    }
    if (commerceIntentId && commerceTotals) {
      const tax = await estimateStripeCommerceTax({
        taxableAmount: Math.max(
          0,
          Number(commerceTotals.product_subtotal || 0) -
            Number(commerceTotals.product_discount || 0),
        ),
        shippingAmount: Number(commerceTotals.shipping_amount || 0),
        address:
          fulfillmentMethod === "Shipping"
            ? shippingAddress
            : {
                line1: String(salon.address_street || ""),
                city: String(salon.address_city || ""),
                state: String(salon.address_state || ""),
                postal_code: String(salon.address_zip || ""),
                country: "US",
              },
        reference: commerceIntentId,
      });
      const taxUpdate = await admin.rpc("apply_commerce_checkout_tax", {
        p_commerce_intent_id: commerceIntentId,
        p_tax_amount: tax.taxAmount,
        p_stripe_tax_calculation_id: tax.calculationId || null,
      });
      if (taxUpdate.error || !taxUpdate.data)
        throw taxUpdate.error || new Error("COMMERCE_TAX_UPDATE_FAILED");
      commerceTotals = taxUpdate.data as Record<string, unknown>;
    }
    intentId = String(reservationId);
    if (salonPromotionId) {
      const promotionReservation = await admin.rpc("reserve_salon_promotion", {
        p_promotion_id: salonPromotionId,
        p_booking_intent_id: intentId,
        p_customer_id: customerId,
        p_customer_email: guestEmail,
        p_snapshot: salonPromotionSnapshot,
      });
      if (promotionReservation.error || !promotionReservation.data) {
        if (commerceIntentId)
          await admin.rpc("release_combined_checkout", {
            p_commerce_intent_id: commerceIntentId,
            p_status: "Failed",
          });
        else
          await admin
            .from("booking_checkout_intents")
            .update({ status: "Failed" })
            .eq("id", intentId);
        if (/USAGE_LIMIT|CUSTOMER_LIMIT|NOT_AVAILABLE/i.test(promotionReservation.error?.message || "")) throw new Error("This offer has reached its use limit or is no longer available.");
        throw promotionReservation.error || new Error("This offer could not be reserved.");
      }
      salonPromotionRedemptionId = String(promotionReservation.data);
      payload.salon_promotion_redemption_id = salonPromotionRedemptionId;
      const promotionIntent = await admin.from("booking_checkout_intents").update({
        salon_promotion_id: salonPromotionId,
        salon_promotion_redemption_id: salonPromotionRedemptionId,
        promotion_discount_amount: salonPromotionDiscount,
        promotion_snapshot: salonPromotionSnapshot,
      }).eq("id", intentId).eq("salon_id", salonId);
      if (promotionIntent.error) throw promotionIntent.error;
      if (commerceIntentId) {
        const alignedPromotion = await admin
          .from("salon_promotion_redemptions")
          .update({
            expires_at: new Date(Date.now() + 35 * 60_000).toISOString(),
          })
          .eq("id", salonPromotionRedemptionId)
          .eq("status", "pending");
        if (alignedPromotion.error) throw alignedPromotion.error;
      }
    }

    let promoReservation: Awaited<ReturnType<typeof reservePromoCode>> | null = null;
    if (promoCode) {
      try {
        promoReservation = await reservePromoCode(promoCode, "booking", { userId: customerId, salonId, bookingIntentId: intentId });
        await admin.from("booking_checkout_intents").update({ promo_code_id: promoReservation.promo_code_id }).eq("id", intentId);
      } catch (promoError) {
        if (commerceIntentId)
          await admin.rpc("release_combined_checkout", {
            p_commerce_intent_id: commerceIntentId,
            p_status: "Failed",
          });
        else
          await admin
            .from("booking_checkout_intents")
            .update({ status: "Failed" })
            .eq("id", intentId);
        throw promoError;
      }
    }

    if (deposit === 0 && !commerceIntentId) {
      const { data: booking, error: bookingError } = await admin.from("bookings").insert({
        ...payload,
        stripe_payment_id: null,
        stripe_checkout_session_id: `no_payment_required:${intentId}`,
        payment_method_label: "No payment required",
        payment_mode: "test",
        payment_verified_at: new Date().toISOString(),
        platform_fee: 0,
        stripe_processing_fee: 0,
        net_amount_owed_salon: deposit,
        payout_status: "Not required",
      }).select("id,public_reference,confirmation_code,status,appointment_datetime").single();
      if (bookingError || !booking) throw bookingError || new Error("The booking could not be confirmed.");
      const { error: intentError } = await admin.from("booking_checkout_intents").update({ status: "Paid", booking_id: booking.id }).eq("id", intentId);
      if (intentError) throw intentError;
      if (promoReservation?.redemption_id) {
        const { error: redemptionError } = await admin.rpc("redeem_promo_code", {
          p_redemption_id: promoReservation.redemption_id,
          p_checkout_session_id: `no_payment_required:${intentId}`,
        });
        if (redemptionError) throw redemptionError;
      }
      let notificationReference: string | null = null;
      try {
        const delivery = await deliverBookingNotifications(booking.id);
        notificationReference = delivery.warnings?.[0]?.request_id || null;
      } catch (notificationError) {
        notificationReference = await capturePlatformError({
          request, admin, error: notificationError, feature: "booking-checkout",
          action: "deliver-zero-deposit-notifications",
          actorRole: customerId ? "customer" : "guest", actorId: customerId || null,
          salonId, recordType: "booking", recordId: booking.id,
          provider: "transactional-notifications",
          safeMessage: "Your booking was confirmed, but one notification could not be delivered.",
        });
      }
      return Response.json({
        booking,
        deposit,
        originalDeposit,
        discount,
        salonPromotionDiscount,
        total,
        noPaymentRequired: true,
        testMode: true,
        warning: notificationReference
          ? {
              message: `Your booking was confirmed, but one notification could not be delivered. Reference ${notificationReference}.`,
              request_id: notificationReference,
            }
          : null,
      });
    }

    const combinedCharge = commerceIntentId
      ? Number(commerceTotals?.total_charged || 0)
      : deposit;
    const connectedAccount = /^acct_[A-Za-z0-9]+$/.test(
      String(salon.stripe_account_id || ""),
    )
      ? String(salon.stripe_account_id)
      : "";
    if (commerceIntentId && combinedCharge <= 0) {
      const completion = await completeCommerceCheckout(
        {
          id: `no_payment_required:${commerceIntentId}`,
          payment_status: "no_payment_required",
          livemode: false,
          metadata: {
            type: "combined_checkout",
            commerce_intent_id: commerceIntentId,
            booking_intent_id: intentId,
            salon_id: salonId,
            connected_account_id: connectedAccount,
          },
        },
        request,
      );
      if (promoReservation?.redemption_id) {
        const redemption = await admin.rpc("redeem_promo_code", {
          p_redemption_id: promoReservation.redemption_id,
          p_checkout_session_id: `no_payment_required:${commerceIntentId}`,
        });
        if (redemption.error) throw redemption.error;
      }
      const { data: booking } = completion?.bookingId
        ? await admin
            .from("bookings")
            .select(
              "id,public_reference,confirmation_code,status,appointment_datetime",
            )
            .eq("id", completion.bookingId)
            .single()
        : { data: null };
      const { data: productOrder } = completion?.orderId
        ? await admin
            .from("product_orders")
            .select(
              "public_reference,payment_status,fulfillment_status,total_amount,fulfillment_method",
            )
            .eq("id", completion.orderId)
            .single()
        : { data: null };
      return Response.json({
        booking: booking
          ? { ...booking, product_order: productOrder || null }
          : null,
        order_id: completion?.orderId,
        combined: true,
        noPaymentRequired: true,
        testMode: true,
      });
    }

    const checkoutExpiresAtSeconds = Math.floor(Date.now() / 1000) + 35 * 60;
    const checkoutExpiresAt = new Date(checkoutExpiresAtSeconds * 1000).toISOString();
    const session = await stripeRequest<{ id: string; url: string }>(
      "/checkout/sessions",
      {
        mode: "payment",
        expires_at: checkoutExpiresAtSeconds,
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": Math.round(
          (commerceIntentId ? combinedCharge : originalDeposit) * 100,
        ),
        "line_items[0][price_data][product_data][name]": commerceIntentId
          ? `${salon.name} products and appointment deposit`
          : `${salon.name} reservation deposit`,
        "line_items[0][quantity]": 1,
        customer_email: guestEmail,
        success_url: commerceIntentId
          ? `${siteUrl(request)}/salon/${salon.slug}/book?commerce_session={CHECKOUT_SESSION_ID}`
          : `${siteUrl(request)}/salon/${salon.slug}/book?booking_session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl(request)}/salon/${salon.slug}/book?payment=cancelled`,
        "metadata[booking_intent_id]": intentId,
        "metadata[commerce_intent_id]": commerceIntentId,
        "metadata[type]": commerceIntentId
          ? "combined_checkout"
          : "booking_deposit",
        "metadata[salon_id]": salonId,
        "metadata[connected_account_id]": connectedAccount,
        "metadata[promo_redemption_id]": promoReservation?.redemption_id || "",
        "metadata[promo_code]": promoReservation?.code || "",
        "metadata[salon_promotion_redemption_id]": salonPromotionRedemptionId,
        "payment_intent_data[description]": commerceIntentId
          ? `Products and ${depositPercentage}% reservation deposit for ${style.name}`
          : `${depositPercentage}% reservation deposit for ${style.name}`,
        allow_promotion_codes: commerceIntentId ? false : !promoReservation,
        ...(!commerceIntentId && promoReservation?.stripe_coupon_id
          ? { "discounts[0][coupon]": promoReservation.stripe_coupon_id }
          : {}),
        ...(connectedAccount
          ? {
              "payment_intent_data[transfer_data][destination]":
                connectedAccount,
            }
          : {}),
      },
      {
        idempotencyKey: `gc-booking-checkout:${commerceIntentId || intentId}`,
      },
    );
    if (!session?.id || !session?.url) {
      throw new Error("Stripe did not return a checkout session. No payment was taken.");
    }
    checkoutSessionCreated = true;
    checkoutSessionId = session.id;
    checkoutSessionUrl = session.url;
    const sessionWarnings: string[] = [];

    const bookingSession = await admin
      .from("booking_checkout_intents")
      .update({
        stripe_checkout_session_id: checkoutSessionId,
        expires_at: checkoutExpiresAt,
      })
      .eq("id", intentId)
      .eq("status", "Pending")
      .select("id")
      .maybeSingle();
    if (bookingSession.error || !bookingSession.data) {
      const reference = await capturePlatformError({
        request,
        admin,
        error: bookingSession.error || new Error("BOOKING_SESSION_LINK_MISSING"),
        feature: "booking-checkout",
        action: "attach-stripe-session-to-booking-hold",
        actorRole: customerId ? "customer" : "guest",
        actorId: customerId,
        salonId,
        recordType: "booking_checkout_intent",
        recordId: intentId,
        provider: "supabase",
        safeMessage: "The secure checkout link remains valid and its appointment hold remains active, but local session evidence needs attention.",
      });
      sessionWarnings.push(
        `The checkout link remains valid, but local session evidence needs attention. Reference ${reference}. Do not create another checkout.`,
      );
    }

    if (commerceIntentId) {
      const commerceSession = await admin
        .from("commerce_checkout_intents")
        .update({
          stripe_checkout_session_id: checkoutSessionId,
          expires_at: checkoutExpiresAt,
        })
        .eq("id", commerceIntentId)
        .eq("status", "Pending")
        .select("id")
        .maybeSingle();
      if (commerceSession.error || !commerceSession.data) {
        const reference = await capturePlatformError({
          request,
          admin,
          error: commerceSession.error || new Error("COMMERCE_SESSION_LINK_MISSING"),
          feature: "booking-checkout",
          action: "attach-stripe-session-to-commerce-hold",
          actorRole: customerId ? "customer" : "guest",
          actorId: customerId,
          salonId,
          recordType: "commerce_checkout_intent",
          recordId: commerceIntentId,
          provider: "supabase",
          safeMessage: "The secure checkout link remains valid and its product holds remain active, but local session evidence needs attention.",
        });
        sessionWarnings.push(
          `The product hold remains active, but local session evidence needs attention. Reference ${reference}.`,
        );
      }
    }

    if (promoReservation?.redemption_id) {
      const promoSession = await admin
        .from("promo_code_redemptions")
        .update({ stripe_checkout_session_id: checkoutSessionId })
        .eq("id", promoReservation.redemption_id);
      if (promoSession.error) {
        const reference = await capturePlatformError({
          request,
          admin,
          error: promoSession.error,
          feature: "booking-checkout",
          action: "attach-stripe-session-to-promo-hold",
          actorRole: customerId ? "customer" : "guest",
          actorId: customerId,
          salonId,
          recordType: "promo_code_redemption",
          recordId: promoReservation.redemption_id,
          provider: "supabase",
          safeMessage: "The checkout link remains valid, but promotion-session evidence needs attention.",
        });
        sessionWarnings.push(
          `The promotion remains reserved, but its session evidence needs attention. Reference ${reference}.`,
        );
      }
    }

    return Response.json({
      url: checkoutSessionUrl,
      deposit,
      originalDeposit,
      discount,
      salonPromotionDiscount,
      total,
      productTotal: commerceIntentId
        ? Number(commerceTotals?.product_total || 0)
        : 0,
      combined: Boolean(commerceIntentId),
      testMode: true,
      warnings: sessionWarnings,
      reconciliation_required: sessionWarnings.length > 0,
    });
  } catch (error) {
  } catch (error) {
    const deliveryUncertain =
      (error as { deliveryUncertain?: boolean }).deliveryUncertain === true;
    if ((checkoutSessionCreated || deliveryUncertain) && intentId) {
      let reference: string | null = null;
      try {
        reference = await capturePlatformError({
          request,
          admin,
          error,
          feature: "booking-checkout",
          action: checkoutSessionCreated
            ? "reconcile-created-checkout-session"
            : "reconcile-uncertain-checkout-session",
          actorRole: "guest",
          salonId: null,
          recordType: commerceIntentId
            ? "commerce_checkout_intent"
            : "booking_checkout_intent",
          recordId: commerceIntentId || intentId,
          provider: "stripe",
          safeMessage: checkoutSessionCreated
            ? "The secure checkout link exists and all holds remain active, but local follow-up needs attention."
            : "Stripe may have received the checkout request, so all holds remain active until the outcome is reconciled.",
        });
      } catch (monitoringError) {
        noteOperationalFailure("Checkout reconciliation monitoring failed", monitoringError);
      }

      if (checkoutSessionCreated) {
        return Response.json({
          url: checkoutSessionUrl,
          warning: reference
            ? `The secure checkout link remains valid and all holds remain active, but local follow-up needs attention. Reference ${reference}. Do not create another checkout.`
            : "The secure checkout link remains valid and all holds remain active, but local follow-up needs attention. Do not create another checkout.",
          reconciliation_required: true,
        });
      }

      return Response.json(
        {
          error: reference
            ? `Stripe did not confirm whether checkout was created. The appointment and product holds remain active. Do not create another checkout until reference ${reference} is reviewed or the holds expire.`
            : "Stripe did not confirm whether checkout was created. The appointment and product holds remain active. Do not create another checkout until the incident is reviewed or the holds expire.",
          reference,
          booking_intent_id: intentId,
          commerce_intent_id: commerceIntentId || null,
          reconciliation_required: true,
        },
        { status: 502, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (commerceIntentId)
      await admin.rpc("release_combined_checkout", {
        p_commerce_intent_id: commerceIntentId,
        p_status: "Failed",
      });
    else if (intentId)
      await admin
        .from("booking_checkout_intents")
        .update({ status: "Failed" })
        .eq("id", intentId);
    if (salonPromotionRedemptionId) {
      await admin.rpc("cancel_salon_promotion_reservation", {
        p_redemption_id: salonPromotionRedemptionId,
      });
    }
    noteOperationalFailure("Booking checkout failed", error);
    return errorResponse(error, "Unable to start secure checkout.");
  }
}
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/stripe/booking-checkout", "POST"), POSTHandler);
