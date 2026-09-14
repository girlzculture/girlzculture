# Booking conversations and translation

Status: **AUTOMATED ONLY** for local database/API and recipient browser workflows. Hosted persistence and live notification/provider acceptance are **BLOCKED** by missing isolated configuration.

Each real booking is the conversation identity; there is no second chat subsystem. An immutable `booking_conversation_events` welcome record captures booking facts once per booking. The customer post-booking link selects `/account?tab=inbox&booking=<id>`; owners use `/salon/dashboard/messages/<id>`. Authorized support sees the conversation and the exact booking policy snapshot without changing customer/business read receipts.

The support conversation is embedded in the existing `/admin/bookings/<id>` editor, subject to the existing page permission and the message API's fresh support authorization. The conversation is read-only for support; existing controlled booking-management actions retain their separate permissions and audit requirements. Browser coverage includes customer, permitted team and support views in five locales at 390/768/1440, saved policy/version detail, exact original display/reply, refresh and no support composer. Role-specific fixtures are explicit; real authorization is separately asserted at the API/database boundary.

## Original content and delivery

Messages preserve exact original body and whitespace. Sender/request UUID uniqueness makes retries idempotent; reuse with different text or booking returns a conflict. Immutable original/source fields cannot be rewritten. The existing notification table receives one in-app notification per message via a transaction trigger. External email/SMS/push reuse existing Engine notification configuration and the existing channel delivery claims, keyed by message ID. Retrying a saved message retries failed channels without intentionally duplicating delivered ones. A notification failure leaves the saved message intact and returns its protected incident reference.

Every API request checks the authenticated user, canonical active identity/email/role and current booking membership. Active team membership requires booking permission. Invitation, revocation, a different tenant or a support-less admin cannot read/send. Unexpected authorization-query errors fail closed with JSON and a protected reference. This does not rely on the model to decide access.

## Recipient display translation

The viewer's chosen locale determines display translation independently for each recipient. The API fetches the authorized original itself; it does not trust client-supplied source text. A source hash and unique message/locale cache retain display text separately. Translation jobs use a bounded lease and the existing Engine translation provider, spend reservation, timeout and audit mechanisms.

Known participant/service/business names, identifiers, URLs, numeric prices and times are protected before translation and must survive restoration exactly. Invented, missing or duplicated protected tokens fail validation. Provider/cache failure falls back to the original; it never blocks original delivery. The UI discloses translated display and offers Show original. Historical unknown source locale is not guessed as reviewed. Existing sender preview functionality remains available, independently of recipient display.

## Guest decision — explicitly deferred

Guest reply-capable messaging is **deferred**. Existing messages require an authenticated sender user and participant RLS. A guest management token authorizes the established booking-management actions; it must not silently grant a new send-message permission, impersonate a registered customer or be replaced with an email-only lookup. Extending token purpose, revocation/expiry, replay/rate controls, sender audit identity, notification links and participant RLS requires its own end-to-end guest security acceptance before enabling replies.

Guests retain the existing expiring secure management/contact flow. Notifications use that tokenized link; no token or connection string is exposed in documentation. This defer decision does not claim that guest two-way chat is implemented.
