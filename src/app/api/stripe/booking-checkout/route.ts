import { bookingAvailability, nextAvailableSlot } from "@/lib/bookingAvailabilityServer";
import { salonTimeZone, zonedLocalToUtc } from "@/lib/dateTime";
import { cleanEmail, cleanText, cleanUsPhone, enforceRateLimit, errorResponse, rejectBot } from "@/lib/requestSecurity";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { siteUrl, stripeRequest } from "@/lib/stripeServer";
import { previewPromoCode, reservePromoCode } from "@/lib/promoCodes";

type PriceOption = { value?: string; label?: string; price_add?: number | string };
const options = (value: unknown): PriceOption[] => Array.isArray(value) ? value as PriceOption[] : [];
type ServiceOption = PriceOption & { duration_add_minutes?: number | string };
type ServiceOptionGroup = { id?: string; label?: string; selection?: string; required?: boolean; options?: ServiceOption[] };
const optionGroups = (value: unknown): ServiceOptionGroup[] => Array.isArray(value) ? value as ServiceOptionGroup[] : [];

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  let intentId = "";
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

    const { data: salon, error: salonError } = await admin.from("salons").select("id,slug,name,status,subscription_status,time_zone").eq("id", salonId).single();
    if (salonError) throw new Error(`Unable to verify the salon: ${salonError.message}`);
    if (!salon || salon.status !== "Active" || !["active", "trialing"].includes(String(salon.subscription_status).toLowerCase())) throw new Error("This salon is not currently accepting marketplace bookings.");
    const { data: style, error: styleError } = await admin.from("styles").select("*,service_category:service_categories(slug)").eq("id", styleId).eq("salon_id", salonId).single();
    if (styleError || !style) throw new Error(styleError ? `Unable to verify the selected style: ${styleError.message}` : "The selected style is not available.");

    const guestName = cleanText(body.guest_name, 120);
    const guestEmail = cleanEmail(body.guest_email);
    const guestPhone = cleanUsPhone(body.guest_phone, true);
    if (!guestName) throw new Error("Enter your name.");
    const appointmentLocal = cleanText(body.appointment_local, 20);
    const [localDate, localTime] = appointmentLocal.split("T");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate || "") || !/^\d{2}:\d{2}$/.test(localTime || "")) throw new Error("Choose a valid appointment date and time.");
    const timeZone = salonTimeZone(salon.time_zone);
    const appointment = zonedLocalToUtc(appointmentLocal, timeZone);
    if (appointment.getTime() < Date.now() + 30 * 60_000) throw new Error("Choose a future appointment time.");

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
    const categoryRecord = Array.isArray(style.service_category) ? style.service_category[0] : style.service_category;
    const clientProvidesMaterial = categoryRecord?.slug === "braiding" && body.client_provides_material === true;
    const materialPriceAdjustment = clientProvidesMaterial ? Math.max(0, Number(style.own_material_price_reduction || 0)) : 0;
    const materialDurationAdjustmentMinutes = clientProvidesMaterial ? Math.max(0, Math.round(Number(style.own_material_duration_reduction_minutes || 0))) : 0;
    if (clientProvidesMaterial) total -= materialPriceAdjustment;
    total = Math.max(1, Math.round(total * 100) / 100);
    if (!(total > 0) || total > 5000) throw new Error("The booking total could not be verified.");
    const originalDeposit = Math.round(total * 10) / 100;
    const promoCode = cleanText(body.promo_code, 40);
    const promoPreview = promoCode ? await previewPromoCode(promoCode, "booking", originalDeposit) : null;
    const deposit = promoPreview?.amountAfterDiscount ?? originalDeposit;
    const discount = promoPreview?.discount || 0;
    const durationHours = Math.max(0.25, Number(style.duration_min_hours || style.duration_max_hours || 0) + genericDurationAdjustmentMinutes / 60 - materialDurationAdjustmentMinutes / 60);
    const bufferMinutes = Math.max(0, Number(style.buffer_minutes ?? liveAvailability.bufferMinutes ?? 15));
    const payload = {
      customer_id: customerId,
      salon_id: salonId,
      style_id: styleId,
      stylist_id: stylistId,
      selected_size: selectedSize || null,
      selected_length: selectedLength || null,
      selected_material_id: materialId,
      selected_addons: selectedAddons,
      selected_options: selectedOptions,
      client_notes: cleanText(body.client_notes, 1000) || null,
      client_provides_material: clientProvidesMaterial,
      material_price_adjustment: clientProvidesMaterial ? -materialPriceAdjustment : 0,
      material_duration_adjustment_minutes: clientProvidesMaterial ? -materialDurationAdjustmentMinutes : 0,
      appointment_datetime: appointment.toISOString(),
      duration_hours: durationHours,
      buffer_minutes: bufferMinutes,
      estimated_total: total,
      deposit_amount: deposit,
      original_deposit_amount: originalDeposit,
      discount_amount: discount,
      promo_code_id: promoPreview?.promo.id || null,
      promo_code: promoPreview?.promo.code || null,
      balance_due: Math.round((total - deposit) * 100) / 100,
      confirmation_code: `GC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      status: "Confirmed",
      deposit_status: "Paid",
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      source: "Website",
    };

    const { data: reservationId, error: reservationError } = await admin.rpc("reserve_booking_checkout", {
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
    });
    if (reservationError || !reservationId) {
      if (/CONFLICT|exclusion/i.test(reservationError?.message || "")) {
        const next = await nextAvailableSlot({ salonId, styleId, stylistId: requestedStylistId, customerId, guestEmail, afterDate: localDate, afterTime: localTime });
        return Response.json({ error: "That time was just reserved by another customer.", next_available: next }, { status: 409 });
      }
      throw reservationError || new Error("The secure booking reservation could not be created.");
    }
    intentId = String(reservationId);

    let promoReservation: Awaited<ReturnType<typeof reservePromoCode>> | null = null;
    if (promoCode) {
      try {
        promoReservation = await reservePromoCode(promoCode, "booking", { userId: customerId, salonId, bookingIntentId: intentId });
        await admin.from("booking_checkout_intents").update({ promo_code_id: promoReservation.promo_code_id }).eq("id", intentId);
      } catch (promoError) {
        await admin.from("booking_checkout_intents").update({ status: "Failed" }).eq("id", intentId);
        throw promoError;
      }
    }

    const session = await stripeRequest<{ id: string; url: string }>("/checkout/sessions", {
      mode: "payment",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": Math.round(originalDeposit * 100),
      "line_items[0][price_data][product_data][name]": `${salon.name} reservation deposit`,
      "line_items[0][quantity]": 1,
      customer_email: guestEmail,
      success_url: `${siteUrl(request)}/salon/${salon.slug}/book?booking_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl(request)}/salon/${salon.slug}/book?payment=cancelled`,
      "metadata[booking_intent_id]": intentId,
      "metadata[type]": "booking_deposit",
      "metadata[salon_id]": salonId,
      "metadata[promo_redemption_id]": promoReservation?.redemption_id || "",
      "metadata[promo_code]": promoReservation?.code || "",
      "payment_intent_data[description]": `10% reservation deposit for ${style.name}`,
      allow_promotion_codes: !promoReservation,
      ...(promoReservation?.stripe_coupon_id ? { "discounts[0][coupon]": promoReservation.stripe_coupon_id } : {}),
    });
    if (!session?.id || !session?.url) throw new Error("Stripe did not return a checkout session. No payment was taken.");
    const { error: sessionError } = await admin.from("booking_checkout_intents").update({ stripe_checkout_session_id: session.id }).eq("id", intentId);
    if (sessionError) throw sessionError;
    if (promoReservation?.redemption_id) await admin.from("promo_code_redemptions").update({ stripe_checkout_session_id: session.id }).eq("id", promoReservation.redemption_id);
    return Response.json({ url: session.url, deposit, originalDeposit, discount, total, testMode: true });
  } catch (error) {
    if (intentId) await admin.from("booking_checkout_intents").update({ status: "Failed" }).eq("id", intentId);
    console.error("Booking checkout failed", error);
    return errorResponse(error, "Unable to start secure checkout.");
  }
}
