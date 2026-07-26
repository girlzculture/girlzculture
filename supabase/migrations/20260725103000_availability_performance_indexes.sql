-- Keep availability reads bounded as bookings and checkout holds grow. All
-- definitions are additive and safe for an existing production database.
create index if not exists bookings_active_salon_datetime_idx
  on public.bookings (salon_id, appointment_datetime, blocked_until)
  where is_active_booking = true;

create index if not exists bookings_active_stylist_datetime_idx
  on public.bookings (stylist_id, appointment_datetime, blocked_until)
  where is_active_booking = true and stylist_id is not null;

create index if not exists bookings_active_customer_datetime_idx
  on public.bookings (customer_id, appointment_datetime, blocked_until)
  where is_active_booking = true and customer_id is not null;

create index if not exists bookings_active_guest_email_datetime_idx
  on public.bookings (normalized_guest_email, appointment_datetime, blocked_until)
  where is_active_booking = true and normalized_guest_email is not null;

create index if not exists booking_checkout_intents_pending_salon_datetime_idx
  on public.booking_checkout_intents (salon_id, appointment_datetime, blocked_until, expires_at)
  where is_pending_intent = true;

create index if not exists booking_checkout_intents_pending_stylist_datetime_idx
  on public.booking_checkout_intents (stylist_id, appointment_datetime, blocked_until, expires_at)
  where is_pending_intent = true and stylist_id is not null;

create index if not exists salon_blockouts_range_lookup_idx
  on public.salon_blockouts (salon_id, starts_at, ends_at);
