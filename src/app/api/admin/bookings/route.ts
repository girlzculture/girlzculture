import { noteOperationalFailure, routeMonitoringProfile, withOperationalMonitoring } from "@/lib/operationalMonitoring";
import { capturePlatformError } from "@/lib/platformErrors";
import { bookingAvailability, nextAvailableSlot } from "@/lib/bookingAvailabilityServer";
import { salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { cleanEmail, cleanText, cleanUsPhone, enforceRateLimit, errorResponse } from "@/lib/requestSecurity";
import { deliverBookingNotifications, requireAdminPermission, sendEmail, sendSms } from "@/lib/supabaseAdmin";
import { getEngineNumber } from "@/lib/engineConfigServer";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";

const PAYMENT_METHODS = new Set([
  "send_link",
  "waive",
  "paid_outside",
  "collect_at_salon",
  "no_deposit",
]);

function escapeHtml(value: unknown) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

function safeSearch(value: string) {
  return value.replace(/[%_,()]/g, "");
}

async function GETHandler(request: Request) {
  try {
    enforceRateLimit(request, "admin-manual-booking-options", 120, 10 * 60_000);
    const { admin } = await requireAdminPermission(request, "bookings");
    const params = new URL(request.url).searchParams;
    const salonId = cleanText(params.get("salon_id"), 50);
    const styleId = cleanText(params.get("style_id"), 50);
    const date = cleanText(params.get("date"), 10);
    const guestEmail = cleanEmail(params.get("guest_email"));
    const customerQuery = safeSearch(cleanText(params.get("customer_q"), 100));

    const response: Record<string, unknown> = {};
    if (customerQuery.length >= 2) {
      const { data, error } = await admin
        .from("customers")
        .select("id,name,email,phone,status,created_at")
        .or(`name.ilike.%${customerQuery}%,email.ilike.%${customerQuery}%,phone.ilike.%${customerQuery}%`)
        .order("name", { ascending: true })
        .limit(20);
      if (error) throw error;
      response.customers = data || [];
    }

    if (salonId) {
      const [salonResult, styleResult, stylistResult] = await Promise.all([
        admin
          .from("salons")
          .select("id,name,slug,time_zone,status,email,phone,address_street,address_line2,address_city,address_state,address_zip,stripe_account_id")
          .eq("id", salonId)
          .maybeSingle(),
        admin
          .from("styles")
          .select("*")
          .eq("salon_id", salonId)
          .is("archived_at", null)
          .order("name", { ascending: true }),
        admin
          .from("stylists")
          .select("*")
          .eq("salon_id", salonId)
          .is("archived_at", null)
          .order("name", { ascending: true }),
      ]);
      if (salonResult.error) throw salonResult.error;
      if (styleResult.error) throw styleResult.error;
      if (stylistResult.error) throw stylistResult.error;
      if (!salonResult.data) return Response.json({ error: "Salon not found." }, { status: 404 });
      response.salon = salonResult.data;
      response.styles = (styleResult.data || []).filter((row) => row.is_active !== false && !/archived/i.test(String(row.status || "")));
      response.stylists = (stylistResult.data || []).filter((row) => row.is_active !== false && !/archived/i.test(String(row.status || "")));

      if (styleId && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const availability = await bookingAvailability({
          salonId,
          styleId,
          guestEmail,
          date,
        });
        response.slots = availability.slots;
        response.buffer_minutes = availability.bufferMinutes;
        response.time_zone = salonTimeZone(salonResult.data.time_zone);
      }
    }

    return Response.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    noteOperationalFailure("Admin manual booking options failed", error);
    return errorResponse(error, "Unable to load booking options.");
  }
}

async function POSTHandler(request: Request) {
  let adminForFailure: Awaited<ReturnType<typeof requireAdminPermission>>["admin"] | undefined;
  let reservedIntentId = "";
  let reservedSalonId = "";
  let reservedTotal = 0;
  let reservedDeposit = 0;
  let reservedBalance = 0;
  let checkoutSessionCreated = false;
  let checkoutSessionId = "";
  let checkoutSessionUrl = "";
  let checkoutExpiresAt = "";
  try {
    enforceRateLimit(request, "admin-manual-booking", 30, 10 * 60_000);
    const { admin, user } = await requireAdminPermission(request, "bookings");
    adminForFailure = admin;
    const body = await request.json() as Record<string, unknown>;
    const salonId = cleanText(body.salon_id, 50);
    const styleId = cleanText(body.style_id, 50);
    const requestedStylistId = cleanText(body.stylist_id, 50) || null;
    const customerId = cleanText(body.customer_id, 50) || null;
    let guestName = cleanText(body.guest_name, 120);
    let guestEmail = cleanEmail(body.guest_email);
    let guestPhone = cleanUsPhone(body.guest_phone, true);
    const appointmentLocal = cleanText(body.appointment_local, 20);
    const paymentMethod = cleanText(body.payment_method, 40) || "send_link";
    if (!PAYMENT_METHODS.has(paymentMethod)) throw new Error("Choose a supported deposit option.");
    const [localDate, localTime] = appointmentLocal.split("T");
    if (!salonId || !styleId || !/^\d{4}-\d{2}-\d{2}$/.test(localDate || "") || !/^\d{2}:\d{2}$/.test(localTime || "")) {
      throw new Error("Salon, service, and an available appointment time are required.");
    }

    if (customerId) {
      const customer = await admin
        .from("customers")
        .select("id,name,email,phone")
        .eq("id", customerId)
        .maybeSingle();
      if (customer.error) throw customer.error;
      if (!customer.data) throw new Error("The selected customer account is no longer available.");
      guestName ||= cleanText(customer.data.name, 120);
      guestEmail ||= cleanEmail(customer.data.email);
      guestPhone ||= cleanUsPhone(customer.data.phone, true);
    }
    if (!guestName) throw new Error("Enter the customer name.");
    if (paymentMethod === "send_link" && !guestEmail) throw new Error("A valid customer email is required to send a Stripe deposit link.");

    const [salonResult, styleResult] = await Promise.all([
      admin
        .from("salons")
        .select("id,name,slug,time_zone,status,stripe_account_id")
        .eq("id", salonId)
        .maybeSingle(),
      admin
        .from("styles")
        .select("*")
        .eq("id", styleId)
        .eq("salon_id", salonId)
        .is("archived_at", null)
        .maybeSingle(),
    ]);
    if (salonResult.error) throw salonResult.error;
    if (styleResult.error) throw styleResult.error;
    const salon = salonResult.data;
    const style = styleResult.data;
    if (!salon) throw new Error("Salon not found.");
    if (!style || style.is_active === false) throw new Error("The selected service is not currently active.");

    if (requestedStylistId) {
      const stylist = await admin
        .from("stylists")
        .select("id")
        .eq("id", requestedStylistId)
        .eq("salon_id", salonId)
        .eq("is_active", true)
        .maybeSingle();
      if (stylist.error) throw stylist.error;
      if (!stylist.data) throw new Error("The selected stylist is not currently available at this salon.");
    }

    const timeZone = salonTimeZone(salon.time_zone);
    const appointment = zonedLocalToUtc(appointmentLocal, timeZone);
    const liveAvailability = await bookingAvailability({
      salonId,
      styleId,
      stylistId: requestedStylistId,
      customerId,
      guestEmail,
      date: localDate,
    });
    const selectedSlot = liveAvailability.slots.find((slot) =>
      slot.value === localTime && (!requestedStylistId || slot.stylistId === requestedStylistId),
    );
    if (!selectedSlot) {
      const next = await nextAvailableSlot({
        salonId,
        styleId,
        stylistId: requestedStylistId,
        customerId,
        guestEmail,
        afterDate: localDate,
        afterTime: localTime,
      });
      return Response.json({ error: "That time is no longer available.", next_available: next }, { status: 409 });
    }
    const stylistId = requestedStylistId || selectedSlot.stylistId;
    const total = Math.max(0, Math.round(Number(style.base_price || style.price_display_min || 0) * 100) / 100);
    if (!Number.isFinite(total) || total > 10_000) throw new Error("The service price could not be verified.");
    const depositPercentage = await getEngineNumber("booking.deposit_percentage", 10, 0, 100);
    const calculatedDeposit = Math.round(total * depositPercentage) / 100;
    const durationHours = Math.max(0.25, Number(style.duration_min_hours || style.duration_max_hours || 0.25));
    const bufferMinutes = Math.max(0, Number(style.buffer_minutes ?? liveAvailability.bufferMinutes ?? 15));
    const basePayload = {
      customer_id: customerId,
      salon_id: salonId,
      style_id: styleId,
      stylist_id: stylistId,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone || null,
      appointment_datetime: appointment.toISOString(),
      duration_hours: durationHours,
      buffer_minutes: bufferMinutes,
      estimated_total: total,
      deposit_percentage: depositPercentage,
      confirmation_code: `GC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      status: "Confirmed",
      source: "Admin",
    };

    if (paymentMethod === "send_link" && calculatedDeposit > 0) {
      const intentPayload = {
        ...basePayload,
        deposit_amount: calculatedDeposit,
        original_deposit_amount: calculatedDeposit,
        discount_amount: 0,
        balance_due: Math.round((total - calculatedDeposit) * 100) / 100,
        deposit_status: "Paid",
      };
      const reservation = await admin.rpc("reserve_booking_checkout", {
        p_salon_id: salonId,
        p_style_id: styleId,
        p_stylist_id: stylistId,
        p_customer_id: customerId,
        p_guest_email: guestEmail,
        p_appointment_datetime: appointment.toISOString(),
        p_duration_hours: durationHours,
        p_buffer_minutes: bufferMinutes,
        p_payload: intentPayload,
        p_total_amount: total,
        p_deposit_amount: calculatedDeposit,
      });
      if (reservation.error || !reservation.data) {
        if (/CONFLICT|exclusion/i.test(reservation.error?.message || "")) {
          return Response.json({ error: "That appointment was just reserved by another customer." }, { status: 409 });
        }
        throw reservation.error || new Error("The secure appointment hold could not be created.");
      }
      reservedIntentId = String(reservation.data);
      reservedSalonId = salonId;
      reservedTotal = total;
      reservedDeposit = calculatedDeposit;
      reservedBalance = Math.round((total - calculatedDeposit) * 100) / 100;
      const checkoutExpiresAtSeconds = Math.floor(Date.now() / 1000) + 35 * 60;
      checkoutExpiresAt = new Date(checkoutExpiresAtSeconds * 1000).toISOString();
      const session = await stripeRequest<{ id: string; url: string }>(
        "/checkout/sessions",
        {
          mode: "payment",
          expires_at: checkoutExpiresAtSeconds,
          "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][unit_amount]": Math.round(calculatedDeposit * 100),
          "line_items[0][price_data][product_data][name]": `${salon.name} reservation deposit`,
          "line_items[0][quantity]": 1,
          customer_email: guestEmail,
          success_url: `${siteUrl(request)}/salon/${salon.slug}/book?booking_session={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl(request)}/salon/${salon.slug}/book?payment=cancelled`,
          "metadata[booking_intent_id]": reservedIntentId,
          "metadata[type]": "booking_deposit",
          "metadata[salon_id]": salonId,
          "metadata[created_by_admin]": user.id,
          "payment_intent_data[description]": `${depositPercentage}% reservation deposit for ${style.name || "salon service"}`,
        },
        { idempotencyKey: `gc-admin-booking-checkout:${reservedIntentId}` },
      );
      if (!session?.id || !session?.url) {
        throw new Error("Stripe did not return a secure checkout link. No payment was taken.");
      }
      checkoutSessionCreated = true;
      checkoutSessionId = session.id;
      checkoutSessionUrl = session.url;
      const updatedIntent = await admin
        .from("booking_checkout_intents")
        .update({
          stripe_checkout_session_id: checkoutSessionId,
          expires_at: checkoutExpiresAt,
        })
        .eq("id", reservedIntentId)
        .eq("status", "Pending")
        .select("id")
        .maybeSingle();
      if (updatedIntent.error || !updatedIntent.data) {
        throw updatedIntent.error || new Error("The secure payment link could not be attached to its appointment hold.");
      }

      const deliveryWarnings: string[] = [];
      const deliveryWarnings: string[] = [];
      try {
        const appointmentText = new Intl.DateTimeFormat("en-US", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone,
        }).format(appointment);
        const result = await sendEmail(
          guestEmail,
          `Complete your ${salon.name} appointment deposit`,
          `<p>Hello ${escapeHtml(guestName)},</p><p>Girlz Culture prepared an appointment for <strong>${escapeHtml(style.name || "your selected service")}</strong> at <strong>${escapeHtml(salon.name)}</strong> on ${escapeHtml(appointmentText)}.</p><p>Complete the ${escapeHtml(`$${calculatedDeposit.toFixed(2)}`)} deposit through the secure Stripe link below. The appointment is confirmed only after Stripe verifies payment.</p><p><a href="${escapeHtml(session.url)}">Pay the appointment deposit</a></p><p>This link expires in 35 minutes.</p>`,
          "bookings",
          { idempotencyKey: `admin-booking-link:${reservedIntentId}:email` },
        );
        if ((result as { skipped?: boolean })?.skipped) deliveryWarnings.push("Email delivery is not configured; copy the link and send it to the customer.");
      } catch (deliveryError) {
        const reference = await capturePlatformError({
          request,
          admin,
          error: deliveryError,
          feature: "admin-bookings",
          action: "send-deposit-link-email",
          actorRole: "admin",
          actorId: user.id,
          salonId,
          recordType: "booking_checkout_intent",
          recordId: reservedIntentId,
          provider: "resend",
          safeMessage: "The secure payment link was created, but the email was not delivered.",
        });
        deliveryWarnings.push(`Email was not delivered. Reference ${reference}.`);
      }
      if (guestPhone) {
        try {
          const result = await sendSms(
            guestPhone,
            `Girlz Culture: complete your ${salon.name} appointment deposit here: ${session.url}`,
          );
          if ((result as { skipped?: boolean })?.skipped) deliveryWarnings.push("Text delivery is not configured.");
        } catch (deliveryError) {
          const reference = await capturePlatformError({
            request,
            admin,
            error: deliveryError,
            feature: "admin-bookings",
            action: "send-deposit-link-sms",
            actorRole: "admin",
            actorId: user.id,
            salonId,
            recordType: "booking_checkout_intent",
            recordId: reservedIntentId,
            provider: "twilio",
            safeMessage: "The secure payment link was created, but the text message was not delivered.",
          });
          deliveryWarnings.push(`Text message was not delivered. Reference ${reference}.`);
        }
      }
      try {
        const audit = await admin.from("record_management_events").insert({
          record_type: "booking_checkout_intent",
          record_id: reservedIntentId,
          record_label: `${guestName} · ${salon.name}`,
          action: "Created",
          dependency_summary: { salon_id: salonId, style_id: styleId, stylist_id: stylistId },
          after_values: {
            payment_method: "send_link",
            deposit_amount: calculatedDeposit,
            appointment_datetime: appointment.toISOString(),
            stripe_checkout_session_id: checkoutSessionId,
          },
          reason: "Platform Admin prepared an appointment and generated a secure customer deposit link.",
          acting_user_id: user.id,
          acting_scope: "platform_admin",
        });
        if (audit.error) throw audit.error;
      } catch (auditError) {
        const reference = await capturePlatformError({
          request,
          admin,
          error: auditError,
          feature: "admin-bookings",
          action: "audit-deposit-link",
          actorRole: "admin",
          actorId: user.id,
          salonId,
          recordType: "booking_checkout_intent",
          recordId: reservedIntentId,
          provider: "supabase",
          safeMessage: "The secure payment link remains valid, but its administrative audit entry needs attention.",
        });
        deliveryWarnings.push(
          `The payment link remains valid, but its administrative audit entry needs attention. Reference ${reference}.`,
        );
      }
      return Response.json({
      return Response.json({
        ok: true,
        state: "Awaiting customer payment",
        payment_link: checkoutSessionUrl,
        booking_intent_id: reservedIntentId,
        checkout_session_id: checkoutSessionId,
        expires_at: checkoutExpiresAt,
        total: reservedTotal,
        deposit: reservedDeposit,
        balance_due: reservedBalance,
        warnings: deliveryWarnings,
      });
    }

    const depositAmount = paymentMethod === "paid_outside" ? calculatedDeposit : 0;
    const balanceDue = paymentMethod === "paid_outside"
      ? Math.round((total - calculatedDeposit) * 100) / 100
      : total;
    const labels: Record<string, { depositStatus: string; paymentMethodLabel: string; auditLabel: string }> = {
      waive: { depositStatus: "Waived by Platform Admin", paymentMethodLabel: "Admin deposit waiver", auditLabel: "Deposit waived" },
      paid_outside: { depositStatus: "Paid outside platform", paymentMethodLabel: "External payment confirmed by Platform Admin", auditLabel: "Deposit recorded outside Girlz Culture" },
      collect_at_salon: { depositStatus: "Due at salon", paymentMethodLabel: "Collect at salon", auditLabel: "Deposit deferred to salon" },
      no_deposit: { depositStatus: "No Payment Required", paymentMethodLabel: "No deposit required", auditLabel: "No deposit required" },
      send_link: { depositStatus: "No Payment Required", paymentMethodLabel: "No deposit required", auditLabel: "No deposit required because calculated deposit is zero" },
    };
    const selectedLabel = labels[paymentMethod] || labels.no_deposit;
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .insert({
        ...basePayload,
        deposit_amount: depositAmount,
        balance_due: balanceDue,
        deposit_status: selectedLabel.depositStatus,
        payment_method_label: selectedLabel.paymentMethodLabel,
        stripe_payment_id: null,
        stripe_checkout_session_id: null,
        payment_verified_at: paymentMethod === "paid_outside" ? new Date().toISOString() : null,
        platform_fee: 0,
        stripe_processing_fee: 0,
        net_amount_owed_salon: 0,
        payout_status: "Not required",
      })
      .select("id,public_reference,confirmation_code,status,appointment_datetime")
      .single();
    if (bookingError || !booking) {
      if (bookingError?.code === "23P01") return Response.json({ error: "That appointment overlaps an existing booking." }, { status: 409 });
      throw bookingError || new Error("The booking could not be created.");
    }
    const audit = await admin.from("record_management_events").insert({
      record_type: "booking",
      record_id: booking.id,
      record_label: `${guestName} · ${salon.name}`,
      action: "Created",
      dependency_summary: { salon_id: salonId, style_id: styleId, stylist_id: stylistId },
      after_values: { payment_method: paymentMethod, deposit_status: selectedLabel.depositStatus, deposit_amount: depositAmount, appointment_datetime: appointment.toISOString() },
      reason: `Platform Admin override selected: ${selectedLabel.auditLabel}.`,
      acting_user_id: user.id,
      acting_scope: "platform_admin",
    });
    if (audit.error) {
      await admin.from("bookings").delete().eq("id", booking.id);
      throw audit.error;
    }
    let notificationReference: string | null = null;
    try {
      const delivery = await deliverBookingNotifications(booking.id);
      notificationReference = delivery.warnings?.[0]?.request_id || null;
    } catch (notificationError) {
      notificationReference = await capturePlatformError({
        request,
        admin,
        error: notificationError,
        feature: "admin-bookings",
        action: "deliver-manual-booking-notifications",
        actorRole: "admin",
        actorId: user.id,
        salonId,
        recordType: "booking",
        recordId: booking.id,
        provider: "transactional-notifications",
        safeMessage: "The booking was created, but one notification could not be delivered.",
      });
    }
    return Response.json({
      ok: true,
      state: "Confirmed",
      booking,
      public_reference: booking.public_reference,
      total,
      deposit: depositAmount,
      balance_due: balanceDue,
      warning: notificationReference
        ? { message: `The booking was created, but one notification could not be delivered. Reference ${notificationReference}.`, request_id: notificationReference }
        : null,
    });
  } catch (error) {
    const deliveryUncertain =
      (error as { deliveryUncertain?: boolean }).deliveryUncertain === true;

    if (reservedIntentId && adminForFailure && (checkoutSessionCreated || deliveryUncertain)) {
      let reference: string | null = null;
      try {
        reference = await capturePlatformError({
          request,
          admin: adminForFailure,
          error,
          feature: "admin-bookings",
          action: checkoutSessionCreated
            ? "reconcile-created-deposit-link"
            : "reconcile-uncertain-deposit-link",
          actorRole: "admin",
          salonId: reservedSalonId || null,
          recordType: "booking_checkout_intent",
          recordId: reservedIntentId,
          provider: "stripe",
          safeMessage: checkoutSessionCreated
            ? "The secure payment link exists and the appointment hold remains active, but local follow-up needs attention."
            : "Stripe may have received the checkout request, so the appointment hold remains active until the outcome is reconciled.",
        });
      } catch (monitoringError) {
        noteOperationalFailure("Admin booking reconciliation monitoring failed", monitoringError);
      }

      if (checkoutSessionCreated) {
        const warnings = [
          reference
            ? `The secure payment link remains valid and its appointment hold remains active, but local follow-up needs attention. Reference ${reference}. Do not create another link.`
            : "The secure payment link remains valid and its appointment hold remains active, but local follow-up needs attention. Do not create another link.",
        ];
        const retry = await adminForFailure
          .from("booking_checkout_intents")
          .update({
            stripe_checkout_session_id: checkoutSessionId,
            expires_at: checkoutExpiresAt || undefined,
          })
          .eq("id", reservedIntentId)
          .eq("status", "Pending");
        if (retry.error) {
          warnings.push(
            "The link could not be reattached to its local record. Keep this incident open until Stripe payment or expiration is confirmed.",
          );
        }
        return Response.json({
          ok: true,
          state: "Awaiting customer payment",
          payment_link: checkoutSessionUrl,
          booking_intent_id: reservedIntentId,
          checkout_session_id: checkoutSessionId,
          expires_at: checkoutExpiresAt,
          total: reservedTotal,
          deposit: reservedDeposit,
          balance_due: reservedBalance,
          warnings,
          reconciliation_required: true,
        });
      }

      return Response.json(
        {
          error: reference
            ? `Stripe did not confirm whether the payment link was created. The appointment hold remains active. Do not create another link until reference ${reference} is reviewed or the hold expires.`
            : "Stripe did not confirm whether the payment link was created. The appointment hold remains active. Do not create another link until the incident is reviewed or the hold expires.",
          reference,
          booking_intent_id: reservedIntentId,
          reconciliation_required: true,
        },
        { status: 502, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (reservedIntentId && adminForFailure) {
      await adminForFailure
        .from("booking_checkout_intents")
        .update({ status: "Failed" })
        .eq("id", reservedIntentId)
        .eq("status", "Pending");
    }
    noteOperationalFailure("Admin manual booking failed", error);
    return errorResponse(error, "Unable to create booking.");
  }
}

export const GET = withOperationalMonitoring(routeMonitoringProfile("/api/admin/bookings", "GET"), GETHandler);
export const POST = withOperationalMonitoring(routeMonitoringProfile("/api/admin/bookings", "POST"), POSTHandler);