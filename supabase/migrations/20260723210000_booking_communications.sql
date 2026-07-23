begin;

alter table if exists public.bookings
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_receipt_url text,
  add column if not exists payment_method_label text,
  add column if not exists payment_mode text
    check (payment_mode in ('test','live'));

insert into public.engine_settings(
  setting_key,category,display_name,description,value_type,
  draft_value,published_value,status,impact_level,validation,help_text,
  impact_description,is_public,is_secret_status,sort_order,affected_surfaces
)
values
('notifications.sender_name','notifications','Transactional sender name','Display name used for Girlz Culture transactional email.','text','"Girlz Culture"','"Girlz Culture"','Published','customer','{"minLength":2,"maxLength":60}','The verified sender address remains deployment-controlled.','Affects future transactional emails without changing the verified address.',false,false,70,array['Booking email','Account email','Support email']),
('notifications.reply_to_email','notifications','Transactional reply-to email','Verified support inbox used as reply-to for booking communication.','text','"support@girlzculture.com"','"support@girlzculture.com"','Published','customer','{"minLength":5,"maxLength":160}','Use a monitored Girlz Culture inbox.','Affects future replies; sender verification remains deployment-controlled.',false,false,80,array['Booking email']),
('notifications.booking_confirmation_intro','notifications','Booking confirmation introduction','Editable introduction shown before the locked booking and financial breakdown.','text','"Your appointment is secured. Keep this message for your records."','"Your appointment is secured. Keep this message for your records."','Published','customer','{"minLength":5,"maxLength":400}','Required booking, payment and policy fields are appended by the platform and cannot be removed.','Affects future customer and salon confirmations.',false,false,90,array['Customer booking email','Salon booking email']),
('notifications.booking_cancellation_intro','notifications','Booking cancellation introduction','Editable introduction shown before the locked cancellation breakdown.','text','"This booking has been cancelled. The complete record is below."','"This booking has been cancelled. The complete record is below."','Published','customer','{"minLength":5,"maxLength":400}','Required cancellation and refund fields are appended by the platform and cannot be removed.','Affects future customer and salon cancellation emails.',false,false,100,array['Customer cancellation email','Salon cancellation email']),
('notifications.booking_policy_summary','notifications','Booking policy summary','Cancellation and rescheduling policy included in every confirmation.','textarea','"Use the secure Manage Booking link to cancel or respond to a reschedule. Deposit treatment follows the terms accepted at checkout."','"Use the secure Manage Booking link to cancel or respond to a reschedule. Deposit treatment follows the terms accepted at checkout."','Published','customer','{"minLength":20,"maxLength":1200}','Keep this aligned with founder-approved booking terms.','Affects future confirmations; financial facts remain locked.',false,false,110,array['Customer booking email']),
('notifications.booking_email_footer','notifications','Booking email footer','Short support and security footer for booking communication.','text','"Only use Girlz Culture links from this message. Contact support if you did not make this booking."','"Only use Girlz Culture links from this message. Contact support if you did not make this booking."','Published','customer','{"minLength":5,"maxLength":400}','Do not request passwords or card details by email.','Affects future booking communication.',false,false,120,array['Booking email'])
on conflict(setting_key) do nothing;

commit;
