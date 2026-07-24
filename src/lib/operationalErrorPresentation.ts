type ErrorPresentationInput = {
  feature?: unknown;
  action?: unknown;
  route?: unknown;
  actor_role?: unknown;
  user_safe_message?: unknown;
  metadata?: unknown;
};

export type OperationalErrorPresentation = {
  title: string;
  explanation: string;
  impact: string;
  recommendedAction: string;
  category: "live-updates" | "maps" | "booking" | "payments" | "communications" | "media" | "identity" | "platform";
};

const text = (value: unknown) => String(value || "").toLowerCase();

export function operationalErrorPresentation(
  event: ErrorPresentationInput,
): OperationalErrorPresentation {
  const haystack = [
    event.feature,
    event.action,
    event.route,
    JSON.stringify(event.metadata || {}),
  ].map(text).join(" ");
  const explanation = String(event.user_safe_message || "").trim();
  const safeExplanation = explanation && explanation.length <= 500
    ? explanation
    : "A platform operation did not complete and needs administrator review.";

  if (/realtime|live-update|websocket/.test(haystack)) {
    return { title: "Live dashboard updates are temporarily degraded", explanation: safeExplanation, impact: "Salon dashboards may update after a short delay, but saved records remain safe.", recommendedAction: "Check Supabase Realtime status. Owners can continue using the dashboard while polling keeps records current.", category: "live-updates" };
  }
  if (/maps|geocod|location-provider/.test(haystack)) {
    return { title: "Salon map or location lookup is unavailable", explanation: safeExplanation, impact: "Customers can still use salon list results, but a map or address lookup may be delayed.", recommendedAction: "Check the Maps provider and retry the location operation. Do not remove valid list results.", category: "maps" };
  }
  if (/stripe|payment|billing|refund|payout|subscription/.test(haystack)) {
    return { title: "A payment operation needs attention", explanation: safeExplanation, impact: "A booking deposit, refund, payout, or subscription state may need reconciliation before staff acts on it.", recommendedAction: "Compare the Stripe event ledger with the Girlz Culture finance record before retrying or changing payment status.", category: "payments" };
  }
  if (/booking|availability|reschedul|calendar/.test(haystack)) {
    return { title: "A booking or calendar operation needs attention", explanation: safeExplanation, impact: "A customer or salon may be unable to complete a booking change until the operation is reviewed.", recommendedAction: "Open the affected booking, confirm availability and payment state, then retry only if no duplicate action was recorded.", category: "booking" };
  }
  if (/notification|email|sms|twilio|resend|push|message/.test(haystack)) {
    return { title: "A customer communication was not delivered", explanation: safeExplanation, impact: "The underlying record may be saved, but one recipient may not have received an email, text, push alert, or message notice.", recommendedAction: "Confirm the saved record first, check the delivery provider, and resend only the missing communication.", category: "communications" };
  }
  if (/storage|media|image|video|codec|upload/.test(haystack)) {
    return { title: "A media upload or processing task failed", explanation: safeExplanation, impact: "An image or video may be missing or waiting for a safe browser-compatible derivative.", recommendedAction: "Inspect the media job, source file limits, and storage status; retry processing without exposing the original provider error.", category: "media" };
  }
  if (/auth|session|identity|mfa|login/.test(haystack)) {
    return { title: "A sign-in or identity operation needs attention", explanation: safeExplanation, impact: "An authorized user may be unable to enter the correct account area until the session or identity link is verified.", recommendedAction: "Confirm the account role, identity link, session scope, and MFA state. Never bypass role checks.", category: "identity" };
  }
  return {
    title: "A platform operation needs attention",
    explanation: safeExplanation,
    impact: `${String(event.actor_role || "A user")} may be unable to complete this action until it is reviewed.`,
    recommendedAction: "Review the affected record and sanitized technical details, assign an owner, and verify the operation before retrying.",
    category: "platform",
  };
}
